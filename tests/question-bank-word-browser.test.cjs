'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright'),JSZip=require('../jszip.min.js');
const root=path.resolve(__dirname,'..'),output=process.env.WORD_TEST_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'question-bank-word-'));
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]),p=path.resolve(root,'.'+u+(u.endsWith('/')?'index.html':''));if(!p.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(p,(e,d)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html;charset=utf-8','.json':'application/json'}[path.extname(p)]||'application/octet-stream'));res.end(d);});});
const image=label=>'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><rect width="360" height="120" fill="'+(label==='A'?'#bce5dc':'#d9e8f7')+'"/><text x="155" y="90" font-size="60">'+label+'</text></svg>').toString('base64');
const q=(id,stem,answer='答案',more={})=>({id,source:'Word 排版验收样例',sourceNo:id,type:'综合题',stem,answer,images:[],answerImages:[],parts:[],tags:[],review:'approved',revision:1,...more});
(async()=>{
 fs.mkdirSync(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];let confirmations=0;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{confirmations++;return d.accept();});
 await page.goto('http://127.0.0.1:'+server.address().port+'/question-bank/');await page.waitForFunction(()=>document.querySelector('#conceptFilter').options.length>200);
 const items=[q('FLOW',Array.from({length:10},(_,i)=>'题干段'+i+'：登月服由多层结构组成，包括舒适层、保暖层、水冷服、气密限制层和外保护层，请说明其作用。').join('\n'),Array.from({length:24},(_,i)=>'解析段'+i+'：根据已知条件分析物理量，写出关系式，再代入数据并说明计算结果。').join('\n')),
 q('OPTIONS','选择正确说法。\nA. 第一项的文字说明。\n这一段仍是A项的内容。\nB. 第二项的文字说明。 C. 第三项。 D. 第四项。','正确选项为A',{type:'选择题',images:[{data:image('B'),optionLabel:'B'},{data:image('A'),optionLabel:'A'}]}),
 q('TABLE','读取实验数据并填写答题表。\n项目 | 数值\n电压 | \\(U_1=3\\)\n电流 | 0.2 A\n电阻 | 15 Ω','原生公式核对：\\(R_0^{\\prime}=\\frac{U_1}{I_1}\\)，\\(R_0=15\\,\\Omega\\)。'),
 q('MANY',Array.from({length:75},(_,i)=>'续页题干'+String(i).padStart(3,'0')+'：根据实验装置分析物理过程，写出物理量之间的关系并说明实验现象。').join('\n'),Array.from({length:65},(_,i)=>'续页答案'+String(i).padStart(3,'0')+'：列出表达式并说明所用的物理规律，核对单位后计算。').join('\n')),
 q('HUGE','不可拆分答题表。\n项目 | 数值\n'+Array.from({length:65},(_,i)=>'实验'+i+' | 待填写').join('\n'))];
 await page.evaluate(qs=>new Promise(resolve=>{const r=indexedDB.open('PhysicsTrainingBankV1');r.onsuccess=()=>{const tx=r.result.transaction('questions','readwrite');qs.forEach(q=>tx.objectStore('questions').put(q));tx.oncomplete=()=>{r.result.close();resolve();};};}),items);await page.reload();await page.waitForSelector('[data-add="FLOW"]');
 async function exportCase(ids,layout,name){
  if(await page.locator('#previewDialog').isVisible())await page.click('#previewCloseBtn');await page.click('#clearBasketBtn');for(const id of ids)await page.locator('[data-add="'+id+'"]').click();
  await page.selectOption('#layout',layout);await page.click('#previewBtn');await page.waitForFunction(()=>document.querySelector('#previewStatus').textContent.includes('采用'));
  const overflow=await page.locator('#previewStatus').getAttribute('data-overflow');
  await page.click('#previewExportBtn');await page.waitForSelector('#studentNameDialog[open]');
  const waiting=page.waitForEvent('download');await page.click('#exportGenericWord');const download=await waiting;await download.saveAs(path.join(output,name+'.docx'));
  await page.waitForFunction(()=>document.querySelector('#previewStatus').textContent.includes('Word 已生成：'));
  const message=await page.locator('#previewStatus').innerText();if(overflow==='yes')assert.match(message,/超出 A4.*仍已导出/);
  const zip=await JSZip.loadAsync(fs.readFileSync(path.join(output,name+'.docx'))),xml=await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/<w:cols w:num="2"/g)||[]).length,layout==='double'?2:0);assert.ok(zip.file('word/footer1.xml'));assert.ok(!xml.includes('altChunk'));assert.ok(!xml.includes('w:trHeight'));
  return {xml,zip,overflow};
 }
 const flow=await exportCase(['FLOW','OPTIONS','TABLE'],'double','continuous-double');
 assert.equal((flow.xml.match(/<w:tbl>/g)||[]).length,6,'experimental and feedback tables with single-cell keep containers only');assert.ok(flow.xml.indexOf('题干段9')<flow.xml.indexOf('A. 第一项'));assert.ok(flow.xml.indexOf('A. 第一项')<flow.xml.indexOf('B. 第二项'));
 assert.equal((flow.xml.match(/<w:drawing>/g)||[]).length,2);assert.ok(flow.xml.includes('<m:sSubSup>'),'prime remains superscript in native equation');
 const optionParagraph=flow.xml.match(/<w:p>(?:(?!<w:p>)[\s\S])*?A\. 第一项(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/)?.[0];assert.ok(optionParagraph.includes('<w:keepNext/>'));assert.ok(optionParagraph.includes('<w:keepLines/>'));assert.ok(optionParagraph.includes('这一段仍是A项'));
 const many=await exportCase(['MANY'],'single','overflow-single');assert.equal(many.overflow,'yes');assert.deepEqual([...many.xml.matchAll(/续页题干(\d{3})/g)].map(m=>m[1]),Array.from({length:75},(_,i)=>String(i).padStart(3,'0')));assert.deepEqual([...many.xml.matchAll(/续页答案(\d{3})/g)].map(m=>m[1]),Array.from({length:65},(_,i)=>String(i).padStart(3,'0')));
 const huge=await exportCase(['HUGE'],'double','oversized-table');assert.equal(huge.overflow,'yes');assert.equal((huge.xml.match(/<w:cantSplit\/>/g)||[]).length,73,'66 data rows, 5 feedback rows and 2 feedback keep containers are unsplittable');
 assert.equal(confirmations,0,'overflow must not introduce a confirmation');assert.deepEqual(errors,[]);
 console.log('PASS: actual native DOCX downloads, continuous block order, option-image keep rules, editable prime/subscript math, single/double overflow exports without confirmation and complete oversized-table rows');console.log('Word fixtures: '+output);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
