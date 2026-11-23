'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]),p=path.resolve(root,'.'+u+(u.endsWith('/')?'index.html':''));if(!p.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(p,(e,d)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json'}[path.extname(p)]||'application/octet-stream'));res.end(d)})});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),base='http://127.0.0.1:'+server.address().port;
  page.on('pageerror',e=>{throw e});page.on('dialog',async d=>{console.log('BROWSER DIALOG:',d.message());await d.accept()});
  await page.goto(base+'/question-bank/index.html');await page.waitForSelector('.bank-ws-panel');
  // A legacy shared bank is copied into a clearly labelled archive; source remains untouched.
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('PhysicsTrainingBankV1',1);r.onupgradeneeded=()=>{for(const s of ['questions','events','settings'])r.result.createObjectStore(s,{keyPath:'id'})};r.onsuccess=()=>{const tx=r.result.transaction('questions','readwrite');tx.objectStore('questions').put({id:'LEGACY-Q',stem:'旧版共享题库记录',images:[]});tx.oncomplete=()=>{r.result.close();resolve()};tx.onerror=()=>reject(tx.error)}}));
  await page.reload();await page.waitForSelector('.bank-ws-card');
  const archive=page.locator('.bank-ws-card').filter({hasText:'历史题库（待整理）'});await archive.getByRole('button',{name:'进入题库'}).click();
  await page.waitForFunction(()=>{try{return window.PhysicsBankWorkspace.current().meta.legacyArchive===true}catch(_){return false}});
  const archiveId=await page.evaluate(()=>PhysicsBankWorkspace.current().meta.id);
  const legacyRows=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('PhysicsTrainingBankV1_legacy-archive');r.onsuccess=()=>{const q=r.result.transaction('questions').objectStore('questions').get('LEGACY-Q');q.onsuccess=()=>{r.result.close();resolve(q.result)}}}));
  assert.equal(legacyRows.stem,'旧版共享题库记录');
  // Create grade 8 and grade 9 workspaces and write different records.
  await page.getByRole('button',{name:'新建年级题库'}).click();await page.fill('#bwy','2026—2027');await page.selectOption('#bwg','八年级');await page.getByRole('button',{name:'创建并进入'}).click();
  await page.waitForFunction(()=>{try{return window.PhysicsBankWorkspace.current().meta.grade==='八年级'}catch(_){return false}});
  const grade8=await page.evaluate(()=>PhysicsBankWorkspace.current().meta.id);
  async function add(id,stem){await page.evaluate(({id,stem})=>new Promise((resolve,reject)=>{const name=PhysicsBankWorkspace.current().dbName,r=indexedDB.open(name);r.onsuccess=()=>{const tx=r.result.transaction('questions','readwrite');tx.objectStore('questions').put({id,stem,images:[]});tx.oncomplete=()=>{r.result.close();resolve()};tx.onerror=()=>reject(tx.error)}}),{id,stem})}
  async function ids(){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open(PhysicsBankWorkspace.current().dbName);r.onsuccess=()=>{const q=r.result.transaction('questions').objectStore('questions').getAll();q.onsuccess=()=>{r.result.close();resolve(q.result.map(x=>x.id).sort())};q.onerror=()=>reject(q.error)}}))}
  await add('G8-Q','八年级题目');
  await page.getByRole('button',{name:'切换工作区'}).click();await page.waitForSelector('.bank-ws-panel');
  await page.getByRole('button',{name:'新建学年／年级题库'}).click();await page.fill('#bwy','2026—2027');await page.selectOption('#bwg','九年级');await page.getByRole('button',{name:'创建并进入'}).click();
  await page.waitForFunction(()=>{try{return window.PhysicsBankWorkspace.current().meta.grade==='九年级'}catch(_){return false}});
  const grade9=await page.evaluate(()=>PhysicsBankWorkspace.current().meta.id);await add('G9-Q','九年级题目');
  assert.deepEqual(await ids(),['G9-Q']);
  await page.getByRole('button',{name:'切换工作区'}).click();await page.waitForSelector('.bank-ws-panel');
  await page.locator('.bank-ws-card').filter({hasText:'2026—2027 · 八年级'}).getByRole('button',{name:'进入题库'}).click();
  await page.waitForFunction(id=>{try{return PhysicsBankWorkspace.current().meta.id===id}catch(_){return false}},grade8);
  assert.deepEqual(await ids(),['G8-Q']);
  await page.goto(base+'/question-bank/dashboard.html?workspace='+encodeURIComponent(grade9));await page.waitForFunction(()=>{try{return window.PhysicsBankWorkspace.current().meta.grade==='九年级'}catch(_){return false}});
  assert.equal(await page.evaluate(()=>PhysicsBankWorkspace.current().dbName),'PhysicsTrainingBankV1_'+grade9);
  assert.notEqual(grade8,grade9);assert.notEqual(archiveId,grade8);
  const original=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('PhysicsTrainingBankV1');r.onsuccess=()=>{const q=r.result.transaction('questions').objectStore('questions').get('LEGACY-Q');q.onsuccess=()=>{r.result.close();resolve(q.result)}}}));
  assert.equal(original.stem,'旧版共享题库记录','legacy database must remain intact');
  console.log('PASS: legacy archive copy, independent grade 8/9 IndexedDB, same workspace dashboard, original legacy DB preserved');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
