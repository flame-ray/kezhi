const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.KEZHI_PLAYWRIGHT_PATH || "playwright");
const base = process.env.KEZHI_UI_URL || "http://127.0.0.1:1421";
const out = process.env.KEZHI_UI_OUTPUT || path.resolve("tmp/ui-audit");
fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser = await chromium.launch({headless:true});
 const failures = [], checks = [], screenshots = [], errors = [];
 const check = async(name,fn)=>{try{await fn();checks.push(name);console.log("PASS "+name)}catch(e){failures.push({name,message:String(e)});console.log("FAIL "+name+" "+e.message)}};
 const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,colorScheme:"light"});
 await context.route("**/*",route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage();
 page.setDefaultTimeout(8000);
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(base);
 const screenshot=async(name)=>{const file=path.join(out,name+".png");await page.screenshot({path:file});screenshots.push(file)};
 const settled=()=>page.waitForTimeout(420);
 const dialog=()=>page.locator('.material-backdrop:not([inert]) [role="dialog"]');
 const geometry=async()=> {
   const value=await dialog().evaluate(el=>{
     const r=el.getBoundingClientRect(), footer=el.querySelector(".dialog-footer")?.getBoundingClientRect();
     return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,viewportW:innerWidth,viewportH:innerHeight,overflow:el.scrollWidth>el.clientWidth+1,footer:footer?{top:footer.top,bottom:footer.bottom}:null};
   });
   assert(value.x>=-1 && value.right<=value.viewportW+1 && value.y>=-1 && value.bottom<=value.viewportH+1,JSON.stringify(value));
   assert(!value.overflow,"dialog overflows horizontally");
   if(value.footer)assert(value.footer.top>=0 && value.footer.bottom<=value.viewportH+1,"footer unreachable "+JSON.stringify(value));
 };
 await check("mobile empty schedule",async()=>{await page.getByRole("heading",{name:"导入你的第一张课表"}).waitFor();await settled();await screenshot("01-mobile-home")});
 await check("course editor size, opening and focus",async()=>{
   await page.getByRole("button",{name:"手动添加课程",exact:true}).click();await settled();await geometry();
   assert(await page.locator(".app-shell").evaluate(el=>el.inert));
   assert(await dialog().evaluate(el=>el.contains(document.activeElement)));
   await screenshot("02-mobile-course");
 });
 await check("form entry and save",async()=>{
   await page.getByLabel("课程名称 *",{exact:true}).fill("高等数学（一）");
   await page.getByLabel("教师",{exact:true}).fill("示例教师");
   await page.getByLabel("上课地点",{exact:true}).fill("教学楼 A-301");
   await page.locator(".course-editor-dialog select").first().selectOption("4");
   await page.getByRole("button",{name:"保存课程",exact:true}).click();
   assert(await page.locator('.material-backdrop[data-phase="exit"]').count()===1,"missing exit phase");
   await page.locator('.material-backdrop[data-phase="exit"]').waitFor({state:"detached"});
   // Saving a course opens its details in the existing product flow.
   await page.keyboard.press("Escape");await settled();
   assert(!(await page.locator(".app-shell").evaluate(el=>el.inert)));
 });
 await check("detail and nested editor retain independent focus",async()=>{
   await page.locator('.active-page .course-card').first().click();await settled();await geometry();await screenshot("03-mobile-details");
   await dialog().getByTitle("编辑课程",{exact:true}).click();await settled();
   assert.equal(await page.locator(".material-backdrop").count(),2);
   assert.equal(await page.locator(".material-backdrop[inert]").count(),1);
   await page.keyboard.press("Escape");await settled();
   assert.equal(await page.locator(".material-backdrop").count(),1);
   assert(await dialog().evaluate(el=>el.contains(document.activeElement)));
   await page.keyboard.press("Escape");await settled();
 });
 await check("import wizard steps and back retain input",async()=>{
   await page.getByRole("button",{name:"导入",exact:true}).click();await settled();await geometry();await screenshot("04-mobile-import");
   await page.getByRole("button",{name:"继续",exact:true}).click();await settled();await geometry();await screenshot("05-mobile-account");
   await page.getByLabel("学号 / 登录账号",{exact:false}).fill("ui-test-student");
   await page.keyboard.press("Escape");await settled();
   await page.getByRole("button",{name:"继续",exact:true}).click();await settled();
   assert.equal(await page.getByLabel("学号 / 登录账号",{exact:false}).inputValue(),"ui-test-student");
   await page.getByRole("button",{name:"关闭",exact:true}).click();await settled();
 });
 await check("ICS dialog size",async()=>{
   await page.getByRole("button",{name:"导入",exact:true}).click();await settled();
   await page.getByRole("button",{name:/从日历文件导入/}).click();await settled();await geometry();await screenshot("06-mobile-calendar-import");
   await page.keyboard.press("Escape");await settled();
 });
 await check("timetable scroll and fixed actions on small screen",async()=>{
   await page.getByRole("button",{name:"调整第1周日期"}).click();await settled();await geometry();await screenshot("07-mobile-timetable");
   await page.setViewportSize({width:320,height:568});await settled();await geometry();
   await dialog().locator(".timetable-scroll").evaluate(el=>{el.scrollTop=el.scrollHeight});
   await screenshot("08-small-timetable");
   await page.keyboard.press("Escape");await settled();await page.setViewportSize({width:390,height:844});
 });
 await check("settings bottom sheet",async()=>{
   await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"设置",exact:true}).click();await settled();await geometry();await screenshot("09-mobile-settings");
   await page.keyboard.press("Escape");await settled();
 });
 await check("grades page and editor",async()=>{
   await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"成绩",exact:true}).click();await settled();await screenshot("10-mobile-grades");
   await page.getByRole("button",{name:"录入成绩",exact:true}).click();await settled();await geometry();await screenshot("11-mobile-grade-editor");
   await page.getByLabel("课程名称",{exact:true}).fill("测试课程");
   await page.getByLabel("成绩",{exact:true}).fill("90");
   await page.getByLabel("学分",{exact:true}).fill("3");
   await page.getByRole("button",{name:"保存成绩",exact:true}).click();await settled();
 });
 await check("selection page remains usable",async()=>{
   await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"选课",exact:true}).click();await settled();await screenshot("12-mobile-selection");
   assert(await page.getByText("全自动抢课",{exact:true}).count()>=1);
 });
 await check("today date click stays selected after smooth centering",async()=>{
   await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"今天",exact:true}).click();await settled();
   const active = page.locator('.date-strip [aria-current="date"]');
   const next=await active.evaluate(el=>Number(el.dataset.dateTime)+3*86400000);
   await page.locator('.date-strip button[data-date-time="'+next+'"]').click();
   await page.waitForTimeout(850);
   assert.equal(await active.getAttribute("data-date-time"),String(next));
   await screenshot("13-mobile-today");
 });
 await check("today follows finger and commits one day",async()=>{
   const before=await page.locator('.date-strip [aria-current="date"]').getAttribute("data-date-time");
   const cdp=await context.newCDPSession(page);
   const box=await page.locator(".day-pager").boundingBox();
   const y=box.y+Math.min(160,box.height/2),x=box.x+box.width*.8;
   await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
   for(let i=1;i<=5;i++){await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-i*30,y}]});await page.waitForTimeout(18)}
   const offset=await page.locator(".day-pager-track").evaluate(el=>el.style.getPropertyValue("--day-drag"));
   assert(parseFloat(offset)<-60,"page is not following finger: "+offset);
   await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await page.waitForTimeout(750);
   assert.equal(Number(await page.locator('.date-strip [aria-current="date"]').getAttribute("data-date-time")),Number(before)+86400000);
   await cdp.detach();
 });
 await check("dark theme dialogs",async()=>{
   await page.getByRole("button",{name:"切换暗色主题"}).click();
   await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"设置",exact:true}).click();await settled();await geometry();await screenshot("14-dark-settings");
   await page.keyboard.press("Escape");await settled();
   await page.getByRole("navigation",{name:"主导航"}).getByRole("button",{name:"课表",exact:true}).click();await settled();
   await page.locator(".create-action").click();await settled();await screenshot("15-dark-course");await page.keyboard.press("Escape");await settled();
 });
 await check("desktop layout and export",async()=>{
   await page.setViewportSize({width:1440,height:960});
   await page.getByRole("button",{name:"切换亮色主题"}).click();await settled();await screenshot("16-desktop-schedule");
   await page.getByRole("button",{name:"导出",exact:true}).click();await settled();await geometry();await screenshot("17-desktop-export");
   await page.keyboard.press("Escape");await settled();
 });
 await check("reduced motion exits and no stranded inert background",async()=>{
   await page.emulateMedia({reducedMotion:"reduce"});
   await page.locator(".create-action").click();await page.waitForTimeout(80);
   const duration=await dialog().evaluate(el=>getComputedStyle(el).animationDuration);
   assert(parseFloat(duration)<.01,duration);
   await page.keyboard.press("Escape");await page.waitForTimeout(100);
   assert.equal(await page.locator(".material-backdrop").count(),0);
   assert(!(await page.locator(".app-shell").evaluate(el=>el.inert)));
 });
 await check("no browser runtime errors",async()=>assert.deepEqual(errors,[]));
 fs.writeFileSync(path.join(out,"results.json"),JSON.stringify({checks,failures,screenshots,errors},null,2));
 await browser.close();
 console.log(JSON.stringify({passed:checks.length,failed:failures.length,out}));
 process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
