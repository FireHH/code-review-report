# 代码审查报告

Cursor 插件。审查空指针、逻辑错误、缺陷、隐患、安全漏洞、效率问题，以及项目自己的代码规范，并生成一份 Markdown 报告。

报告只记录有代码证据的问题。每条修改建议都包含改前和改后代码，改后只写修复结果，不写利用步骤。

## 报告里有什么

1. 概要，以及缺陷、隐患、漏洞、规范、可优化各自的数量
2. 缺陷：空指针、逻辑错误、错误结果、把失败当成成功
3. 隐患：边界未处理、空捕获、并发修改等尚未证实一定出错的问题
4. 漏洞：注入、越权、敏感数据
5. 规范：项目自定义规范里写明、且没有归入上面几类的问题
6. 可优化项：重复查询、无界加载、热路径上的效率问题
7. 未验证项和结论

报告默认写到被审查项目的 `code-review-reports/`。这个目录可以加入项目的 `.gitignore`。

## 自定义代码规范

在被审查项目里新增 `code-review-standards.md`，或 `.cursor/code-review-standards.md`。`.cursor/rules/` 里的规则也会一并检查。规范文件分三段：

1. `必须`：违反后至少记为 medium
2. `建议`：只违反建议时记为 low
3. `不审查`：跳过的目录或文件

可从插件的 `standards/code-review-standards.example.md` 复制后改成自己的规则。没有规范文件、也没有 Cursor 规则时，仍审查缺陷、隐患、漏洞和效率问题，「规范」一节会写明未审查。工作区干净且当前分支没有相对基线的差异时，不会自动扩大到全仓。同一处代码如果已经记成缺陷或漏洞，不会再记一条规范问题。

## 本地安装

Node.js 18 或以上。Cursor 从 `%USERPROFILE%\.cursor\plugins\local` 加载本地插件。把本仓库**复制**到该目录下，不要用指向仓库外部的符号链接。

1. 复制整个目录：

   ```powershell
   $dest = Join-Path $env:USERPROFILE ".cursor\plugins\local\code-review-report"
   New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
   Copy-Item -Recurse -Force "E:\code\gncp-glodon\cursor-code-review" $dest
   ```

2. 在 Cursor 中执行 `Developer: Reload Window`。
3. 打开 Customize，确认能看到「代码审查报告」、技能 `code-review-report` 和命令 `review-report`。

如果企业空间关闭了本地插件导入，需要管理员打开 Dashboard → Settings → Security & Identity → Marketplace and Plugins 里的 Allow Local Plugin Imports。

## 使用

在项目对话里任选一种：

1. 输入 `/review-report`
2. 说「审查当前改动，生成审查报告」
3. 说「按项目代码规范审查 src/api，包括空指针、逻辑错误和效率问题」

没有指定路径时：

1. 有未提交改动，就审查工作区
2. 没有改动，就审查当前分支相对 `main` 或 `master` 的差异
3. 只有明确要求全仓审查时，才按风险入口扩读，并在报告里写明没有覆盖的部分

## 开发校验

```powershell
node --test scripts/review-tools.test.mjs
```

`scripts/prepare-review.mjs` 只读 git 状态并建议报告路径。`scripts/validate-report.mjs` 检查报告标题、字段和数量是否一致。

## 发布到 Cursor 插件市场

插件以公开 Git 仓库提交，由 Cursor 审核后上架。发布前把 `.cursor-plugin/plugin.json` 里的 `author.name` 改成你的名字或组织，并确认 `logo` 指向仓库内的 `assets/logo.svg`。

1. 把本目录推到一个公开 Git 仓库。
2. 打开 [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)，提交仓库地址。
3. 确认清单：根目录有 `.cursor-plugin/plugin.json`，`name` 为小写 kebab-case，技能和命令都有 frontmatter，README 说明了用法。
4. 等待人工审核。更新时向同一仓库推送，并按市场页面的流程提交更新。

团队内部分发可以不走公开市场：在 Dashboard → Plugins & MCPs 中用 Import from Repo 导入这个仓库，作为 Team Marketplace。
