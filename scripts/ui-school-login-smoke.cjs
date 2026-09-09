const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.KEZHI_PLAYWRIGHT_PATH || "playwright");
const base = process.env.KEZHI_UI_URL || "http://127.0.0.1:1421";
const collector = fs.readFileSync("src-tauri/gen/android/app/src/main/assets/kezhi-schedule-snapshot.js", "utf8");
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 Android Kezhi-test", isMobile: true, hasTouch: true });
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(() => {
      window.calls = [];
      window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
        window.calls.push({ command, args });
        if (command === "load_local_accounts") return [];
        if (command === "save_local_account" && window.failSave) throw new Error("测试：账号保存失败");
        if (command === "login_credential_status") return { saved: false };
        if (command === "school_login_status") return { windowOpen: true, authenticated: false, sessionCookieCount: 0 };
        return {};
      }};
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const openWizard = async () => {
      await page.goto(base + "/scripts/ui-fixtures.html");
      await page.getByRole("button", { name: "测试导入流程", exact: true }).click();
      await page.locator('input[type="url"]').fill("https://jw.example.edu.cn/login");
      await page.getByRole("button", { name: "继续", exact: true }).click();
      await page.getByRole("button", { name: "进入学校登录", exact: true }).waitFor();
    };
    await openWizard();
    const login = page.getByRole("button", { name: "进入学校登录", exact: true });
    assert(await login.isEnabled(), "blank local username must not block opening website");
    await login.click();
    await page.waitForFunction(() => window.calls.some(call => call.command === "open_school_login"));
    const request = await page.evaluate(() => window.calls.find(call => call.command === "open_school_login").args.request);
    assert.equal(request.loginUrl, "https://jw.example.edu.cn/login");
    assert.equal(request.purpose, "schedule-page");
    assert.notEqual(request.schoolId, "ndnu");
    const saved = await page.evaluate(() => window.calls.find(call => call.command === "save_local_account").args.account);
    assert.equal(saved.loginName, "");
    console.log("PASS generic login opens without a preliminary account number");
    await openWizard();
    await page.evaluate(() => { window.failSave = true; });
    await page.getByRole("button", { name: "进入学校登录", exact: true }).click();
    await page.getByText("测试：账号保存失败", { exact: true }).waitFor();
    assert(await page.getByRole("button", { name: "进入学校登录", exact: true }).isEnabled());
    console.log("PASS account persistence failure is visible and retryable");

    await page.setContent('<table><tr><th colspan="3">学生课表</th></tr><tr><th>节次</th><th>星期一</th><th>星期二</th></tr><tr><td>第1节<br>08:20-09:05</td><td rowspan="2">大学英语<br>教师：测试教师<br>教室：A301<br>1-16周<input value="private-secret"></td><td></td></tr><tr><td>第2节</td><td></td></tr></table><iframe id="frame"></iframe>');
    await page.locator("#frame").evaluate(frame => {
      frame.contentDocument.body.innerHTML = '<table><tr><th>节次</th><th>周一</th><th>周二</th></tr><tr><td>3-4</td><td></td><td>高等数学<br>教室：B201<br>2-16周</td></tr></table>';
    });
    const snapshot = JSON.parse(await page.evaluate(collector));
    assert.equal(snapshot.tables.length, 2);
    assert(!JSON.stringify(snapshot).includes("private-secret"));
    const parsed = await page.evaluate(async snapshot => {
      const { parsePortalSchedule } = await import("/src/importing/portalScheduleAdapter.ts");
      return parsePortalSchedule(snapshot);
    }, snapshot);
    assert.equal(parsed.courses.length, 2);
    assert.equal(parsed.courses[0].title, "大学英语");
    assert.equal(parsed.courses[0].startPeriod, 1);
    assert.equal(parsed.courses[0].endPeriod, 2);
    assert.equal(parsed.courses[1].day, 2);
    assert.equal(parsed.courses[1].endPeriod, 4);
    console.log("PASS native collector preserves line breaks, rowspan, multi-row headers and same-origin frames");
    await page.setContent('<input type="password" value="test-secret"><table><tr><td>登录</td></tr><tr><td>首页</td></tr></table>');
    const loginSnapshot = JSON.parse(await page.evaluate(collector));
    assert.equal(loginSnapshot.tables.length, 0);
    assert.match(loginSnapshot.warnings.join(""), /登录/);
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS login forms are not mistaken for timetable data");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
