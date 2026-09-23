#!/usr/bin/env node
/**
 * 只读收集审查范围，并建议报告路径。
 * 用法: node scripts/prepare-review.mjs [workspaceRoot]
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || process.cwd());

/**
 * 执行 git，并把标准输出当作字符串返回。
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * git 失败时不抛出，便于探测可选的基线分支。
 * @param {string[]} args
 * @returns {{ ok: true, value: string } | { ok: false }}
 */
function tryGit(args) {
  try {
    return { ok: true, value: git(args) };
  } catch {
    return { ok: false };
  }
}

/** @returns {string} 本地时间戳，精确到秒 */
function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-") + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * 查找项目自定义规范和 Cursor 规则。路径使用斜杠，便于写进报告。
 * @param {string} workspace
 * @returns {string[]}
 */
function listStandards(workspace) {
  const found = [];
  for (const relative of ["code-review-standards.md", path.join(".cursor", "code-review-standards.md")]) {
    if (fs.existsSync(path.join(workspace, relative))) {
      found.push(relative.split(path.sep).join("/"));
    }
  }
  const rulesDir = path.join(workspace, ".cursor", "rules");
  if (fs.existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
    const names = fs.readdirSync(rulesDir)
      .filter((name) => /\.(md|mdc|markdown)$/i.test(name))
      .sort();
    for (const name of names) {
      found.push(`.cursor/rules/${name}`);
    }
  }
  return found;
}

/**
 * 把分支名收成适合文件名的短标签。
 * @param {string | null} text
 */
function slug(text) {
  const cleaned = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 40) || "review";
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function lines(text) {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

const inside = tryGit(["rev-parse", "--is-inside-work-tree"]);
const result = {
  workspace: root,
  isGitRepo: inside.ok && inside.value === "true",
  mode: "paths",
  base: null,
  head: null,
  branch: null,
  files: [],
  standards: listStandards(root),
  empty: false,
  emptyReason: null,
  reportPath: null,
};

if (result.isGitRepo) {
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  result.branch = branch.ok ? branch.value : null;
  const head = tryGit(["rev-parse", "HEAD"]);
  result.head = head.ok ? head.value : null;

  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    if (tryGit(["rev-parse", "--verify", "--quiet", candidate]).ok) {
      result.base = candidate;
      break;
    }
  }

  const status = tryGit(["status", "--porcelain"]);
  const dirty = status.ok && status.value.length > 0;
  if (dirty) {
    result.mode = "working-tree";
    const tracked = result.head ? tryGit(["diff", "--name-only", "HEAD"]) : { ok: false };
    const untracked = tryGit(["ls-files", "--others", "--exclude-standard"]);
    result.files = lines(
      [tracked.ok ? tracked.value : "", untracked.ok ? untracked.value : ""].filter(Boolean).join("\n"),
    );
  } else if (result.base && result.head) {
    result.mode = "branch";
    const diff = tryGit(["diff", "--name-only", `${result.base}...HEAD`]);
    result.files = diff.ok ? lines(diff.value) : [];
  } else if (result.head) {
    result.mode = "head";
    const diff = tryGit(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
    result.files = diff.ok ? lines(diff.value) : [];
  }

  const scope = result.mode === "working-tree" ? "working-tree" : slug(result.branch);
  result.reportPath = path.join(root, "code-review-reports", `${stamp()}-${scope}.md`);
} else {
  result.reportPath = path.join(root, "code-review-reports", `${stamp()}-review.md`);
}

result.empty = result.files.length === 0;
result.emptyReason = result.empty ? "没有可审查的改动" : null;

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
