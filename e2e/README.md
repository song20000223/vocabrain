# E2E 验收脚本

空数据起步的全链路验收：建词书 → 建章节 → 加单词/词组 → 导入 → 编辑释义 → 分页 → 抽选 → 测试 → 听写 → 错题 → 导出 → 备忘录 → 软删 → 再导出。共 19 项断言。

## 环境准备

```bash
pip install playwright
playwright install chromium
```

## 运行

```bash
# 1. 起开发服务器（必须 5199 端口，脚本写死了 BASE）
npx vite --port 5199

# 2. 另开终端跑脚本（脚本会自己清空 localStorage，从空数据开始）
python3 e2e/run.py
```

输出形如 `PASS 空数据默认词书+我的词组自动建` / `FAIL xxx`，结尾打印汇总 `19/19 通过`。

## 注意

- 输入一律用 `press_sequentially`，`fill()` 不触发本项目的 React 受控输入。
- 编辑类输入前先 `press("Control+a")` 清空。
- 测试预览需点两次「开始测试」（第一次出预览，第二次正式开始）。
- 章节管理是 `<details>` 折叠面板，脚本里用 `page.evaluate` 强制展开。
- 不要用种子词（如 plateau）当测试词，会撞上默认词书的种子数据；E2E 用 canyon 等词。
- 脚本会触发文件下载（CSV 导出），Playwright 上下文已开 `accept_downloads`。

每个 S 步完成后跑一遍，19/19 全绿才算过。
