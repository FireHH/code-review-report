---
name: code-review-report
description: >-
  Reviews code for bugs, null dereferences, logic errors, latent risks,
  security issues, efficiency problems, and project coding standards, then
  writes a Markdown report under code-review-reports/. Use when the user asks
  for a code review, review report, 代码审查, 审查报告, 空指针, 逻辑错误, bug,
  隐患, 效率, 漏洞, 可优化, or 代码规范.
---

# 代码审查报告

审查指定代码，找出有证据的缺陷、隐患、漏洞、规范问题和效率问题，并在被审查项目里写一份 Markdown 报告。默认只写报告，不改业务代码。

## 边界

- 报告用用户请求的语言。用户用中文时，报告用中文。
- 每条问题都要有文件位置和代码证据。没有读到的代码，写入「未验证项」，不要当成发现。
- 每条发现的「修改建议」都要有改前和改后片段。改前只摘现有代码，改后只写修复后的代码。不要写利用代码、PoC、攻击载荷、绕过步骤，或可以直接复现攻击的命令。
- 不报告纯风格问题，除非项目自定义规范明确要求。
- 效率问题必须说明代价（CPU、内存、I/O、查询次数或复杂度）以及在什么数据量下值得改。

## 归类

| 现象 | 小节 | 编号 |
| --- | --- | --- |
| 空指针、逻辑错误、算错结果、把失败当成成功 | 缺陷 | `BUG` |
| 边界未处理、空捕获、并发修改，但还不能证明一定出错 | 隐患 | `RISK` |
| 注入、越权、敏感数据 | 漏洞 | `SEC` |
| 只违反项目规范，还构不成上面三类 | 规范 | `STD` |
| 重复查询、无界加载、热路径变慢 | 可优化项 | `OPT` |

同一处代码只记一条，归到上表里更靠前且确实成立的一类。

## 流程

1. 确定范围。
   - 用户给了路径或 diff：只审查这些内容。
   - 否则在被审查项目根目录运行：

     ```bash
     node <plugin-root>/scripts/prepare-review.mjs <workspace-root>
     ```

     `<plugin-root>` 是本插件根目录。从本技能文件向上两级就是插件根目录。
   - 有未提交改动时审查工作区；否则审查当前分支相对基线的差异。
   - `empty` 为 true 且用户没有指定路径时，不要改成全仓审查。概要写「没有可审查的改动」，发现小节写「未发现问题。」，然后停止。
   - 用户明确要求全仓审查时，优先读空值处理、分支、循环、异常、认证鉴权、输入解析、SQL、命令、文件和网络调用。仓库很大时不要声称已读完全部文件。

2. 跳过 `node_modules`、`vendor`、`dist`、`build`、锁文件、压缩产物、生成代码和二进制文件。规范文件里的「不审查」也要跳过。

3. 读取自定义规范。
   - 用户指定了文件就用那个文件。
   - 否则使用 `prepare-review` 输出的 `standards`。其中包含 `code-review-standards.md`、`.cursor/code-review-standards.md`，以及 `.cursor/rules/` 下的规则文件。
   - `standards` 为空时，元数据写 `代码规范: 未提供`，「规范」小节只写 `未审查。` 并说明原因。
   - `standards` 不为空时，元数据写这些路径。违反「必须」至少记为 medium；只违反「建议」记为 low。`STD` 的「规范条款」要写明文件和原句。模板见插件的 `standards/code-review-standards.example.md`。

4. 先读 [defect-checklist.md](defect-checklist.md)，再读 [security-checklist.md](security-checklist.md) 和 [performance-checklist.md](performance-checklist.md)，最后对照自定义规范。清单只提供检查方向，结论必须来自当前代码。

5. 按 [report-template.md](report-template.md) 写报告。写法见 [examples.md](examples.md)。

6. 校验并修正，直到通过：

   ```bash
   node <plugin-root>/scripts/validate-report.mjs <report-path>
   ```

7. 在对话里给出报告路径、各级数量，以及最需要先处理的条目。不要把整份报告再贴一遍，除非用户要求。

## 严重级别

| 级别 | 何时使用 |
| --- | --- |
| critical | 必然会错误执行、空指针发生在主路径，或已能未授权访问敏感数据、密钥进入仓库。效率问题不用 |
| high | 缺陷或漏洞已经成立，但依赖一定输入；热路径上可观察到的数量级效率问题 |
| medium | 隐患会在常见边界出现；防护不完整；违反规范中的「必须」 |
| low | 影响面小的加固、效率改进，或只违反规范中的「建议」 |

置信度是「低」时，严重级别最高写 `low`。证据不足就放到「未验证项」。
