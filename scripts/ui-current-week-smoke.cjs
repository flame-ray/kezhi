const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.KEZHI_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.KEZHI_UI_URL || 'http://127.0.0.1:1421';
const output = path.resolve('tmp/ui-current-week');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-08T10:00:00+08:00'));
  await page.goto(base);
  await page.evaluate(async()=>{
   const {demoCourses,defaultPresets}=await import('/src/data/demo.ts');
   localStorage.setItem('kezhi.schedule.prototype.v2',JSON.stringify({courses:demoCourses,presets:defaultPresets,activePresetId:'summer',termStartsOn:'2026-09-14',teachingStartsOn:'2026-09-17'}));
  });
  await page.reload();
  const week=()=>page.locator('.week-date strong').textContent();
  const current=page.locator('.active-page .day-heading[aria-current="date"]');
  await page.waitForFunction(()=>document.querySelector('.week-date strong')?.textContent==='第 4 周');
  assert.match(await current.textContent(),/今天.*10\/8/);
  assert.equal(await page.locator('.active-page .today-cell').count(),11);
  await page.screenshot({path:path.join(output,'today-light.png')});
  console.log('PASS startup opens real week 4 with October 8 highlighted');
  await page.getByRole('button',{name:'下一周',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  assert.equal(await week(),'第 5 周');assert.equal(await current.count(),0);
  await page.getByRole('button',{name:'本周',exact:true}).click();
  assert.equal(await week(),'第 4 周');

  const cdp=await context.newCDPSession(page);
  async function swipe(dx,{pause=0,cancel=false}={}) {
   const rect=await page.locator('.week-swipe-viewport').boundingBox();
   const x=rect.x+(dx<0?rect.width*.9:rect.width*.1),y=rect.y+28;
   const send=(type,xPos)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x:xPos,y,radiusX:3,radiusY:3,force:1}]});
   await send('touchStart',x);
   for(let i=1;i<=8;i++){await send('touchMove',x+dx*i/8);await page.waitForTimeout(16);}
   if(pause)await page.waitForTimeout(pause);
   await send(cancel?'touchCancel':'touchEnd',x+dx);
   await page.waitForTimeout(450);
  }
  await page.evaluate(()=>{
   window.pointerLog=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,e=>window.pointerLog.push({name,x:e.clientX,y:e.clientY,type:e.pointerType,target:e.target.className}),true);
   window.framesSeen=[];window.captureFrames=true;
   const collect=()=>{if(!window.captureFrames)return; const p=document.querySelector('.active-page'),v=document.querySelector('.week-swipe-viewport');window.framesSeen.push({week:document.querySelector('.week-date strong').textContent,x:p.getBoundingClientRect().x-v.getBoundingClientRect().x});requestAnimationFrame(collect);};requestAnimationFrame(collect);
  });
  await swipe(-210);
  if(await week()!=='第 5 周')console.log(await page.evaluate(()=>({events:window.pointerLog,frames:window.framesSeen,animations:document.querySelector('.week-swipe-track').getAnimations().map(a=>a.playState)})));
  assert.equal(await week(),'第 5 周');
  const frames=await page.evaluate(()=>{window.captureFrames=false;return window.framesSeen;});
  const committed=frames.filter(f=>f.week==='第 5 周');assert(committed.length>0);
  assert(committed.every(f=>Math.abs(f.x)<1),'new week stays centered at every sampled frame');
  await swipe(210);assert.equal(await week(),'第 4 周');
  await swipe(-22,{pause:160});assert.equal(await week(),'第 4 周');
  await swipe(-150,{cancel:true});assert.equal(await week(),'第 4 周');
  assert.equal(await page.locator('.course-draft-slot').count(),0);
  assert.equal(await page.getByRole('dialog').count(),0);
  console.log('PASS real touch: forward/back, stale velocity, cancel, no add-course misfire or commit jump');

  await page.getByRole('button',{name:'下一周',exact:true}).click();
  await page.clock.setFixedTime(new Date('2026-10-12T00:01:00+08:00'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('.active-page [aria-current="date"]')?.textContent.includes('10/12'));
  assert.equal(await week(),'第 5 周');
  await page.getByRole('button',{name:'切换暗色主题',exact:true}).click();
  await page.waitForTimeout(450);
  await page.screenshot({path:path.join(output,'today-dark.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await swipe(-200);assert.equal(await week(),'第 6 周');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.reload();assert.equal(await week(),'第 5 周');
  console.log('PASS resume across local midnight, dark theme, reduced motion and relaunch');

  // Native SQLite can differ from the browser migration source.
  await context.addInitScript(()=>{
   let id=0;
   window.__TAURI_INTERNALS__={transformCallback:()=>++id,unregisterCallback:()=>{},invoke:async(command,args)=>{
    if(command==='load_schedule_snapshot'){await new Promise(r=>setTimeout(r,180));const stored=JSON.parse(localStorage.getItem('kezhi.schedule.prototype.v2'));return {...stored,termStartsOn:'2026-09-28',teachingStartsOn:'2026-09-28'};}
    if(command==='save_schedule_snapshot'){window.saved=args.snapshot;return;}
    if(command==='load_local_accounts')return [];
    if(command.startsWith('plugin:notification|'))return false;
    if(command.startsWith('plugin:app|'))return;
    throw Error('Unmocked native command '+command);
   }};
  });
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.week-date strong')?.textContent==='第 3 周');
  assert.match(await current.textContent(),/10\/12/);
  assert.deepEqual(errors,[]);
  console.log('PASS async SQLite calendar hydration opens correct week instead of browser fallback');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
