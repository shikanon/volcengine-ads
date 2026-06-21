# Tasks
- [x] Task 1: 迁移客户侧 skills 目录。
  - [x] SubTask 1.1: 创建仓库根目录 `skills/`。
  - [x] SubTask 1.2: 将旧隐藏目录中的 skill 文档原样移动到 `skills/**`。
  - [x] SubTask 1.3: 确认每个迁移后的 skill 仍保持独立目录和 `SKILL.md`。
- [x] Task 2: 更新当前路径引用。
  - [x] SubTask 2.1: 搜索当前仓库中引用旧隐藏目录的说明文字。
  - [x] SubTask 2.2: 将面向当前项目使用的引用更新为 `skills/`。
  - [x] SubTask 2.3: 保留 `.trae/specs/add-workspace-skills/**` 中的历史路径记录，不回写历史规格。
- [x] Task 3: 清理旧目录并验证。
  - [x] SubTask 3.1: 删除迁移后的旧隐藏源目录。
  - [x] SubTask 3.2: 验证 `skills/**/SKILL.md` 文件数量与迁移前一致。
  - [x] SubTask 3.3: 运行轻量校验，确认没有构建或测试无关产物被误改。

# Task Dependencies
- Task 2 depends on Task 1.
- Task 3 depends on Tasks 1 and 2.
