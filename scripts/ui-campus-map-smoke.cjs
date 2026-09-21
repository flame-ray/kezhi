const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.KEZHI_PLAYWRIGHT_PATH||'playwright');
const base=process.env.KEZHI_UI_URL||'http://127.0.0.1:1421';
const out=path.resolve('tmp/ui-campus-map');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai',userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{
   let id=0;window.calls=[];window.geoCalls=0;
   navigator.geolocation.getCurrentPosition=()=>{window.geoCalls++;throw Error('Unexpected GPS request');};navigator.geolocation.watchPosition=()=>{window.geoCalls++;throw Error('Unexpected GPS watch');};
   window.__TAURI_INTERNALS__={transformCallback:()=>++id,unregisterCallback:()=>{},invoke:async(command,args)=>{
    window.calls.push({command,args});
    if(command==='plugin:app|register_listener'){window.backListener=args.handler;return;}
    if(command==='plugin:app|remove_listener'){if(window.backListener?.id===args.channelId)window.backListener=undefined;return;}
    if(command==='load_schedule_snapshot')return JSON.parse(localStorage.getItem('kezhi.schedule.prototype.v2'));
    if(command==='save_schedule_snapshot'){window.saved=structuredClone(args.snapshot);return;}
    if(command==='load_local_accounts')return [];
    if(command==='return_to_home')return;
    if(command.startsWith('plugin:notification|'))return false;
    throw Error('Unmocked native command: '+command);
   }};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);const settle=()=>page.waitForTimeout(450);await settle();
  await page.evaluate(async()=>{
   const {demoCourses,defaultPresets}=await import('/src/data/demo.ts');const key='kezhi.schedule.prototype.v2',data=window.saved||JSON.parse(localStorage.getItem(key))||{courses:[],presets:defaultPresets,activePresetId:'summer'};
   data.courses=[{...demoCourses[0],id:'map-course',title:'地图测试课程',location:'cc301',day:1,weeks:Array.from({length:30},(_,i)=>i+1)}];
   localStorage.setItem(key,JSON.stringify(data));
  });
  await page.reload();await settle();await page.waitForFunction(()=>!!window.backListener);
  const back=async()=>{await page.evaluate(()=>window.backListener.onmessage({}));await settle();};
  const card=page.locator('.active-page .course-card').filter({hasText:'地图测试课程'});
  // Only the central paging layer is interactive.
  await card.click();await settle();
  const detail=page.getByRole('dialog',{name:'地图测试课程',exact:true});assert(await detail.isVisible());
  await detail.getByRole('button',{name:'在地图上查看教室：cc301',exact:true}).click();await settle();
  const map=page.getByRole('dialog',{name:'教室位置',exact:true});
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'map-opening.png')});
  assert.equal(await map.getByLabel('查看楼栋',{exact:true}).inputValue(),'qiushi-c');assert.equal(await map.locator('.campus-destination').count(),1);assert.equal(await map.locator('.campus-route').count(),0);
  assert.match(await map.locator('.campus-location-summary').textContent(),/求实楼/);
  assert(await map.getByRole('button',{name:'缩小地图',exact:true}).isDisabled(),'opens at minimum zoom');
  assert(await map.locator('.campus-map-viewport').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1),'whole map fits viewport');
  await map.getByLabel('查看楼栋',{exact:true}).selectOption('lecture');
  assert.equal(await map.locator('.campus-highlight').evaluate(el=>getComputedStyle(el).animationName),'campus-highlight-enter');
  assert(await map.locator('.campus-highlight').evaluate(el=>el.getAnimations().some(a=>a.playState==='running')));
  await settle();assert.equal(await map.locator('.campus-highlight').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.emulateMedia({reducedMotion:'reduce'});
  await map.getByLabel('查看楼栋',{exact:true}).selectOption('qiushi-c');
  assert.equal(await map.locator('.campus-highlight').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});await settle();
  const returnBox=await map.getByRole('button',{name:'返回课程',exact:true}).boundingBox();assert(returnBox.y>=0&&returnBox.y+returnBox.height<=844,'return button stays visible');
  await page.screenshot({path:path.join(out,'highlight-mobile.png')});
  console.log('PASS course → room opens correct C building with highlight only');
  assert.equal(await map.getByLabel('我的位置（可选）',{exact:true}).count(),0);
  assert.equal(await map.getByRole('button',{name:'清除路线',exact:true}).count(),0);
  await map.getByRole('button',{name:'全图',exact:true}).click();await settle();
  const svg=map.locator('.campus-map-canvas');await svg.click();await settle();
  assert.equal(await map.locator('polyline,circle').count(),0);
  assert.equal(await map.locator('.campus-destination').count(),1);
  await map.getByRole('button',{name:'放大地图',exact:true}).click();await settle();
  let box=await svg.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2,{steps:8});await page.mouse.up();await settle();
  assert.equal(await map.locator('polyline,circle').count(),0);
  await back();assert.equal(await map.count(),0);assert(await detail.isVisible());assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.command==='return_to_home').length),0);
  await detail.getByRole('button',{name:'在地图上查看教室：cc301',exact:true}).click();await settle();assert.equal(await map.locator('.campus-route').count(),0);
  await map.getByLabel('查看楼栋',{exact:true}).selectOption('south-gate');await settle();assert.match(await map.locator('.campus-location-summary').textContent(),/仅显示位置/);assert.equal(await map.getByLabel('我的位置（可选）',{exact:true}).count(),0);
  await page.keyboard.press('Escape');await settle();assert(await detail.isVisible());await back();assert.equal(await detail.count(),0);
  console.log('PASS navigation removed; panning preserves highlight; Android back and Escape restore course details');
  await page.evaluate(()=>{const key='kezhi.schedule.prototype.v2',data=JSON.parse(localStorage.getItem(key));data.courses[0].location='不认识的教室';localStorage.setItem(key,JSON.stringify(data));});
  await page.reload();await settle();await card.click();await settle();await page.getByRole('button',{name:'在地图上查看教室：不认识的教室',exact:true}).click();await settle();
  assert.equal(await map.getByLabel('查看楼栋',{exact:true}).inputValue(),'');assert.equal(await map.locator('.campus-destination').count(),0);
  await map.getByLabel('查看楼栋',{exact:true}).selectOption('lecture');await settle();assert.match(await map.locator('.campus-location-summary').textContent(),/讲堂群/);
  await page.setViewportSize({width:360,height:740});await settle();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'unknown-mobile.png')});
  await back();await back();await page.getByRole('button',{name:'切换暗色主题'}).click();await settle();await page.setViewportSize({width:1280,height:900});await settle();
  await card.click();await settle();await page.getByRole('button',{name:'在地图上查看教室：不认识的教室',exact:true}).click();await settle();await map.getByLabel('查看楼栋',{exact:true}).selectOption('qiushi-c');await settle();
  await page.screenshot({path:path.join(out,'highlight-desktop-dark.png')});
  assert.equal(await page.evaluate(()=>window.geoCalls),0);assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>Object.keys(window.saved||{}).some(key=>/map|route|origin/i.test(key))),false);
  console.log('PASS unknown room manual choice, narrow/desktop dark layout, no GPS requests or stored origins');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
