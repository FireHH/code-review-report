import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { validateReport } from "./validate-report.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const prepareScript = path.join(here, "prepare-review.mjs");

function finding(id, severity) {
  const prefix = id.startsWith("SEC") ? "SQL 注入" : "数据库查询";
  return `### [${id}] 示例问题

- 严重级别: ${severity}
- 类别: ${prefix}
- 位置: \`src/app.js:12\`
- 置信度: 高
- 问题: 这里有一个已读到的具体问题。
- 证据: 第 12 行把外部输入直接拼进调用。
- 影响: 会扩大数据访问范围或增加查询次数。
- 修改建议:
  改前: \`value = input + value\`
  改后: \`value = bind(input)\`${id.startsWith("STD") ? "\n- 规范条款: code-review-standards.md「必须」：捕获异常后不能当作成功" : ""}`;
}

function report({
  bug = [],
  risk = [],
  security = [],
  standard = [],
  performance = [],
  standardsLine,
} = {}) {
  const groups = [
    ["bug", bug, "未发现问题。"],
    ["risk", risk, "未发现问题。"],
    ["sec", security, "未发现问题。"],
    ["std", standard, standardsLine === "code-review-standards.md" ? "未发现问题。" : "未审查。项目未提供自定义规范。"],
    ["opt", performance, "未发现问题。"],
  ];
  const count = (items, severity) => items.filter((item) => item.severity === severity).length;
  const row = (severity) => `| ${severity} | ${groups.map(([, items]) => count(items, severity)).join(" | ")} |`;
  const body = (items, empty) => (items.length === 0 ? empty : items.map((item) => finding(item.id, item.severity)).join("\n\n"));
  const standards = standardsLine ?? (standard.length > 0 ? "code-review-standards.md" : "未提供");
  const standardEmpty = standards === "未提供"
    ? "未审查。项目未提供自定义规范。"
    : "未发现问题。";
  return `# 代码审查报告

- 审查时间: 2026-09-23 15:00
- 审查范围: working-tree
- 基准: 无
- 对比: HEAD
- 文件数: 1
- 代码规范: ${standards}

## 概要

审查了当前改动。

| 级别 | 缺陷 | 隐患 | 漏洞 | 规范 | 可优化 |
| --- | ---: | ---: | ---: | ---: | ---: |
${SEVERITY_ROWS.map(row).join("\n")}

## 缺陷

${body(bug, "未发现问题。")}

## 隐患

${body(risk, "未发现问题。")}

## 漏洞

${body(security, "未发现问题。")}

## 规范

${body(standard, standardEmpty)}

## 可优化项

${body(performance, "未发现问题。")}

## 未验证项

- 没有运行测试。

## 结论

按表中的高优先级处理。
`;
}

const SEVERITY_ROWS = ["critical", "high", "medium", "low"];

test("空报告可以通过校验", () => {
  const result = validateReport(report());
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("发现数量必须和概要表一致", () => {
  const result = validateReport(report({
    bug: [{ id: "BUG-001", severity: "high" }],
    risk: [{ id: "RISK-001", severity: "medium" }],
    security: [{ id: "SEC-001", severity: "high" }],
    standard: [{ id: "STD-001", severity: "low" }],
    performance: [{ id: "OPT-001", severity: "medium" }],
  }));
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("没有自定义规范时不能把规范小节写成未发现问题", () => {
  const broken = report().replace("未审查。项目未提供自定义规范。", "未发现问题。");
  const result = validateReport(broken);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /规范/);
});

test("缺少证据时校验失败", () => {
  const broken = report({
    security: [{ id: "SEC-001", severity: "high" }],
  }).replace("- 证据: 第 12 行把外部输入直接拼进调用。\n", "");
  const result = validateReport(broken);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /缺少证据/);
});

test("修改建议必须同时包含改前和改后", () => {
  const broken = report({
    bug: [{ id: "BUG-001", severity: "high" }],
  }).replace("改前: `value = input + value`\n  ", "");
  const result = validateReport(broken);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /改前和改后/);
});

test("规范问题必须引用条款", () => {
  const broken = report({
    standard: [{ id: "STD-001", severity: "low" }],
  }).replace("- 规范条款: code-review-standards.md「必须」：捕获异常后不能当作成功", "");
  const result = validateReport(broken);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /缺少规范条款/);
});

test("优化项不能标成 critical", () => {
  const result = validateReport(report({
    performance: [{ id: "OPT-001", severity: "critical" }],
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /不能使用 critical/);
});

test("prepare-review 只读列出未提交文件", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "code-review-"));
  const git = (args) => {
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], {
      cwd: repo,
      stdio: "ignore",
    });
  };
  try {
    git(["init"]);
    writeFileSync(path.join(repo, "app.js"), "export const value = 1;\n");
    mkdirSync(path.join(repo, ".cursor", "rules"), { recursive: true });
    writeFileSync(path.join(repo, "code-review-standards.md"), "# 代码规范\n");
    writeFileSync(path.join(repo, ".cursor", "rules", "style.mdc"), "---\ndescription: style\n---\n");
    git(["add", "."]);
    git(["commit", "-m", "init"]);

    const clean = spawnSync(process.execPath, [prepareScript, repo], { encoding: "utf8" });
    assert.equal(clean.status, 0, clean.stderr);
    const cleanPayload = JSON.parse(clean.stdout);
    assert.equal(cleanPayload.empty, true);
    assert.equal(cleanPayload.emptyReason, "没有可审查的改动");
    assert.deepEqual(cleanPayload.files, []);
    assert.deepEqual(cleanPayload.standards, [
      "code-review-standards.md",
      ".cursor/rules/style.mdc",
    ]);

    writeFileSync(path.join(repo, "app.js"), "export const value = 2;\n");

    const result = spawnSync(process.execPath, [prepareScript, repo], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.mode, "working-tree");
    assert.equal(payload.empty, false);
    assert.deepEqual(payload.files, ["app.js"]);
    assert.match(payload.reportPath, /code-review-reports[\\/]\d{4}-\d{2}-\d{2}-\d{6}-working-tree\.md$/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
