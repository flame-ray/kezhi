// Browser-side bridge contract smoke test; native launcher rendering needs a device.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {chromium} = require(process.env.KEZHI_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.KEZHI_UI_URL || 'http://127.0.0.1:1421';
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/145.0.0.0 Mobile Safari/537.36'});
  await context.route('**/*', r => new URL(r.request().url()).origin===base ? r.continue() : r.abort());
  await context.addInitScript(() => {
   window.widgetCalls=[]; window.pinSupported=true; window.failWidget=false; let id=0;
   window.__TAURI_INTERNALS__={transformCallback:()=>++id,unregisterCallback:()=>{},invoke:async(command,args)=>{
    if(command==='load_schedule_snapshot'){await new Promise(r=>setTimeout(r,180));return JSON.parse(localStorage.getItem('kezhi.schedule.prototype.v2'));}
    if(command==='save_schedule_snapshot')return;
    if(command==='load_local_accounts')return [];
    if(command==='sync_course_widget'){window.widgetCalls.push({command,args});if(window.failWidget)throw Error('simulated failure');return;}
    if(command==='pin_course_widget'){window.widgetCalls.push({command});return window.pinSupported;}
    if(command.startsWith('plugin:notification|'))return false;
    if(command.startsWith('plugin:app|'))return;
    throw Error('Unmocked native call: '+command);
   }};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.evaluate(async()=>{
   const {demoCourses,defaultPresets}=await import('/src/data/demo.ts');
   localStorage.setItem('kezhi.schedule.prototype.v2',JSON.stringify({
    courses:[{...demoCourses[0],id:'widget-test',day:4,weeks:[1,3],title:'数学',location:'医学院301'}],
    presets:defaultPresets,activePresetId:'summer',termStartsOn:'2026-09-14',teachingStartsOn:'2026-09-17',
    accountId:'private-account-id',schoolName:'私人学校'
   }));
  });
  await page.reload();
  await page.waitForFunction(()=>window.widgetCalls.some(c=>c.command==='sync_course_widget'));
  const payload=await page.evaluate(()=>JSON.parse(window.widgetCalls.find(c=>c.command==='sync_course_widget').args.content));
  assert.equal(payload.version,1);assert.deepEqual(payload.events.map(e=>e.date),['2026-09-17','2026-10-01']);
  assert(!JSON.stringify(payload).includes('private-account'));assert(!JSON.stringify(payload).includes('私人学校'));
  assert.deepEqual(Object.keys(payload.events[0]).sort(),['date','end','location','start','title']);
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'设置',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'课表与提醒'}), add=settings.getByRole('button',{name:/添加桌面小组件/});
  await add.click();await settings.getByText(/已请求添加，请在系统弹窗中确认/).waitFor();
  assert.equal(await page.evaluate(()=>window.widgetCalls.filter(c=>c.command==='sync_course_widget').length),1,'pin reuses already saved identical snapshot');
  await page.evaluate(()=>{window.pinSupported=false;});await add.click();
  await settings.getByText(/请长按手机桌面空白处/).waitFor();
  const out=path.resolve('tmp/ui-widget');fs.mkdirSync(out,{recursive:true});
  await add.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'widget-settings-light.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS Android sync: hydration, odd weeks, minimal data, pin and unsupported launcher guidance');
  // Failure must remain visible and permit retry, without losing the timetable.
  await page.reload();await page.evaluate(()=>{window.failWidget=true;});
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'设置',exact:true}).click();
  await page.waitForTimeout(750);await settings.getByText(/桌面课表同步失败/).waitFor();
  await page.evaluate(()=>{window.failWidget=false;});await add.click();
  await settings.getByText(/已请求添加，请在系统弹窗中确认/).waitFor();
  // Empty schedules actively clear old widget data.
  await page.evaluate(()=>{const key='kezhi.schedule.prototype.v2',data=JSON.parse(localStorage.getItem(key));data.courses=[];localStorage.setItem(key,JSON.stringify(data));});
  await page.reload();await page.waitForFunction(()=>window.widgetCalls.some(c=>c.command==='sync_course_widget'));
  assert.deepEqual(await page.evaluate(()=>JSON.parse(window.widgetCalls.find(c=>c.command==='sync_course_widget').args.content).events),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS retry after sync failure and clearing stale courses');
  const web=await browser.newContext({viewport:{width:390,height:844}});
  const webPage=await web.newPage();await webPage.goto(base);
  await webPage.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'设置',exact:true}).click();
  assert.equal(await webPage.getByRole('button',{name:/添加桌面小组件/}).count(),0);
  console.log('PASS widget controls hidden outside Android');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
