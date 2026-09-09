const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require(process.env.KEZHI_PLAYWRIGHT_PATH||"playwright");
const base=process.env.KEZHI_UI_URL||"http://127.0.0.1:1421",out=process.env.KEZHI_UI_OUTPUT||path.resolve("tmp/ui-audit");
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await context.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(8000);
 const errors=[],passed=[];page.on("pageerror",e=>errors.push(e.message));
 const wait=(ms=420)=>page.waitForTimeout(ms);
 const test=async(name,fn)=>{await fn();passed.push(name);console.log("PASS "+name)};
 const snap=async(name)=>page.screenshot({path:path.join(out,name+".png")});
 const cdp=await context.newCDPSession(page);
 async function touch(x,y,dx,dy,cancel=false) {
   await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
   for(let i=1;i<=8;i++){await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});await wait(16)}
   await cdp.send("Input.dispatchTouchEvent",{type:cancel?"touchCancel":"touchEnd",touchPoints:[]});
 }
 await page.goto(base);await wait();
 await test("long press still adds a course",async()=>{
   await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:300,y:235}]});await wait(950);
   await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await wait();
   assert.equal(await page.locator(".course-range-picker").count(),1);
   assert.equal(await page.locator(".course-editor-dialog").count(),0);
   await page.getByRole("button",{name:"按选定时间添加课程",exact:true}).click();await wait();
   assert.equal(await page.locator(".course-editor-dialog").count(),1);
 });
 await test("sheet short drag settles without re-entering",async()=>{
   const before=await page.locator(".material-dialog").boundingBox();
   const handle=await page.locator(".sheet-handle").boundingBox();
   await touch(195,handle.y+14,0,55);await wait();
   const after=await page.locator(".material-dialog").boundingBox();
   assert(Math.abs(before.y-after.y)<1,JSON.stringify({before,after}));
   assert.equal(await page.locator(".material-dialog").evaluate(el=>getComputedStyle(el).animationName),"none");
 });
 await test("sheet drag dismisses and restores interaction",async()=>{
   const handle=await page.locator(".sheet-handle").boundingBox();
   await touch(195,handle.y+14,0,180);await wait();
   assert.equal(await page.locator(".material-dialog").count(),0);
   assert(!(await page.locator(".app-shell").evaluate(el=>el.inert)));
 });
 await test("week swipe cancel does not change week",async()=>{
   const before=await page.locator(".week-date strong").textContent();
   await touch(300,235,-100,0,true);await wait();
   assert.equal(await page.locator(".week-date strong").textContent(),before);
   assert.equal(parseFloat(await page.locator(".week-swipe-track").evaluate(el=>el.style.getPropertyValue("--week-drag"))),0);
 });
 await test("consecutive week swipes settle cleanly",async()=>{
   for(let i=0;i<3;i++){await touch(310,240,-180,0);await wait()}
   assert((await page.locator(".week-date strong").textContent()).includes("4"));
   assert.equal(parseFloat(await page.locator(".week-swipe-track").evaluate(el=>el.style.getPropertyValue("--week-drag"))),0);
 });
 await test("compact keyboard-sized viewport keeps save reachable",async()=>{
   await page.locator(".create-action").click();await wait();
   await page.setViewportSize({width:390,height:400});await wait();
   const footer=await page.locator(".dialog-footer").boundingBox();
   assert(footer.y>=0&&footer.y+footer.height<=401,JSON.stringify(footer));
   await snap("18-keyboard-height");
   await page.keyboard.press("Escape");await wait();await page.setViewportSize({width:390,height:844});
 });
 const perf=page.evaluate(()=>new Promise(resolve=>{
   const frames=[],longTasks=[],start=performance.now();let previous=start;
   const observer=new PerformanceObserver(list=>list.getEntries().forEach(e=>longTasks.push(e.duration)));
   observer.observe({type:"longtask",buffered:false});
   function tick(now){frames.push(now-previous);previous=now;if(now-start<2800)requestAnimationFrame(tick);else{observer.disconnect();frames.sort((a,b)=>a-b);resolve({samples:frames.length,p95:frames[Math.floor(frames.length*.95)],max:Math.max(...frames),longTasks})}}requestAnimationFrame(tick);
 }));
 await test("rapid repeated dialogs release focus and backdrop",async()=>{
   for(let i=0;i<4;i++){await page.locator(".create-action").click();await wait(90);await page.keyboard.press("Escape");await wait(250)}
   assert.equal(await page.locator(".material-backdrop").count(),0);
   assert(!(await page.locator(".app-shell").evaluate(el=>el.inert)));
 });
 const performanceSample=await perf;console.log("FRAME_SAMPLE "+JSON.stringify(performanceSample));
 await page.goto(base+"/scripts/ui-fixtures.html");await wait();
 await test("sync review dialog and apply",async()=>{
   await page.getByRole("button",{name:"测试同步弹窗"}).click();await wait();await snap("19-mobile-sync");
   await page.getByRole("radio").first().check();
   await page.getByRole("button",{name:"应用选择"}).click();await wait();
   assert.equal(await page.locator(".material-backdrop").count(),0);
 });
 await context.close();
 const native=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,userAgent:"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36"});
 await native.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await native.addInitScript(()=>{
   window.__TAURI_INTERNALS__={invoke:async(command)=>{
     if(command==="load_local_accounts")return [];
     if(command==="login_credential_status")return {saved:false};
     if(command==="open_school_login")return {windowLabel:"mock",reused:false};
     if(command==="school_login_status")return {windowOpen:true,authenticated:true,sessionCookieCount:1};
     if(command==="fetch_school_schedule")return {rows:[{kch:"UI101",kcmc:"大学英语（一）",xm:"示例教师",cdmc:"教学楼 A-301",xqj:"4",jc:"1-2",zcd:"1-18周"}]};
     if(["save_local_account","save_login_credential","hide_school_login"].includes(command))return;
     throw Error("Unmocked native command: "+command);
   }};
 });
 const np=await native.newPage();np.setDefaultTimeout(10000);np.on("pageerror",e=>errors.push(e.message));
 await np.goto(base+"/scripts/ui-fixtures.html");
 await test("native credential and import steps with mocked transport",async()=>{
   await np.getByRole("button",{name:"测试导入流程"}).click();await np.waitForTimeout(420);
   await np.getByRole("button",{name:"继续",exact:true}).click();
   await np.getByLabel("学号 / 登录账号").fill("visual-student");
   await np.getByLabel("登录密码",{exact:false}).fill("visual-test-only");
   await np.waitForTimeout(420);await np.screenshot({path:path.join(out,"20-native-account.png")});
   await np.getByRole("button",{name:"进入学校登录",exact:true}).click();
   await np.getByRole("button",{name:"读取课表",exact:true}).waitFor();
   await np.waitForTimeout(420);await np.screenshot({path:path.join(out,"21-native-calendar.png")});
   await np.getByRole("button",{name:"读取课表",exact:true}).click();
   await np.getByRole("button",{name:"确认导入",exact:true}).waitFor();
   await np.waitForTimeout(420);await np.screenshot({path:path.join(out,"22-native-review.png")});
   await np.getByRole("button",{name:"确认导入",exact:true}).click();await np.waitForTimeout(420);
   assert.equal(await np.locator(".material-backdrop").count(),0);
 });
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,"extended-results.json"),JSON.stringify({passed,performanceSample,errors},null,2));
 await browser.close();
 console.log(JSON.stringify({passed:passed.length,errors}));
})().catch(e=>{console.error(e);process.exit(1)});
