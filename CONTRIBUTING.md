# 贡献指南

## 工作流

- 一切变更走 PR，main 受保护；合并经 merge queue（组合 SHA 重验）
- 契约变更用 `contract_pr` 模板，实现变更用 `feature_pr` 模板
- 每个 PR 必须通过 `CI / Required` 与 `Review / Required` 两个门禁

### PR 状态约定

| 状态 | 门禁行为 |
| :--- | :--- |
| draft | 不跑任何门禁 job（显式排除） |
| ready（opened/ready_for_review） | 全量门禁：CI → AI review |
| 后续 push（synchronize） | 重跑门禁，AI review 复用同一会话复查 |
| merge queue（merge_group） | 在组合 SHA 上重验全部门禁，AI review 独立会话全量审查 |

## 语言

- 文档、注释、Issue/PR 内容使用中文
- 代码标识符使用英文，与术语表（`context.md`）保持一致
