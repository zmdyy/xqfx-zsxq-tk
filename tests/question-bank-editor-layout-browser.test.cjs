'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const url=decodeURIComponent(req.url.split('?')[0]),p=path.resolve(root,'.'+url+(url.endsWith('/')?'index.html':''));
 if(!p.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(p,(e,d)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html;charset=utf-8','.json':'application/json','.woff2':'font/woff2'}[path.extname(p)]||'application/octet-stream'));res.end(d);});
});
const fixture={id:'LAYOUT-A',source:'布局验收样例（非正式题库）',sourceNo:'25',type:'综合题',revision:1,tags:[],images:[],answerImages:[],parts:[],review:'pending',
 stem:'25. 阅读短文，回答问题。F1=2 N，额定电压U额=3 V。\n登月服\n'+Array.from({length:24},(_,i)=>'第'+(i+1)+'段：登月服由多层结构组成，包括舒适层、保暖层、通风服和水冷服、气密限制层、隔热层和外保护层。请结合题图说明装置的工作过程。').join('\n')+'\n（1）分析水冷服的作用。\n（2）分析气密性检测原理，U1=3 V。\n（3）最后一个小问：说明电阻R1的变化。',
 answer:'答案与解析\n'+Array.from({length:12},(_,i)=>'第'+(i+1)+'步：根据已知条件分析相关物理量，写出表达式并说明理由。').join('\n')+'\n答案末尾：教师可在这里直接修改，F2=4 N。'};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+'/question-bank/');await page.waitForFunction(()=>document.querySelector('#conceptFilter').options.length>200);
 await page.evaluate(q=>new Promise(resolve=>{const r=indexedDB.open('PhysicsTrainingBankV1');r.onsuccess=()=>{const tx=r.result.transaction('questions','readwrite');tx.objectStore('questions').put(q);tx.objectStore('questions').put({...q,id:'LAYOUT-B',sourceNo:'26',stem:'下一道短题。F1=3 N。',answer:'答案。'});tx.oncomplete=()=>{r.result.close();resolve();};};}),fixture);
 await page.reload();await page.click('#qualityReviewBtn');await page.evaluate(()=>PhysicsTeacherEditor.open('LAYOUT-A',{review:true}));await page.waitForSelector('#teacherEditorDialog[open]');
 const left=page.locator('#teDocumentScroll'),right=page.locator('#teControls');
 const metrics=()=>page.evaluate(()=>{const ids=['teDocumentScroll','teControls'];return Object.fromEntries(ids.map(id=>{const n=document.getElementById(id),r=n.getBoundingClientRect();return[id,{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,scroll:n.scrollTop,max:n.scrollHeight-n.clientHeight}];}));});
 let m=await metrics();assert.ok(m.teDocumentScroll.width>m.teControls.width*1.8);assert.ok(m.teDocumentScroll.right<=m.teControls.left+1);assert.ok(m.teDocumentScroll.max>1000);assert.equal(await page.locator('#teCompare').isVisible(),false);
 // Actual wheel input scrolls the document without moving the controls/background.
 const initialOuter=await page.evaluate(()=>({page:scrollY,review:document.querySelector('#qualityReviewDialog').scrollTop}));
 await left.hover();await page.mouse.wheel(0,700);await page.waitForFunction(()=>document.querySelector('#teDocumentScroll').scrollTop>300);m=await metrics();assert.equal(m.teControls.scroll,0);
 assert.deepEqual(await page.evaluate(()=>({page:scrollY,review:document.querySelector('#qualityReviewDialog').scrollTop})),initialOuter);
 await page.selectOption('#teGroup','');await right.hover();await page.mouse.wheel(0,650);await page.waitForFunction(()=>document.querySelector('#teControls').scrollTop>100);
 const leftScroll=(await metrics()).teDocumentScroll.scroll;await page.click('[data-action="issueNext"]');assert.equal(await page.locator('[data-action="issueNext"]').isVisible(),true);assert.deepEqual(await page.evaluate(()=>({page:scrollY,review:document.querySelector('#qualityReviewDialog').scrollTop})),initialOuter);
 // Jump buttons remain outside the document's scrollable content.
 await page.click('[data-action="jumpAnswer"]');assert.ok((await metrics()).teDocumentScroll.scroll>leftScroll);await page.locator('[data-field="answer"]').click();await page.keyboard.press('Control+End');await page.keyboard.type(' 已验证末尾编辑');await page.waitForFunction(()=>document.querySelector('#teStatus').textContent.includes('草稿已保存'));
 assert.ok((await page.locator('[data-field="answer"]').innerText()).endsWith('已验证末尾编辑'));
 await page.click('[data-mode="before"]');assert.equal(await page.locator('#teCompare').isVisible(),true);assert.equal(await page.locator('#teEditBody').isVisible(),false);assert.equal(await page.locator('[data-action="sub"]').isDisabled(),true);assert.ok((await page.locator('#teCompareBody').innerText()).includes('答案末尾'));await page.click('[data-mode="edit"]');
 assert.ok((await metrics()).teDocumentScroll.scroll>1000,'return to editing restores document position');
 await page.click('[data-action="jumpStem"]');assert.ok((await metrics()).teDocumentScroll.scroll<10);
 // Preserve the exact text selection while moving to a right-pane tool.
 await page.evaluate(()=>{const el=document.querySelector('[data-field="stem"]'),n=el.firstChild,i=n.textContent.indexOf('F1')+1,r=document.createRange();el.focus({preventScroll:true});r.setStart(n,i);r.setEnd(n,i+1);getSelection().removeAllRanges();getSelection().addRange(r);});
 await page.locator('[data-action="sub"]').click();assert.equal(await page.locator('#teMathValue').evaluate(n=>n.value),'{}_{1}');await page.click('#teMathApply');
 assert.ok((await page.locator('[data-field="stem"]').evaluate(n=>PhysicsTeacherEditor.serialize(n))).includes('F\\({}_{1}\\)=2 N'));
 await page.click('[data-action="preview"]');assert.equal(await page.locator('[data-field="stem"]').getAttribute('contenteditable'),'false');assert.equal(await page.locator('[data-action="accept"]').isDisabled(),true);await page.click('[data-action="preview"]');assert.equal(await page.locator('[data-field="stem"]').getAttribute('contenteditable'),'true');
 await page.click('[data-action="saveNext"]');await page.waitForFunction(()=>document.querySelector('.te-head').textContent.includes('LAYOUT-B'));assert.equal((await metrics()).teDocumentScroll.scroll,0);assert.equal((await metrics()).teControls.scroll,0);assert.equal(await page.locator('[data-action="sub"]').isEnabled(),true);
 await page.click('[data-action="prev"]');await page.waitForFunction(()=>document.querySelector('.te-head').textContent.includes('LAYOUT-A'));assert.equal((await metrics()).teDocumentScroll.scroll,0);assert.ok((await page.locator('[data-field="answer"]').innerText()).includes('已验证末尾编辑'));
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:390,height:844}]){
  await page.setViewportSize(viewport);m=await metrics();assert.ok(m.teDocumentScroll.height>150);assert.ok(m.teControls.height>80);assert.ok(await page.locator('.te-foot [data-action="save"]').isVisible());
  await page.click('[data-mode="before"]');await page.click('[data-mode="edit"]');assert.equal(await page.locator('[data-field="stem"]').getAttribute('contenteditable'),'true');
  assert.ok(await page.evaluate(()=>{const d=document.querySelector('#teacherEditorDialog');return d.scrollWidth<=d.clientWidth+2;}),'no horizontal dialog overflow');
 }
 if(process.env.EDITOR_LAYOUT_SCREENSHOT){await page.setViewportSize({width:1440,height:900});await page.click('[data-action="jumpStem"]');await page.selectOption('#teGroup','常用');await right.evaluate(n=>n.scrollTop=0);await page.screenshot({path:process.env.EDITOR_LAYOUT_SCREENSHOT});await page.click('[data-action="jumpAnswer"]');await page.screenshot({path:process.env.EDITOR_LAYOUT_SCREENSHOT.replace(/\.png$/,'-answer.png')});}
 await page.click('[data-action="close"]');await page.waitForFunction(()=>document.documentElement.style.overflow!=='hidden');assert.equal(await page.locator('#qualityReviewDialog').isVisible(),true);assert.deepEqual(errors,[]);
 console.log('PASS: two-pane layout, independent real wheel scrolling, long-question end editing, read-only comparison, preserved selection, preview modes, save-next reset, desktop/mobile bounds, background unlock');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
