import json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5199"
PASS = []
def ok(name, cond, extra=""):
    PASS.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), name, extra)

def answer_loop(page, n, wrong_words, source_label):
    """答 n 题；对 wrong_words 里的词故意答错（用必错答案，避开本地极速判定）"""
    for _ in range(n):
        card = page.locator("body").inner_text().split("在这里")[0]
        wrong = next((w for w in wrong_words if w in card), None)
        # 「完全错的答案」包含本地命中的子串（如 chamber 的义项「答」），
        # 会被极速判定误判为对——统一用必错的「天气真好」
        ans = "天气真好"
        page.locator("textarea").first.press_sequentially(ans)
        page.click("button:has-text('提交答案')")
        # 等判分结果出现（AI 判分可能 5 秒以上），再点下一个
        for _ in range(30):
            page.wait_for_timeout(500)
            body_now = page.locator("body").inner_text()
            if "回答正确" in body_now or "回答错误" in body_now:
                break
        page.wait_for_timeout(300)
        for label in ["下一个单词", "下一个", "查看结果", "完成", "结束"]:
            btn = page.locator(f"button:has-text('{label}')").first
            if btn.count():
                btn.click(); page.wait_for_timeout(600); break

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width":1280,"height":900}, accept_downloads=True)
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())

    # ---- 空数据起 ----
    page.goto(BASE + "/words", wait_until="networkidle")
    page.evaluate("localStorage.clear()")
    page.goto(BASE + "/words", wait_until="networkidle")
    body = page.locator("body").inner_text()
    ok("空数据默认词书+我的词组自动建", "默认词书" in body and "我的词组" in body)

    # ---- 建词书+章节+加词+词组+导入 ----
    page.locator("input[placeholder='新词书名称，如 雅思核心']").press_sequentially("雅思真经")
    page.click("button:has-text('新建')"); page.wait_for_timeout(400)
    page.locator("button:has-text(\"点开 →\")").filter(has_text="雅思真经").first.click(); page.wait_for_timeout(400)
    page.evaluate("() => { document.querySelector('details').open = true; }")
    page.wait_for_timeout(300)
    page.locator("input[placeholder='新章节名称，如 Unit 1']").press_sequentially("Unit 1")
    page.locator("input[placeholder='新章节名称，如 Unit 1']").press("Enter"); page.wait_for_timeout(400)
    page.locator("button[aria-label='关闭']").click(); page.wait_for_timeout(300)
    page.locator("select").first.select_option(label="↳ Unit 1")
    page.locator("input[placeholder='英文单词，如 plateau']").press_sequentially("abandon")
    page.locator("input[placeholder='中文义项，多个用分号隔开，如 高原；平稳期']").press_sequentially("放弃；抛弃")
    page.locator("button", has_text="添加").last.click(); page.wait_for_timeout(400)
    page.click("button:has-text('添加词组')"); page.wait_for_timeout(200)
    page.locator("input[placeholder='英文词组，如 take into account']").press_sequentially("take into account")
    page.locator("input[placeholder='中文义项，多个用分号隔开，如 高原；平稳期']").press_sequentially("考虑到")
    page.locator("button", has_text="添加").last.click(); page.wait_for_timeout(400)
    page.locator("select").first.select_option(label="↳ Unit 1")
    page.locator("textarea").first.press_sequentially("chamber\tn. 腔, 室; 议院\ncanyon n. 峡谷", delay=20)
    page.locator("section", has_text="批量导入").locator("button", has_text="导入").click(); page.wait_for_timeout(600)
    words = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_words'))")
    mine = [w for w in words if w["word"] in ("abandon","chamber","canyon","take into account")]
    ok("单词+词组+导入共 4 条", len(mine)==4, f"{len(mine)}")
    ch_words = [w for w in mine if w["word"] != "take into account"]
    ok("章节 3 词序号连续", sorted(w["orderInBook"] for w in ch_words)==[1,2,3])
    ok("导入逗号拆义项", next(w for w in mine if w["word"]=="chamber")["meanings"][0]["definitions"]==["腔","室","议院"])
    ok("词组进我的词组", next(w for w in mine if w["word"]=="take into account")["bookId"]=="__phrase_book__")

    # ---- 编辑+笔记 ----
    page.locator("button:has-text(\"点开 →\")").filter(has_text="雅思真经").first.click(); page.wait_for_timeout(400)
    page.evaluate("() => { document.querySelector('details').open = true; }")
    page.locator("button", has_text="↳ Unit 1").first.click(); page.wait_for_timeout(400)
    page.get_by_label("编辑 abandon 的释义").click(); page.wait_for_timeout(200)
    ei = page.locator("li.glass-card", has_text="abandon").locator("input").first
    ei.click(); ei.press("Control+a"); ei.press_sequentially("放弃；抛弃；遗弃")
    page.locator("button", has_text="保存").last.click(); page.wait_for_timeout(400)
    w1 = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_words')).find(w => w.word==='abandon')")
    ok("编辑持久化", w1["meanings"][0]["definitions"]==["放弃","抛弃","遗弃"])
    page.get_by_label("查看 abandon 的关联笔记").click(); page.wait_for_timeout(200)
    page.click("button:has-text('新建关联笔记')")
    page.locator("input[placeholder='笔记标题']").press_sequentially("abandon 搭配")
    page.locator("textarea[placeholder='内容…']").press_sequentially("abandon oneself to")
    page.locator("button", has_text="保存").last.click(); page.wait_for_timeout(400)
    memos = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_memos'))")
    ok("行笔记关联", len(memos)==1 and memos[0]["relatedWordIds"]==[w1["id"]])
    page.goto(BASE + "/memos", wait_until="networkidle")
    ok("备忘录页可见", "abandon 搭配" in page.locator("body").inner_text())

    # ---- 新增断言：excludeTested 默认勾 + count 转轴生效 ----
    page.goto(BASE + "/test", wait_until="networkidle")
    page.wait_for_timeout(400)
    # 默认勾「排除已测」
    excl = page.locator("text=排除已测").first
    checked = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_test_options')||'null')")
    ok("excludeTested 默认 true", checked is None or checked.get("excludeTested") == True)
    # 输入框设 2，转轴联动
    num = page.locator("input[aria-label='抽取数量']")
    num.press_sequentially("2") if False else None
    num.click(); num.press("Control+a"); num.press_sequentially("2"); num.blur(); page.wait_for_timeout(300)
    opts = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_test_options'))")
    ok("count 输入框持久化为 2", opts["count"] == 2, str(opts["count"]))

    # ---- 测试（canyon 答错） ----
    page.goto(BASE + "/test", wait_until="networkidle")
    page.locator("button").filter(has_text="雅思真经").last.click(); page.wait_for_timeout(300)
    ok("父节点范围置灰提示", "章节" in page.locator("body").inner_text())
    # count 已在前序断言持久化为 2；恢复 3，避免队列长度不符
    num = page.locator("input[aria-label='抽取数量']")
    num.click(); num.press("Control+a"); num.press_sequentially("3"); num.blur(); page.wait_for_timeout(300)
    page.locator("button.glow-btn", has_text="开始测试").click(); page.wait_for_timeout(900)
    # 若 0 命中（上一轮测试残留进度），取消「排除已测」再试
    if "无匹配单词" in page.locator("body").inner_text():
        page.locator("text=排除已测").first.click(); page.wait_for_timeout(400)
        page.locator("button.glow-btn", has_text="开始测试").click(); page.wait_for_timeout(900)
    page.locator("button.glow-btn", has_text="开始测试").click(); page.wait_for_timeout(900)  # 预览→开考
    answer_loop(page, 3, ["canyon"], "quiz")
    import time
    time.sleep(1)  # 等异步判分回写
    wrong = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_wrong_book')||'[]')")
    ok("答错进错题本(quiz)", any(w["word"]=="canyon" and w["source"]=="quiz" for w in wrong), str(wrong)[:80])
    wc = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_words')).find(w=>w.word==='canyon')")
    ok("测试更新 testedRounds", wc["testedRounds"]>=1)

    # ---- 只重测错题：quiz 答完回设置页，回顾区按钮 → 新一轮 ----
    # answer_loop 最后一题点击后 onFinish 已触发，此时在设置页、lastReview 已填充
    ok("回顾区「只重测错题」按钮出现", "只重测错题" in page.locator("body").inner_text())
    page.locator("button", has_text="只重测错题").click(); page.wait_for_timeout(900)
    ok("重测错题进入新一轮", page.locator("textarea").count() >= 1)
    page.locator("button", has_text="退出测试").click(); page.wait_for_timeout(500)

    # ---- 中途退出重抽：已测词不再出现（excludeTested 默认勾） ----
    page.reload(wait_until="networkidle"); page.wait_for_timeout(400)
    # 全部 3 词都已测过（answer_loop 答了 3 题）→ 预览应 0 命中
    page.locator("button").filter(has_text="雅思真经").last.click(); page.wait_for_timeout(300)
    page.locator("button.glow-btn", has_text="开始测试").click(); page.wait_for_timeout(900)
    body = page.locator("body").inner_text()
    ok("中途退出重抽已测词被排除", "无匹配单词" in body or "命中 0" in body, body[body.find("命中"):body.find("命中")+15] if "命中" in body else "")
    # 手动取消排除已测 → 能抽到
    page.locator("text=排除已测").first.click(); page.wait_for_timeout(300)
    opts2 = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_test_options'))")
    ok("取消勾后持久化 excludeTested=false", opts2["excludeTested"] == False)
    page.locator("text=排除已测").first.click(); page.wait_for_timeout(300)  # 恢复勾选，不影响后续听写段


    # ---- 听写（全答错） ----
    page.goto(BASE + "/test", wait_until="networkidle")
    page.click("button:has-text('听写')")
    page.wait_for_timeout(300)
    # 默认勾「排除已测」，前序 quiz 已测过 → 取消勾选再开
    if "排除已测" in page.locator("body").inner_text():
        page.locator("text=排除已测").first.click(); page.wait_for_timeout(400)
    page.locator("button.glow-btn", has_text="开始听写").click(); page.wait_for_timeout(900)
    page.locator("button.glow-btn", has_text="开始听写").click(); page.wait_for_timeout(900)  # 预览→开考
    before = {w["word"]: w["testedRounds"] for w in page.evaluate("() => JSON.parse(localStorage.getItem('vocab_words'))") if w["word"] in ("abandon","chamber","canyon")}
    answer_loop(page, 3, ["abandon","chamber","canyon"], "dictation")
    if page.locator("button:has-text('完成')").count():
        page.click("button:has-text('完成')"); page.wait_for_timeout(500)
    wrong2 = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_wrong_book')||'[]')")
    ok("听写错误进错题本(dictation)", any(w["source"]=="dictation" for w in wrong2))
    after = {w["word"]: w["testedRounds"] for w in page.evaluate("() => JSON.parse(localStorage.getItem('vocab_words'))") if w["word"] in ("abandon","chamber","canyon")}
    ok("听写不动 testedRounds", before==after)
    ok("「导出本次结果」出现", "导出本次结果" in page.locator("body").inner_text())

    # ---- wrongStreak：quiz 答错 canyon + 听写全错 → 三者都 ≥1 ----
    streaks = {w["word"]: w.get("wrongStreak", 0) for w in page.evaluate("() => JSON.parse(localStorage.getItem('vocab_words'))") if w["word"] in ("abandon","chamber","canyon")}
    ok("答错累计 wrongStreak", all(v >= 1 for v in streaks.values()), str(streaks))

    # ---- 优先错词开关：存在 + 持久化 ----
    page.goto(BASE + "/test", wait_until="networkidle")
    ok("「优先错词」开关出现", "优先错词" in page.locator("body").inner_text())
    page.locator("text=优先错词").first.click(); page.wait_for_timeout(300)
    opts3 = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_test_options'))")
    ok("优先错词持久化 preferWrong=true", opts3.get("preferWrong") == True)
    page.locator("text=优先错词").first.click(); page.wait_for_timeout(300)  # 还原关闭


    # ---- 导出（父书含章节；全不勾置灰；勾选后导出） ----
    page.goto(BASE + "/words", wait_until="networkidle")
    page.locator("button:has-text(\"点开 →\")").filter(has_text="雅思真经").first.click(); page.wait_for_timeout(400)
    page.get_by_title("导出当前范围单词").click(); page.wait_for_timeout(300)
    page.locator("label", has_text="已背").locator("input").uncheck()
    page.locator("label", has_text="未背").locator("input").uncheck()
    page.wait_for_timeout(200)
    ok("全不勾按钮置灰", page.locator("button.glow-btn", has_text="导出").is_disabled())
    page.locator("label", has_text="已背").locator("input").check()
    page.locator("label", has_text="未背").locator("input").check()
    with page.expect_download() as dl:
        page.locator("button.glow-btn", has_text="导出").click()
    d = dl.value; d.save_as("/tmp/e2e.csv")
    c = open("/tmp/e2e.csv", encoding="utf-8-sig").read()
    ok("CSV 含章节词且含词头", "abandon" in c and "canyon" in c and "书内序号" in c)
    print("   CSV:", d.suggested_filename)

    # ---- 软删 → 备忘录不断链+删除线不可点 → 导出不含 ----
    page.keyboard.press("Escape"); page.locator("button[aria-label='关闭']").click(); page.wait_for_timeout(300)
    page.locator("button", has_text="雅思真经").first.click(); page.wait_for_timeout(300)
    page.evaluate("() => { document.querySelector('details').open = true; }")
    page.locator("button", has_text="↳ Unit 1").first.click(); page.wait_for_timeout(300)
    page.get_by_label("删除 abandon").click(); page.wait_for_timeout(400)
    memos2 = page.evaluate("() => JSON.parse(localStorage.getItem('vocab_memos'))")
    ok("软删后笔记关联保留", memos2[0]["relatedWordIds"]==[w1["id"]])
    page.goto(BASE + "/memos", wait_until="networkidle")
    page.locator("button", has_text="abandon 搭配").first.click(); page.wait_for_timeout(300)
    ab = page.locator("button", has_text="abandon").filter(has_not_text="搭配").first
    ok("软删词删除线+禁用", ab.get_attribute("disabled") is not None)
    page.goto(BASE + "/words", wait_until="networkidle")
    page.locator("button", has_text="雅思真经").first.click(); page.wait_for_timeout(300)
    page.get_by_title("导出当前范围单词").click(); page.wait_for_timeout(300)
    with page.expect_download() as dl2:
        page.locator("button.glow-btn", has_text="导出").click()
    d2 = dl2.value; d2.save_as("/tmp/e2e2.csv")
    ok("导出不包含软删词", "abandon" not in open("/tmp/e2e2.csv", encoding="utf-8-sig").read())

    b.close()

fails = [n for n,c in PASS if not c]
print(f"\n{len(PASS)-len(fails)}/{len(PASS)} 通过", ("失败: "+", ".join(fails)) if fails else "全部通过")
