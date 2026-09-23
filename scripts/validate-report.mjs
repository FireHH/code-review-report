#!/usr/bin/env node
/**
 * 校验审查报告是否包含必需结构和可核对的数量。
 * 用法: node scripts/validate-report.mjs <report.md>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEVERITIES = ["critical", "high", "medium", "low"];
const CONFIDENCE = ["高", "中", "低"];
const REQUIRED_FIELDS = ["严重级别", "类别", "位置", "置信度", "问题", "证据", "影响", "修改建议"];
const FIELD_NAMES = [...REQUIRED_FIELDS, "规范条款"];
const REQUIRED_SECTIONS = ["概要", "缺陷", "隐患", "漏洞", "规范", "可优化项", "未验证项", "结论"];
const FINDING_SECTIONS = [
  { heading: "缺陷", prefix: "BUG", key: "bug", allowCritical: true },
  { heading: "隐患", prefix: "RISK", key: "risk", allowCritical: true },
  { heading: "漏洞", prefix: "SEC", key: "sec", allowCritical: true },
  { heading: "规范", prefix: "STD", key: "std", allowCritical: true },
  { heading: "可优化项", prefix: "OPT", key: "opt", allowCritical: false },
];

/**
 * 读取发现条目中的字段。修改建议和规范条款可以跨行，直到下一个字段。
 * @param {string} chunk
 * @returns {Record<string, string>}
 */
function readFields(chunk) {
  /** @type {Record<string, string>} */
  const fields = {};
  let current = null;
  for (const line of chunk.split(/\r?\n/)) {
    const matched = line.match(/^- ([^:]+):\s*(.*)$/);
    if (matched && FIELD_NAMES.includes(matched[1])) {
      current = matched[1];
      fields[current] = matched[2];
      continue;
    }
    if (current) {
      fields[current] = `${fields[current]}\n${line}`;
    }
  }
  return fields;
}

/**
 * @param {string} markdown
 * @param {string} heading
 * @returns {string | null}
 */
export function extractSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const startLine = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (startLine < 0) {
    return null;
  }
  let endLine = lines.length;
  for (let index = startLine + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      endLine = index;
      break;
    }
  }
  return lines.slice(startLine + 1, endLine).join("\n").trim();
}

/**
 * @param {string} section
 * @param {string} prefix
 * @returns {{ findings: Array<Record<string, string>>, errors: string[] }}
 */
