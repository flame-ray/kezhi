const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.KEZHI_PLAYWRIGHT_PATH||'playwright');
const base=process.env.KEZHI_UI_URL||'http://127.0.0.1:1421';
const out=path.resolve('tmp/ui-root-back-calendar');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{
   let callbackId=0;window.calls=[];window.exportSaved=false;
   window.__TAURI_INTERNALS__={transformCallback:()=>++callbackId,unregisterCallback:()=>{},invoke:async(command,args)=>{
    window.calls.push({command,args});
    if(command==='plugin:app|register_listener'){window.backListener=args.handler;return;}
    if(command==='plugin:app|remove_listener'){if(window.backListener?.id===args.channelId)window.backListener=undefined;return;}
    if(command==='load_schedule_snapshot')return window.saved||null;
    if(command==='save_schedule_snapshot'){window.saved=structuredClone(args.snapshot);return;}
    if(command==='return_to_home'){if(window.failHome)throw '模拟系统返回失败';return;}
    if(command==='save_exam_calendar'){window.lastExport=args.content;return {saved:window.exportSaved};}
    if(command==='load_local_accounts')return [];
    if(command.startsWith('plugin:notification|'))return false;
    throw Error('Unmocked native command: '+command);
   }};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>!!window.backListener);const settle=()=>page.waitForTimeout(420);await settle();
  const back=()=>page.evaluate(()=>window.backListener.onmessage({}));
  const homes=()=>page.evaluate(()=>window.calls.filter(call=>call.command==='return_to_home').length);
  const state=()=>page.evaluate(()=>window.saved);
  const nav=page.getByRole('navigation',{name:'主导航'});
  await back();await settle();assert.equal(await homes(),0);assert.match(await page.locator('.material-snackbar').textContent(),/再返回一次回到桌面/);
  await page.screenshot({path:path.join(out,'root-back-hint.png')});
  await back();await settle();assert.equal(await homes(),1);
  console.log('PASS root first back shows hint, second back dispatches home once');
  await back();await page.waitForTimeout(2150);await back();await settle();assert.equal(await homes(),1);await back();await settle();assert.equal(await homes(),2);
  console.log('PASS timeout requires a fresh pair of back gestures');
  await back();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await back();await settle();assert.equal(await homes(),2);
  await nav.getByRole('button',{name:'设置',exact:true}).click();await settle();await back();await settle();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await homes(),2);
  await back();await settle();assert.equal(await homes(),2);await back();await settle();assert.equal(await homes(),3);
  console.log('PASS background transition and settings navigation reset the pending exit');
  await page.evaluate(()=>window.failHome=true);await back();await back();await settle();assert.match(await page.locator('.material-snackbar').textContent(),/无法返回桌面/);await page.evaluate(()=>window.failHome=false);
  await nav.getByRole('button',{name:'今天',exact:true}).click();await settle();await page.getByRole('button',{name:'考试中心',exact:true}).click();await settle();
  await page.getByRole('button',{name:'添加考试',exact:true}).click();await settle();await back();await settle();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('heading',{name:'考试中心',exact:true}).count(),1);
  console.log('PASS failed home action is visible; exam editor back stays inside exams');
  await page.getByRole('button',{name:'导入考试 ICS',exact:true}).click();await settle();
  const dialog=page.getByRole('dialog',{name:'导入考试日历',exact:true});
  const evt=(uid,title,extra='')=>['BEGIN:VEVENT',`UID:${uid}`,`SUMMARY:${title}`,'DTSTART:20901225T090000','DTEND:20901225T110000','LOCATION:A301',extra,'END:VEVENT'].filter(Boolean).join('\r\n');
  const calendar=(events)=>['BEGIN:VCALENDAR','VERSION:2.0',...events,'END:VCALENDAR',''].join('\r\n');
  const file=(content)=>({name:'exams.ics',mimeType:'text/calendar',buffer:Buffer.from(content)});
  const source=calendar([evt('first','数学期末'),evt('recurrence','重复考试','RRULE:FREQ=WEEKLY')]);
  await dialog.locator('input[type=file]').setInputFiles(file(source));
  await page.waitForTimeout(100);assert.match(await dialog.getByRole('status').textContent(),/可解析 1 场 · 跳过 1 条/);assert.equal((await state()).exams.length,0);
  await dialog.getByRole('button',{name:'清空选择'}).click();assert(await dialog.getByRole('button',{name:'导入 0 场考试'}).isDisabled());
  await dialog.getByRole('button',{name:'全选',exact:true}).click();await page.screenshot({path:path.join(out,'exam-import-preview.png')});
  await dialog.getByRole('button',{name:'导入 1 场考试',exact:true}).click();await settle();assert.equal((await state()).exams.length,1);
  console.log('PASS ICS preview, explicit selection and unsupported-event reporting');
  await page.getByRole('button',{name:'导入考试 ICS',exact:true}).click();await settle();await dialog.locator('input[type=file]').setInputFiles(file(source));await page.waitForTimeout(100);assert(await dialog.getByRole('button',{name:'导入 0 场考试'}).isDisabled());
  await dialog.locator('input[type=file]').setInputFiles(file(calendar([evt('second','物理期末')])));await page.waitForTimeout(100);assert(await dialog.getByRole('button',{name:'导入 1 场考试'}).isDisabled());
  await dialog.getByRole('checkbox',{name:/时间重叠/}).check();await dialog.getByRole('button',{name:'导入 1 场考试'}).click();await settle();assert.equal((await state()).exams.length,2);
  console.log('PASS duplicate import preserves records and conflicts require confirmation');
  await page.getByRole('button',{name:'导出所列 2 场'}).click();await settle();assert.match(await page.locator('.material-snackbar').textContent(),/已取消导出/);
  await page.evaluate(()=>window.exportSaved=true);await page.getByRole('button',{name:'导出所列 2 场'}).click();await settle();assert.match(await page.locator('.material-snackbar').textContent(),/已导出考试日历/);assert.match(await page.evaluate(()=>window.lastExport),/BEGIN:VCALENDAR\r\n/);
  console.log('PASS native export cancellation is not success; saved export contains ICS');
  await page.getByRole('button',{name:'导入考试 ICS',exact:true}).click();await settle();await back();await settle();assert.equal(await dialog.count(),0);
  await back();await settle();assert.equal(await page.locator('.today-panel').count(),1);await back();await settle();assert.equal(await page.locator('.calendar-panel').count(),1);
  assert.deepEqual(errors,[]);console.log('PASS import dialog and secondary pages keep the existing back hierarchy');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
