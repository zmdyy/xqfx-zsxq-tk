'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]),p=path.resolve(root,'.'+u+(u.endsWith('/')?'index.html':''));if(!p.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(p,(e,d)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html;charset=utf-8','.json':'application/json','.woff2':'font/woff2'}[path.extname(p)]||'application/octet-stream'));res.end(d)})});
const svg=label=>'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="#eee" stroke="#333"/><text x="30" y="100" font-size="50">'+label+'</text></svg>').toString('base64');
const longStem='23．实验室有额定电压U额相同但额定功率未标识的灯泡L1和L2。先将L1接入如图所示电路的a、b两点之间，闭合开关S，电压表示数为U1；断开开关S，取下L1后，将L2接入电路的a、b两点之间，闭合开关S，电压表示数为U2，发现U1>U2。已知电源两端电压恒为U，R0为定值电阻。分析比较灯泡L1和L2的额定功率P1和P2的大小。';
const questions=[
 {id:'PAGE-LONG',source:'海淀一模.docx',sourceNo:'23',stem:longStem,answer:('当灯泡L1连接在a、b两点之间时：电路电流为I1，电阻R0两端电压U0 = U - U1。\n').repeat(14),tags:['电功率'],type:'实验题',revision:1,review:'pending',images:[{data:svg('circuit')}],answerImages:[],parts:[]},
 {id:'PAGE-OPT',source:'西城二模.docx',sourceNo:'10',stem:'10．为了解决通风问题，设计了图中所示的四种方案，其中有效的是（　　）\nA．\nB．\nC．\nD．',answer:'C',tags:['流体压强与流速的关系'],type:'选择题',revision:1,review:'pending',images:['A','B','C','D'].map(x=>({data:svg('plan '+x)})),answerImages:[],parts:[]}
];
for(let i=0;i<3;i++)questions.push({id:'PAGE-FLOW-'+i,source:'流式.docx',sourceNo:String(i+1),stem:(i+1)+'．'+('如图所示，甲、乙两个相同的直柱形容器静置在水平桌面上，其内装有质量相同且温度均为t1的水。').repeat(9)+'\nA．水温升高时压强增大\nB．拉力先增大后减小\nC．压力不变\nD．压强之差达到最大',answer:'A',tags:['压强'],type:'选择题',revision:1,review:'approved',images:[],answerImages:[],parts:[]});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage({viewport:{width:1366,height:680}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const url='http://127.0.0.1:'+server.address().port+'/question-bank/';await page.goto(url);await page.waitForFunction(()=>document.querySelector('#conceptFilter').options.length>200);
 await page.evaluate(items=>new Promise((resolve,reject)=>{const r=indexedDB.open('PhysicsTrainingBankV1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('questions','readwrite');items.forEach(q=>tx.objectStore('questions').put(q));tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}}),questions);
 const read=id=>page.evaluate(id=>new Promise(resolve=>{const r=indexedDB.open('PhysicsTrainingBankV1');r.onsuccess=()=>{const q=r.result.transaction('questions').objectStore('questions').get(id);q.onsuccess=()=>{r.result.close();resolve(q.result)}}}),id);
 await page.reload();await page.waitForSelector('.qcard');

 // 导入 Word 时记录选项图位置：图片前最近的选项字母即所属选项。
 const Zip=require(path.join(root,'jszip.min.js')),docx=new Zip(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 const W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
 const pic=rid=>'<w:r><w:drawing><a:graphic><a:graphicData><a:blip r:embed="'+rid+'"/></a:graphicData></a:graphic></w:drawing></w:r>',t=x=>'<w:r><w:t xml:space="preserve">'+x+'</w:t></w:r>';
 docx.file('word/document.xml','<w:document '+W+'><w:body><w:p>'+t('1．如图所示，下列方案中有效的是（　　）')+pic('rId4')+'</w:p><w:p>'+t('A．')+pic('rId5')+t('　B．')+pic('rId6')+'</w:p><w:p>'+t('答案解析部分')+'</w:p><w:p>'+t('1．【答案】B')+'</w:p></w:body></w:document>');
 docx.file('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+[4,5,6].map(n=>'<Relationship Id="rId'+n+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image'+n+'.png"/>').join('')+'</Relationships>');
 for(const n of [4,5,6])docx.file('word/media/image'+n+'.png',Buffer.concat([png,Buffer.from([n])]));
 await page.locator('#fileInput').setInputFiles({name:'option-import.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await docx.generateAsync({type:'nodebuffer'})});
 await page.waitForFunction(()=>document.querySelector('#results').innerText.includes('下列方案中有效的是'));
 const imported=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('PhysicsTrainingBankV1');r.onsuccess=()=>{const q=r.result.transaction('questions').objectStore('questions').getAll();q.onsuccess=()=>{r.result.close();resolve(q.result.find(x=>x.source==='option-import.docx'))}}}));
 assert.deepEqual(imported.images.map(x=>x.option||''),['','A','B'],'stem figure unanchored; option figures keep their letter');

 // 质量审核是整页视图：独占窗口、只有一个滚动区域，可用地址直接打开和后退返回。
 await page.click('#qualityReviewBtn');await page.waitForSelector('#qualityReviewDialog[open]');
 const pageState=await page.evaluate(()=>{const d=document.querySelector('#qualityReviewDialog').getBoundingClientRect(),c=document.querySelector('#qrContent'),b=document.querySelector('#qrUnifiedEditor').getBoundingClientRect(),cr=c.getBoundingClientRect();return{hash:location.hash,w:d.width,h:d.height,docScroll:document.documentElement.scrollHeight,main:getComputedStyle(document.querySelector('body>main')).display,overflow:c.scrollHeight-c.clientHeight,btnVisible:b.height>0&&b.bottom<=cr.top+1,inContent:!!c.querySelector('#qrUnifiedEditor')}});
 assert.equal(pageState.hash,'#review');assert.equal(pageState.w,1366);assert.equal(pageState.h,680);assert.equal(pageState.docScroll,680,'homepage must not scroll behind the review page');assert.equal(pageState.main,'none');
 assert.equal(pageState.overflow,0,'review content must not be clipped by the editor button');assert.ok(pageState.btnVisible&&!pageState.inContent,'physics editor entry sits in the fixed toolbar');

 // 编辑器正文可以滚动，同类建议和全部建议可一次采用并整体撤销。
 await page.locator('#qrList [data-id="PAGE-LONG"]').evaluate(b=>b.click());await page.click('#qrUnifiedEditor');await page.waitForSelector('#teacherEditorDialog[open]');
 const main=page.locator('.te-main'),box=await main.boundingBox();assert.ok(await main.evaluate(m=>m.scrollHeight>m.clientHeight),'editor body is height-constrained');
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,500);await page.waitForFunction(()=>document.querySelector('.te-main').scrollTop>0);
 const total=Number((await page.locator('#teIssue b').innerText()).match(/本题 (\d+) 处/)[1]);assert.ok(total>10);
 await page.locator('[data-action="acceptAll"]').click();await page.locator('#teIssue',{hasText:'未发现本轮规则覆盖的书写疑点'}).waitFor();
 assert.equal(await page.locator('[data-action="acceptAll"]').count(),0);
 assert.ok((await page.locator('[data-field="stem"]').evaluate(el=>PhysicsTeacherEditor.serialize(el))).includes('U_{2}'));
 await page.locator('[data-action="undo"]').first().click();assert.ok((await page.locator('#teIssue b').innerText()).includes('本题 '+total+' 处'),'one undo restores the whole batch');
 assert.equal((await read('PAGE-LONG')).stem,longStem,'batch accept is a draft until saved');
 await page.locator('[data-action="cancel"]').click();await page.locator('#teacherEditorDialog [data-action="close"]').click();

 // 选项图：按顺序配给 A/B/C/D 后在审核、A4 预览中都紧跟对应选项。
 await page.locator('[data-dim="image"]').click();await page.locator('#qrList [data-id="PAGE-OPT"]').evaluate(b=>b.click());
 assert.ok((await page.locator('#qrContent').innerText()).includes('选项图配位建议'));
 await page.click('[data-apply-option-images]');await page.locator('#qrList [data-id="PAGE-OPT"]').waitFor({state:'detached'});
 assert.deepEqual((await read('PAGE-OPT')).images.map(x=>x.option),['A','B','C','D']);
 await page.selectOption('#qrScope','all');await page.locator('#qrList [data-id="PAGE-OPT"]').evaluate(b=>b.click());await page.locator('.qr-option-cell').nth(3).waitFor();
 assert.deepEqual(await page.locator('.qr-option-cell > b').allInnerTexts(),['A．','B．','C．','D．']);assert.ok(!(await page.locator('#qrContent').innerText()).includes('选项图配位建议'),'applied suggestion is not offered again');
 await page.click('#qrClose');assert.equal(await page.evaluate(()=>location.hash),'');assert.equal(await page.locator('#qualityReviewDialog').isVisible(),false);
 await page.goto(url+'#review');await page.waitForSelector('#qualityReviewDialog[open]');await page.goBack();await page.locator('#qualityReviewDialog').waitFor({state:'hidden'});

 // A4 双栏按真实分栏续排：长题可以从左栏接到右栏，不再固定 1/3 左、2/4 右。
 await page.waitForSelector('.qcard');
 for(const id of ['PAGE-OPT','PAGE-FLOW-0','PAGE-FLOW-1','PAGE-FLOW-2'])await page.locator('[data-add="'+id+'"]').click();
 await page.selectOption('#layout','double');await page.click('#previewBtn');await page.waitForSelector('#previewDialog[open] #previewFront');
 const sheet=await page.evaluate(()=>{const q=document.querySelector('#previewFront .questions.double');const items=[...q.querySelectorAll('.question')];return{columns:getComputedStyle(q).columnCount,fixedColumns:document.querySelectorAll('#previewFront .paper-column').length,split:items.some(el=>el.getClientRects().length>1),optionImages:[...document.querySelectorAll('#previewFront .option-grid .option-cell img')].length,firstStem:items[0].querySelector('.stem').textContent.slice(0,6)}});
 assert.equal(sheet.columns,'2');assert.equal(sheet.fixedColumns,0);assert.ok(sheet.split,'a question may continue from the left column into the right one');
 assert.equal(sheet.optionImages,4,'option figures follow their options in the A4 preview');assert.equal(sheet.firstStem,'1. 为了解','original question number is not repeated after the paper number');
 assert.deepEqual(errors,[]);
 console.log('PASS: Word import keeps option figure positions, full-page review, toolbar editor entry, scrollable editor, batch accept + undo, option figure mapping, flowing two-column A4');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
