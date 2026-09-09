const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require(process.env.KEZHI_PLAYWRIGHT_PATH || "playwright");
const base = process.env.KEZHI_UI_URL || "http://127.0.0.1:1421";
const out = process.env.KEZHI_UI_OUTPUT || path.resolve("tmp/ui-week-draft");
fs.mkdirSync(out,{recursive:true});
(async () => {
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);
  await page.evaluate(async()=>{
    const {defaultPresets}=await import("/src/data/demo.ts");
    const course={courseCode:"TEST",teacher:"教师",location:"A301",startPeriod:1,endPeriod:2,color:"teal",weeks:[1,3]};
    localStorage.setItem("kezhi.schedule.prototype.v2",JSON.stringify({presets:defaultPresets,activePresetId:"summer",termStartsOn:"2026-09-14",teachingStartsOn:"2026-09-17",courses:[
      {...course,id:"mon",title:"周一课程",day:1},
      {...course,id:"thu",title:"周四课程",day:4},
      {...course,id:"even",title:"双周课程",day:2,weeks:[2,4]},
      {...course,id:"safety",title:"国家安全教育",day:2,startPeriod:3,endPeriod:4},
      {...course,id:"history",title:"历史纲要",day:2,startPeriod:3,endPeriod:4,weeks:[2,4]},
      {...course,id:"career",title:"职业发展",day:4,startPeriod:3,endPeriod:4,weeks:[2]},
      {...course,id:"study",title:"大学生就业指导",day:4,startPeriod:4,endPeriod:5,weeks:[3]},
    ]}));
  });
  await page.reload();await page.waitForTimeout(450);
  const active=page.locator(".active-page");
  assert.equal(await active.locator(".before-teaching").filter({hasText:"周一课程"}).count(),1);
  assert.equal(await active.locator(".not-this-week").filter({hasText:"双周课程"}).count(),1);
  assert(await active.locator(".not-this-week").first().evaluate(el=>Number(getComputedStyle(el).opacity)<.5));
  assert.equal(await active.locator(".course-card:not(.before-teaching):not(.not-this-week)").filter({hasText:"周四课程"}).count(),1);
  console.log("PASS opening week and non-current courses remain visible");
  const boxes=await active.locator(".course-card").evaluateAll(cards=>cards.map(card=>{const r=card.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
    const a=boxes[i],b=boxes[j];
    assert(!(a.x<b.right && a.right>b.x && a.y<b.bottom && a.bottom>b.y),"course cards must not overlap");
  }
  const grouped=active.locator(".course-card").filter({hasText:"国家安全教育"});
  assert.match(await grouped.textContent(),/共 2 门/);
  assert.equal(await active.locator(".course-card").filter({hasText:"历史纲要"}).count(),0);
  await grouped.click();await page.waitForTimeout(360);
  assert.equal(await page.locator(".overlap-course-item").count(),2);
  assert.match(await page.locator(".overlap-course-item").first().textContent(),/国家安全教育/);
  await page.locator(".overlap-course-item").filter({hasText:"历史纲要"}).click();await page.waitForTimeout(400);
  assert.equal(await page.locator(".overlap-courses-dialog").count(),0);
  await page.keyboard.press("Escape");await page.waitForTimeout(350);
  console.log("PASS no overlapping cards and all hidden courses remain accessible");
  await active.locator(".course-card").filter({hasText:"职业发展"}).click();await page.waitForTimeout(350);
  assert.equal(await page.locator(".overlap-course-item").count(),2);
  await page.screenshot({path:path.join(out,"overlapping-course-list.png")});
  await page.keyboard.press("Escape");await page.waitForTimeout(350);
  await page.screenshot({path:path.join(out,"overlap-fixed.png")});
  const cell=active.getByRole("button",{name:/周六 .*第 3 节/});
  await cell.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box=await cell.boundingBox(),cdp=await context.newCDPSession(page);
  const touch=async(type,x=box.x+box.width/2,y=box.y+box.height/2)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:type==="touchEnd"?[]:[{x,y}]});
  await touch("touchStart");await page.waitForTimeout(900);
  await touch("touchEnd");await page.waitForTimeout(230);
  assert.equal(await page.locator(".course-range-picker").count(),1);
  assert.equal(await page.locator(".course-editor-dialog").count(),0);
  await page.getByRole("button",{name:"开始提前一节",exact:true}).click();
  await page.getByRole("button",{name:"结束推后一节",exact:true}).click();
  assert.match(await page.locator(".draft-time-caption").textContent(),/第 2–4 节/);
  const bounds=await page.locator(".course-range-picker").boundingBox();
  assert(bounds.x>=0 && bounds.x+bounds.width<=390 && bounds.y+bounds.height<=844);
  await page.screenshot({path:path.join(out,"week-draft-light.png")});
  await page.getByRole("button",{name:"按选定时间添加课程",exact:true}).click();await page.waitForTimeout(350);
  assert.equal(await page.locator(".course-editor-dialog").count(),1);
  assert.equal(await page.getByLabel(/^开始节次/).inputValue(),"2");
  assert.equal(await page.getByLabel(/^结束节次/).inputValue(),"4");
  assert.equal(await page.getByLabel(/^星期/).inputValue(),"6");
  await page.keyboard.press("Escape");await page.waitForTimeout(350);
  console.log("PASS arrow range transferred to course editor");
  await touch("touchStart");await touch("touchMove",box.x+box.width/2-15);await page.waitForTimeout(950);await touch("touchEnd");await page.waitForTimeout(500);
  assert.equal(await page.locator(".course-range-picker").count(),0);
  console.log("PASS moving gesture cannot open time picker");
  await page.evaluate(()=>{document.documentElement.dataset.theme="dark";});
  await page.screenshot({path:path.join(out,"week-draft-dark.png")});
  assert.deepEqual(errors,[]);
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
