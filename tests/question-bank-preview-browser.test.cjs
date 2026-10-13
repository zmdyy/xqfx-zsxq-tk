'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const u=decodeURIComponent(req.url.split('?')[0]),p=path.resolve(root,'.'+u+(u.endsWith('/')?'index.html':''));if(!p.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(p,(e,d)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html;charset=utf-8','.json':'application/json','.woff2':'font/woff2'}[path.extname(p)]||'application/octet-stream'));res.end(d);});});
const image=label=>'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><rect width="360" height="120" fill="'+(label==='A'?'#bce5dc':'#d9e8f7')+'"/><text x="155" y="90" font-size="60">'+label+'</text></svg>').toString('base64');
const q=(id,stem,answer='答案',more={})=>({id,source:'打印预览验收样例（非正式题库）',sourceNo:id,type:'综合题',stem,answer,images:[],answerImages:[],parts:[],tags:[],review:'approved',revision:1,...more});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port+'/question-bank/');await page.waitForFunction(()=>document.querySelector('#conceptFilter').options.length>200);
 const items=[...Array.from({length:4},(_,i)=>q('SHORT'+i,'短题'+i+'：根据图示判断物理现象。')),
 q('LONG',Array.from({length:10},(_,i)=>'题干段'+i+'：登月服由多层结构组成，包括舒适层、保暖层、水冷服、气密限制层和外保护层，请说明其作用。').join('\n'),Array.from({length:24},(_,i)=>'解析段'+i+'：根据已知条件分析物理量，写出关系式，再代入数据并说明计算结果。').join('\n')),
 q('OPTIONS','选择正确说法。\nA. 第一项的文字说明。\n这一段仍是A项的内容。\nB. 第二项的文字说明。 C. 第三项。 D. 第四项。','正确选项为A',{type:'选择题',images:[{data:image('B'),optionLabel:'B'},{data:image('A'),optionLabel:'A'}]}),
 q('TABLE','读取实验数据并填写答题表。\n项目 | 数值\n电压 | \\(U_1=3\\)\n电流 | 0.2 A\n电阻 | 15 Ω','根据数据计算。'),
 q('MANY',Array.from({length:90},(_,i)=>'续页题干'+String(i).padStart(3,'0')+'：根据实验装置分析物理过程，写出物理量之间的关系并说明实验现象。').join('\n'),Array.from({length:80},(_,i)=>'续页答案'+String(i).padStart(3,'0')+'：列出表达式并说明所用的物理规律，核对单位后计算。').join('\n')),
 q('HUGE','不可拆分答题表。\n项目 | 数值\n'+Array.from({length:65},(_,i)=>'实验'+i+' | 待填写').join('\n'))];
 await page.evaluate(qs=>new Promise(resolve=>{const r=indexedDB.open('PhysicsTrainingBankV1');r.onsuccess=()=>{const tx=r.result.transaction('questions','readwrite');qs.forEach(q=>tx.objectStore('questions').put(q));tx.oncomplete=()=>{r.result.close();resolve();};};}),items);await page.reload();await page.waitForSelector('[data-add="LONG"]');
 const basket=async ids=>{if(await page.locator('#previewDialog').isVisible())await page.click('#previewCloseBtn');const b=page.locator('#clearBasketBtn');await b.click();for(const id of ids)await page.locator('[data-add="'+id+'"]').click();};
 const preview=async layout=>{await page.selectOption('#layout',layout);await page.click('#previewBtn');await page.waitForFunction(()=>document.querySelector('#previewStatus').textContent.includes('采用')||document.querySelector('#previewStatus').textContent.includes('预览失败'));assert.ok(!(await page.locator('#previewStatus').innerText()).includes('预览失败'));};
 const checkBounds=async()=>page.evaluate(()=>[...document.querySelectorAll('.sheet:not(.oversize) .paper-block')].map(b=>{const r=b.getBoundingClientRect(),c=b.closest('.paper-column').getBoundingClientRect();return {id:b.dataset.blockId,contained:r.bottom<=c.bottom+1&&r.right<=c.right+1&&r.top>=c.top-1};}));
 await basket(['SHORT0','SHORT1','SHORT2','SHORT3']);await preview('double');
 let groups=await page.locator('#previewFront .paper-column').evaluateAll(cols=>cols.map(c=>[...c.querySelectorAll('.paper-block')].map(b=>Number(b.dataset.question))));assert.deepEqual(groups,[[1,2],[3,4]],'continuous sequence must replace odd/even assignment');
 assert.ok((await checkBounds()).every(x=>x.contained));
 await basket(['LONG','OPTIONS','TABLE']);await preview('double');assert.equal(await page.locator('.sheet[data-side="front"]').count(),1);assert.equal(await page.locator('.sheet[data-side="back"]').count(),1);
 groups=await page.locator('#previewFront .paper-column').evaluateAll(cols=>cols.map(c=>[...c.querySelectorAll('[data-question="1"]')].map(b=>b.dataset.blockId)));assert.ok(groups[0].length&&groups[1].length,'one long question may continue into the right column');
 const options=page.locator('#previewFront .paper-block.option');assert.equal(await options.count(),4);assert.ok((await options.filter({has:page.locator('[alt="第2题选项A插图"]')}).innerText()).includes('这一段仍是A项'));
 assert.equal(await page.locator('[data-option="A"] img').getAttribute('src'),image('A'));assert.equal(await page.locator('[data-option="B"] img').getAttribute('src'),image('B'));assert.equal(await page.locator('#previewFront .paper-block.table').count(),1);assert.equal(await page.locator('#previewFront .paper-data-table tr').count(),4);
 assert.ok((await checkBounds()).every(x=>x.contained));
 if(process.env.PREVIEW_SCREENSHOT_DIR){
  fs.mkdirSync(process.env.PREVIEW_SCREENSHOT_DIR,{recursive:true});
  const html=await page.evaluate(()=>'<base href="'+location.href+'">'+[...document.querySelectorAll('head link[rel="stylesheet"]')].map(l=>l.outerHTML).join('')+'<style>body{margin:0;background:white}</style>'+document.querySelector('#printPreview').innerHTML),shot=await browser.newPage({viewport:{width:900,height:1250}});
  await shot.setContent(html);await shot.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]));
  await shot.locator('#previewFront').screenshot({path:path.join(process.env.PREVIEW_SCREENSHOT_DIR,'continuous-front.png')});await shot.locator('#previewBack').screenshot({path:path.join(process.env.PREVIEW_SCREENSHOT_DIR,'continuous-answer.png')});await shot.close();
 }
 await page.click('#previewCloseBtn');await preview('auto');assert.equal(await page.locator('#previewFront .questions.double').count(),1,'automatic mode should switch to double columns when single does not fit');assert.equal(await page.locator('.sheet[data-side="front"]').count(),1);assert.equal(await page.locator('.sheet[data-side="back"]').count(),1);assert.ok((await checkBounds()).every(x=>x.contained));
 await basket(['MANY']);await preview('double');assert.ok(await page.locator('.sheet[data-side="front"]').count()>1);assert.ok(await page.locator('.sheet[data-side="back"]').count()>1);
 const sequence=await page.locator('.sheet[data-side="front"] .paper-block').evaluateAll(bs=>bs.map(b=>b.textContent.match(/续页题干(\d+)/)?.[1]));assert.deepEqual(sequence,Array.from({length:90},(_,i)=>String(i).padStart(3,'0')));const answers=await page.locator('.sheet[data-side="back"] .paper-block').evaluateAll(bs=>bs.map(b=>b.textContent.match(/续页答案(\d+)/)?.[1]));assert.deepEqual(answers,Array.from({length:80},(_,i)=>String(i).padStart(3,'0')));assert.ok((await checkBounds()).every(x=>x.contained));
 const labels=await page.locator('.page-label').allTextContents();assert.ok(labels.every((s,i)=>s.endsWith((i+1)+'/'+labels.length)));assert.equal(await page.locator('#previewStatus').getAttribute('data-overflow'),'yes','more than front/back two pages is still reported for stage-four export handling');
 await basket(['HUGE']);await preview('double');assert.equal(await page.locator('.sheet.oversize').count(),1);assert.equal(await page.locator('.sheet.oversize .paper-data-table tr').count(),66);assert.ok(await page.locator('.sheet.oversize .page-warning').isVisible());assert.ok(await page.locator('.sheet.oversize').evaluate(s=>s.getBoundingClientRect().height>1123));assert.equal(await page.locator('#previewStatus').getAttribute('data-overflow'),'yes');
 assert.ok(await page.locator('.sheet.oversize').evaluate(s=>s.querySelector('.paper-data-table').getBoundingClientRect().bottom<s.querySelector('.foot').getBoundingClientRect().top),'oversized table must remain above the footer');
 assert.deepEqual(errors,[]);console.log('PASS: sequential balanced columns, long-question and answer flow, atomic options/images/tables, exact multi-page content/order/counts and visible oversized tables');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
