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
   window.widgetCalls=[]; window.pinSupported=true; window.failWidget=false; window.widgetTarget=JSON.parse(localStorage.getItem('test.widget.target')||'null'); let id=0;
   window.__TAURI_INTERNALS__={transformCallback:()=>++id,unregisterCallback:()=>{},invoke:async(command,args)=>{
    if(command==='load_schedule_snapshot'){await new Promise(r=>setTimeout(r,180));return JSON.parse(localStorage.getItem('kezhi.schedule.prototype.v2'));}
    if(command==='save_schedule_snapshot')return;
    if(command==='load_local_accounts')return [];
    if(command==='sync_course_widget'){window.widgetCalls.push({command,args});if(window.failWidget)throw Error('simulated failure');window.widgetCache=JSON.parse(args.content);window.widgetSyncedAt=Date.now();window.widgetDiagnosticOverride=null;return;}
    if(command==='read_course_widget_status'){
     if(window.failWidgetStatus)throw Error('simulated status failure');
     const rows=window.widgetCache?.events||[],dates=rows.map(e=>e.date).sort();
     return window.widgetDiagnosticOverride||{cacheState:window.widgetCache?'ready':'missing',syncedAt:window.widgetSyncedAt||0,checkedAt:Date.now(),today:'2026-09-17',widgetCount:2,
      eventCount:rows.length,todayCount:rows.filter(e=>e.date==='2026-09-17').length,firstDate:dates[0]||null,lastDate:dates.at(-1)||null};
    }
    if(command==='pin_course_widget'){window.widgetCalls.push({command});return window.pinSupported;}
    if(command==='configure_course_widget'){window.widgetCalls.push({command});return;}
    if(command==='read_widget_navigation')return {pending:window.widgetTarget};
    if(command==='acknowledge_widget_navigation'){if(window.widgetTarget?.token===args.content){window.widgetTarget=null;localStorage.removeItem('test.widget.target');}return;}
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
  assert.deepEqual(Object.keys(payload.events[0]).sort(),['date','end','id','location','start','title']);
  // Warm tap and cold startup must wait for the real snapshot, then open the exact course.
  await page.evaluate(()=>{window.widgetTarget={id:'widget-test',date:'2026-09-17',token:'warm'};window.dispatchEvent(new Event('kezhi-widget-open'));});
  const detail=page.getByRole('dialog',{name:'数学',exact:true});
  await detail.waitFor(); await detail.getByTitle('关闭').click();
  await page.evaluate(()=>localStorage.setItem('test.widget.target',JSON.stringify({id:'widget-test',date:'2026-10-01',token:'cold'})));
  await page.reload();await detail.waitFor();await detail.getByTitle('关闭').click();await detail.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('test.widget.target')),null);
  await page.evaluate(()=>{window.widgetTarget={id:'deleted',date:'2026-09-17',token:'stale'};window.dispatchEvent(new Event('kezhi-widget-open'));});
  await page.getByText('这堂课已变更或删除，请查看最新课表').waitFor();
  assert.equal(await detail.count(),0);
  console.log('PASS cold/warm widget navigation and stale target rejection');
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'设置',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'课表与提醒'}), add=settings.getByRole('button',{name:/添加桌面小组件/});
  await settings.getByRole('button',{name:/小组件外观设置/}).click();
  assert(await page.evaluate(()=>window.widgetCalls.some(c=>c.command==='configure_course_widget')));
  await add.click();await settings.getByText(/已请求添加，请在系统弹窗中确认/).waitFor();
  assert.equal(await page.evaluate(()=>window.widgetCalls.filter(c=>c.command==='sync_course_widget').length),1,'pin reuses already saved identical snapshot');
  await page.evaluate(()=>{window.pinSupported=false;});await add.click();
  await settings.getByText(/请长按手机桌面空白处/).waitFor();
  const out=path.resolve('tmp/ui-widget');fs.mkdirSync(out,{recursive:true});
  await add.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'widget-settings-light.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS Android sync: hydration, odd weeks, minimal data, pin and unsupported launcher guidance');
  const panel=settings.getByRole('region',{name:'小组件同步状态'});
  await panel.getByText('本机课表已就绪',{exact:true}).waitFor();
  assert((await panel.innerText()).includes('2026-09-17 至 2026-10-01'));
  const before=await page.evaluate(()=>window.widgetCalls.filter(c=>c.command==='sync_course_widget').length);
  await panel.getByRole('button',{name:'立即刷新',exact:true}).click();
  await panel.getByText(/当前课表已重新同步/).waitFor();
  assert.equal(await page.evaluate(()=>window.widgetCalls.filter(c=>c.command==='sync_course_widget').length),before+1,'manual refresh rewrites even identical data');
  await page.evaluate(()=>{window.widgetDiagnosticOverride={cacheState:'invalid',syncedAt:0,checkedAt:Date.now(),today:'2026-09-17',widgetCount:2,eventCount:0,todayCount:0,firstDate:null,lastDate:null};});
  await panel.getByRole('button',{name:'重新检查',exact:true}).click();
  await panel.getByText('小组件缓存无法读取',{exact:true}).waitFor();
  await panel.getByRole('button',{name:'立即刷新',exact:true}).click();
  await panel.getByText('本机课表已就绪',{exact:true}).waitFor();
  await page.evaluate(()=>{window.failWidgetStatus=true;});
  await panel.getByRole('button',{name:'重新检查',exact:true}).click();
  await panel.getByText(/暂时无法读取状态/).waitFor();
  await page.evaluate(()=>{window.failWidgetStatus=false;});
  await panel.getByRole('button',{name:'重新检查',exact:true}).click();
  await panel.getByText('本机课表已就绪',{exact:true}).waitFor();
  await page.evaluate(()=>{window.failWidget=true;});
  await panel.getByRole('button',{name:'立即刷新',exact:true}).click();
  await panel.getByText(/刷新失败，请确认课表已加载后重试/).waitFor();
  await page.evaluate(()=>{window.failWidget=false;});
  await panel.getByRole('button',{name:'立即刷新',exact:true}).click();
  await panel.getByText(/当前课表已重新同步/).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kezhi.schedule.prototype.v2')).courses[0].id),'widget-test');
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'widget-status-light.png')});
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:path.join(out,'widget-status-dark.png')});
  await page.setViewportSize({width:320,height:640});
  await panel.getByRole('button',{name:'立即刷新',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'widget-status-dark-320.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:390,height:844});
  console.log('PASS diagnostics, forced refresh, corrupt cache repair, read/sync failure retry and unchanged courses');
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