function parseFindings(section, prefix, allowCritical = true) {
  const errors = [];
  if (!section || section === "未发现问题。" || section.startsWith("未审查。")) {
    return { findings: [], errors };
  }

  const chunks = section
    .split(/\n(?=### \[)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const findings = [];
  chunks.forEach((chunk, index) => {
    const heading = chunk.match(/^### \[((?:BUG|RISK|SEC|STD|OPT)-\d{3})\] \S+/);
    if (!heading) {
      errors.push(`${prefix} 小节第 ${index + 1} 段不是有效发现标题`);
      return;
    }
    const id = heading[1];
    if (!id.startsWith(prefix)) {
      errors.push(`${id} 出现在错误的小节`);
    }
    /** @type {Record<string, string>} */
    const fields = { id, ...readFields(chunk) };
    for (const name of REQUIRED_FIELDS) {
      if (!fields[name] || !fields[name].trim()) {
        errors.push(`${id} 缺少${name}`);
      }
    }
    const suggestion = (fields["修改建议"] || "").trim();
    if (suggestion && (!suggestion.includes("改前") || !suggestion.includes("改后"))) {
      errors.push(`${id} 的修改建议需要同时包含改前和改后`);
    }
    if (prefix === "STD" && !(fields["规范条款"] || "").trim()) {
      errors.push(`${id} 缺少规范条款`);
    }
    if (fields["严重级别"] && !SEVERITIES.includes(fields["严重级别"])) {
      errors.push(`${id} 的严重级别无效`);
    }
    if (!allowCritical && fields["严重级别"] === "critical") {
      errors.push(`${id} 不能使用 critical`);
    }
    if (fields["置信度"] && !CONFIDENCE.includes(fields["置信度"])) {
      errors.push(`${id} 的置信度无效`);
    }
    if (fields["位置"] && !/`[^`\n]+:\d+/.test(fields["位置"])) {
      errors.push(`${id} 的位置需要带行号，例如 \`src/a.js:10\``);
    }
    findings.push(fields);
  });

  const ids = findings.map((finding) => finding.id);
  if (new Set(ids).size !== ids.length) {
    errors.push(`${prefix} 编号重复`);
  }
  return { findings, errors };
}

/**
 * @param {string} summary
 * @returns {Record<string, { bug: number, risk: number, sec: number, std: number, opt: number }>}
 */
function parseCounts(summary) {
  /** @type {Record<string, { bug: number, risk: number, sec: number, std: number, opt: number }>} */
  const counts = {};
  for (const line of summary.split(/\r?\n/)) {
    const matched = line.match(/^\|\s*(critical|high|medium|low)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/i);
    if (matched) {
      counts[matched[1].toLowerCase()] = {
        bug: Number(matched[2]),
        risk: Number(matched[3]),
        sec: Number(matched[4]),
        std: Number(matched[5]),
        opt: Number(matched[6]),
      };
    }
  }
  return counts;
}

/**
 * @param {string} markdown
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateReport(markdown) {
  const errors = [];
  if (!markdown.split(/\r?\n/)[0].startsWith("# 代码审查报告")) {
    errors.push("标题必须是「# 代码审查报告」");
  }
  for (const label of ["审查时间", "审查范围", "代码规范"]) {
    if (!new RegExp(`^- ${label}: \\S+`, "m").test(markdown)) {
      errors.push(`缺少${label}`);
    }
  }

  /** @type {Record<string, string>} */
  const sections = {};
  for (const heading of REQUIRED_SECTIONS) {
    const body = extractSection(markdown, heading);
    if (body === null || body.length === 0) {
      errors.push(`缺少小节「${heading}」`);
      sections[heading] = "";
    } else {
      sections[heading] = body;
    }
  }

  const parsed = FINDING_SECTIONS.map((section) => ({
    ...section,
    ...parseFindings(sections[section.heading], section.prefix, section.allowCritical),
  }));
  for (const section of parsed) {
    errors.push(...section.errors);
  }

  const standards = markdown.match(/^- 代码规范: (.+)$/m);
  const standardsValue = standards ? standards[1].trim() : "";
  const standardsBody = sections["规范"] || "";
  if (standardsValue === "未提供" && !standardsBody.startsWith("未审查。")) {
    errors.push("未提供代码规范时，「规范」小节必须写未审查。");
  }

  const counts = parseCounts(sections["概要"]);
  for (const severity of SEVERITIES) {
    if (!counts[severity]) {
      errors.push(`概要表缺少 ${severity}`);
      continue;
    }
    for (const section of parsed) {
      const actual = section.findings.filter((item) => item["严重级别"] === severity).length;
      if (counts[severity][section.key] !== actual) {
        errors.push(`${severity} 的${section.heading}数量不一致：表为 ${counts[severity][section.key]}，正文为 ${actual}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function runCli() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    process.stderr.write("用法: node scripts/validate-report.mjs <report.md>\n");
    process.exit(2);
  }
  const absolute = path.resolve(reportPath);
  const markdown = fs.readFileSync(absolute, "utf8");
  const result = validateReport(markdown);
  if (!result.ok) {
    process.stderr.write(result.errors.map((error) => `- ${error}`).join("\n") + "\n");
    process.exit(1);
  }
  process.stdout.write(`报告通过校验: ${absolute}\n`);
}

const invokedDirectly = Boolean(process.argv[1])
  && path.resolve(process.argv[1]).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invokedDirectly) {
  runCli();
}
