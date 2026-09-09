const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require(process.env.KEZHI_PLAYWRIGHT_PATH || "playwright");
const base = process.env.KEZHI_UI_URL || "http://127.0.0.1:1421", out = process.env.KEZHI_UI_OUTPUT || path.resolve("tmp/ui-gesture-calendar");
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await chromium.launch({ headless: true });
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route("**/*", r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  const page = await context.newPage(), errors = [], passed = [];
  page.on("pageerror", e => errors.push(e.message));
  const wait = (ms=520) => page.waitForTimeout(ms);
  const test = async (name, fn) => { await fn(); passed.push(name); console.log("PASS " + name); };
  const cdp = await context.newCDPSession(page);
  const pointer = (type, x=300, y=235) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type==="touchEnd" || type==="touchCancel" ? [] : [{ x, y }] });
  await page.goto(base); await wait();
  await test("8px capture followed by pause never opens add course", async () => {
    await pointer("touchStart"); await wait(240);
    await pointer("touchMove",292,235); await wait(1000);
    assert.equal(await page.locator(".course-editor-dialog").count(),0);
    await pointer("touchEnd"); await wait();
  });
  await test("swipe away then back cannot restart long press", async () => {
    await pointer("touchStart"); await pointer("touchMove",280,235); await pointer("touchMove",300,235); await wait(950);
    assert.equal(await page.locator(".course-editor-dialog").count(),0);
    await pointer("touchEnd"); await wait();
  });
  await test("cancelled touch clears hold timer", async () => {
    await pointer("touchStart"); await wait(300); await pointer("touchCancel"); await wait(900);
    assert.equal(await page.locator(".course-editor-dialog").count(),0);
  });
  await test("stationary hold remains available after swiping", async () => {
    await pointer("touchStart"); await wait(900); await pointer("touchEnd"); await wait();
    assert.equal(await page.locator(".course-editor-dialog").count(),1);
    await page.keyboard.press("Escape"); await wait();
  });
  await test("navigation pill slides and settles at active icon", async () => {
    await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"今天",exact:true}).click();
    await wait(65);
    assert(await page.locator(".navigation-indicator").evaluate(el=>el.getAnimations().some(a=>a.playState==="running")));
    await wait();
    const difference = await page.evaluate(()=>{
      const pill=document.querySelector(".navigation-indicator").getBoundingClientRect(), active=document.querySelector(".primary-navigation .active").getBoundingClientRect();
      return Math.abs((pill.x+pill.width/2)-(active.x+active.width/2));
    });
    assert(difference<1, "indicator alignment "+difference);
  });
  await test("rapid tab switching cancels old animation without jumping back", async () => {
    for (const name of ["成绩","课表","今天","成绩"]) { await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name,exact:true}).click(); await wait(55); }
    await wait();
    assert.equal(await page.locator(".primary-navigation [aria-current=page]").textContent(),"成绩");
    assert.equal(await page.locator(".navigation-indicator").evaluate(el=>el.getAnimations().filter(a=>a.playState==="running").length),0);
    await page.screenshot({path:path.join(out,"navigation.png")});
  });
  await test("settings exposes calendar import on small screens", async () => {
    await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"设置",exact:true}).click(); await wait();
    await page.getByRole("button",{name:/导入手机日历/}).click(); await wait();
    assert.equal(await page.locator(".export-dialog").count(),1);
    await page.keyboard.press("Escape"); await wait();
  });
  await test("reduced motion disables elastic animation", async () => {
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"课表",exact:true}).click(); await wait(60);
    assert.equal(await page.locator(".navigation-indicator").evaluate(el=>el.getAnimations().length),0);
  });
  const native = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/145.0.0.0 Mobile Safari/537.36"});
  await native.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await native.addInitScript(()=>{
    window.calendarCalls=[];window.calendarFailure=false;
    window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
      if(command!=="write_phone_calendar")throw Error("Unexpected command "+command);
      window.calendarCalls.push(args);
      await new Promise(resolve=>setTimeout(resolve,250));
      if(window.calendarFailure)throw Error("未获得日历权限，未写入任何课程");
      return {inserted:5,updated:0,calendarName:"课织课表"};
    }};
  });
  const np=await native.newPage();np.on("pageerror",e=>errors.push(e.message));
  await np.goto(base+"/scripts/ui-fixtures.html");
  await test("phone calendar writes only after explicit confirmation",async()=>{
    await np.getByRole("button",{name:"测试日历写入"}).click();await np.waitForTimeout(450);
    await np.getByRole("button",{name:"导入手机日历",exact:true}).click();
    assert.equal(await np.evaluate(()=>window.calendarCalls.length),0);
    await np.screenshot({path:path.join(out,"phone-calendar-confirm.png")});
    await np.getByRole("button",{name:"确认写入日历"}).click();
    await np.getByRole("status").filter({hasText:"已写入"}).waitFor();
    const calls=await np.evaluate(()=>window.calendarCalls);
    assert.equal(calls.length,1);
    assert.equal(calls[0].request.events.length,5);
    assert.equal(calls[0].request.events[0].startMs,Date.parse("2026-09-17T08:20:00+08:00"));
  });
  await test("permission failure is visible and allows retry",async()=>{
    await np.evaluate(()=>window.calendarFailure=true);
    await np.getByRole("button",{name:"导入手机日历",exact:true}).click();
    await np.getByRole("button",{name:"确认写入日历"}).click();
    await np.getByRole("status").filter({hasText:"未获得日历权限"}).waitFor();
    assert(await np.getByRole("button",{name:"确认写入日历"}).isEnabled());
  });
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,"gesture-calendar-results.json"),JSON.stringify({passed,errors},null,2));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
