/* Shared print blocks. Pagination moves whole blocks, never the question number parity. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const settings={widthMm:210,heightMm:297,topMm:14,bottomMm:14,sideMm:15,gapMm:9,fontPt:11};
function mathRanges(text){return [...text.matchAll(/\\\([\s\S]*?\\\)/g)].map(m=>[m.index,m.index+m[0].length]);}
function outside(ranges,pos){return !ranges.some(([a,b])=>pos>=a&&pos<b);}
function lines(text){const ranges=mathRanges(text),out=[];let start=0;for(let i=0;i<text.length;i++)if(text[i]==='\n'&&outside(ranges,i)){out.push(text.slice(start,i));start=i+1;}out.push(text.slice(start));return out;}
function tableCells(line){const ranges=mathRanges(line),cells=[];let start=0;for(let i=0;i<line.length;i++)if(line[i]==='|'&&outside(ranges,i)){cells.push(line.slice(start,i).trim());start=i+1;}cells.push(line.slice(start).trim());return cells;}
function paragraphs(text){
 const list=lines(text),out=[];
 for(let i=0;i<list.length;){
  if(tableCells(list[i]).length>1&&i+1<list.length&&tableCells(list[i+1]).length>1){const rows=[];while(i<list.length&&tableCells(list[i]).length>1)rows.push(tableCells(list[i++]));out.push({kind:'table',rows});}
  else{const line=list[i++].trim();if(line)out.push({kind:'paragraph',text:line});}
 }return out;
}
function splitOptions(blocks,choice){
 const all=blocks.filter(b=>b.kind==='paragraph').map(b=>b.text).join('\n'),ranges=mathRanges(all);
 const marks=[...all.matchAll(/([A-D])[.．、:：)）]/g)].filter(m=>outside(ranges,m.index)&&(!m.index||!/[A-Za-z]/.test(all[m.index-1])));
 let chosen=null;for(let i=marks.length-1;i>=0;i--){if(marks[i][1]!=='A')continue;const list=marks.slice(i);if((choice?list.length>=1:list.length>=3)&&list.every((m,j)=>!j||m[1].charCodeAt(0)>list[j-1][1].charCodeAt(0))&&list.every((m,j)=>all.slice(m.index+m[0].length,list[j+1]?.index??all.length).trim())){chosen=list;break;}}
 if(!chosen)return blocks;
 const positions=new Set(chosen.map(m=>m.index)),out=[];let active=null,offset=0;
 for(const b of blocks){
  if(b.kind==='table'){out.push(b);active=null;continue;}
  const rs=mathRanges(b.text),ms=[...b.text.matchAll(/([A-D])[.．、:：)）]/g)].filter(m=>outside(rs,m.index)&&positions.has(offset+m.index));offset+=b.text.length+1;
  if(!ms.length){if(active)active.text+='\n'+b.text;else out.push(b);continue;}
  const prefix=b.text.slice(0,ms[0].index).trim();if(prefix){if(active)active.text+='\n'+prefix;else out.push({kind:'paragraph',text:prefix});}
  ms.forEach((m,i)=>{active={kind:'option',label:m[1],text:b.text.slice(m.index,ms[i+1]?.index??b.text.length).trim()};out.push(active);});
 }return out;
}
// Presentation only: never change stored source text. Math and table spacing remain intact.
function fillBlanks(text,render){
 return lines(String(text||'')).map(line=>{
  if(tableCells(line).length>1)return line;
  const ranges=mathRanges(line);
  return line.replace(/[ \t\u00a0\u3000]+/g,(gap,pos)=>{
   if(!outside(ranges,pos)||!line.slice(0,pos).trim()||!line.slice(pos+gap.length).trim())return gap;
   if((line[pos-1]==='('&&line[pos+gap.length]===')')||(line[pos-1]==='（'&&line[pos+gap.length]==='）'))return gap;
   if(gap.length<2&&!/[\t]/.test(gap)&&!(/^[\u00a0\u3000]{2,}$/.test(gap)))return gap;
   // Keep existing underline runs and English word alignment unchanged.
   if(/[A-D][.．、:：)）]$/.test(line.slice(0,pos))||line[pos-1]==='_'||line[pos+gap.length]==='_'||(/[A-Za-z]/.test(line[pos-1])&&/[A-Za-z]/.test(line[pos+gap.length])))return gap;
   return render?render(gap):'_'.repeat(Math.max(6,Math.min(20,gap.length)));
  });
 }).join('\n');
}
function selectAnswerSections(text,extras=[]){
 text=String(text||'');const ranges=mathRanges(text),marks=[...text.matchAll(/【(答案|知识点|分析|解析|解答)】/g)].filter(m=>outside(ranges,m.index));
 if(!marks.length)return text; // Unlabelled legacy answers stay usable.
 const allowed=new Set(['答案','解答',...extras]);
 const pieces=[text.slice(0,marks[0].index)];
 marks.forEach((m,i)=>{if(allowed.has(m[1]))pieces.push(text.slice(m.index,marks[i+1]?.index??text.length));});
 return pieces.join('').trim()||'本题仅有未勾选的答案栏目，请勾选对应栏目后导出。';
}
function itemBlocks(item,num,answerSide=false,options={}){
 const raw=(answerSide?selectAnswerSections(item.answer,options.answerSections):fillBlanks(item.stem)).replace(/^\s*\d{1,3}(?:[．、]|\.(?!\d))\s*/,''),blocks=answerSide?paragraphs(raw):splitOptions(paragraphs(raw),/选择/.test(item.q?.type||''));
 if(!blocks.length)blocks.push({kind:'paragraph',text:answerSide?'答案待核对':'题干缺失'});
 const sources=answerSide?item.answerImages||[]:item.images||[],details=answerSide?item.answerImageDetails||[]:item.imageDetails||[];
 let unboundOptions=null;
 if(!answerSide&&sources.length){
  const blank=[];while(blocks.length&&blocks[blocks.length-1].kind==='paragraph'&&/^(?:[A-D][.．、:：)）]\s*)+$/.test(blocks[blocks.length-1].text))blank.unshift(blocks.pop().text);
  if(blank.length){unboundOptions={kind:'option-group',text:blank.join('\n'),images:[]};blocks.push(unboundOptions);}
 }
 sources.forEach((src,i)=>{
  const info=details[i]||{},specified=String(info.optionLabel||'').toUpperCase().replace(/[.．、:：)）]/g,''),map=item.optionImageIndexes||{},mapped=Object.keys(map).find(k=>Array.isArray(map[k])&&map[k].includes(info.sourceIndex??i)),label=specified||mapped;
  const option=!answerSide&&label?blocks.find(b=>b.kind==='option'&&b.label===label):null;
  const image={src,displayWidth:info.displayWidth,sourceIndex:info.sourceIndex??i};
  if(option){option.images??=[];option.images.push(image);}else if(unboundOptions)unboundOptions.images.push(image);else blocks.push({kind:'image',images:[image]});
 });
 return blocks.map((b,i)=>({...b,number:num,itemId:item.id,index:i,first:i===0,last:i===blocks.length-1,id:'q'+num+'b'+i,answerSide}));
}
function renderBlock(block,math=root.PhysicsMathContent){
 const inline=t=>math?math.inline(t):esc(t),number=block.first?'<b class="paper-number">'+block.number+'.</b> ':'';
 let content='';
 if(block.kind==='table')content=number+'<table class="paper-data-table">'+block.rows.map((row,i)=>'<tr>'+row.map(c=>'<'+(i?'td':'th')+'>'+inline(c)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>';
 else if(block.text!==undefined)content='<div class="paper-text">'+number+inline(block.text)+'</div>';
 else content=number;
 if(block.images?.length)content+='<div class="images">'+block.images.map(im=>'<img alt="第'+block.number+'题'+(block.label?'选项'+block.label:'')+'插图" src="'+esc(im.src)+'"'+(im.displayWidth?' style="max-width:min(100%,'+Math.max(80,Math.min(1200,Number(im.displayWidth)||320))+'px)"':'')+'>').join('')+'</div>';
 return '<div class="paper-block '+block.kind+(block.first?' question-start':'')+(block.last?' question-end':'')+'" data-block-id="'+block.id+'" data-question="'+block.number+'" data-kind="'+block.kind+'"'+(block.label?' data-option="'+esc(block.label)+'"':'')+'>'+content+'</div>';
}
function feedbackRows(answer=false){return answer?[['核对后：□ 能独立重做　□ 看懂但有困难　□ 需要教师讲解']]:[
 ['学生反馈表（完成后勾选，不影响评分）'],
 ['完成：□ 独立完成　□ 某一步卡住　□ 需要提示'],
 ['针对性：□ 正好练到　□ 部分相关　□ 不太适合'],
 ['困难：□ 题图　□ 规律　□ 步骤衔接　□ 作图表达　□ 其他：________']
];}
const style=`.sheet,.sheet *{box-sizing:border-box}.paper.sheet,.sheet{background:white;color:#111;font:${settings.fontPt}pt "Microsoft YaHei",SimSun,sans-serif;width:${settings.widthMm}mm;height:${settings.heightMm}mm;padding:${settings.topMm}mm ${settings.sideMm}mm ${settings.bottomMm}mm;position:relative;display:flex;flex-direction:column;overflow:visible;flex-shrink:0;page-break-after:always}.sheet:last-child{page-break-after:auto}.sheet h2{text-align:center;font-size:17pt;margin:0 0 5mm}.sheet .meta{text-align:center;font-size:10pt;border-bottom:1px solid #888;padding-bottom:4mm;margin-bottom:5mm}.sheet .questions{display:grid;grid-template-columns:minmax(0,1fr);gap:${settings.gapMm}mm;flex:1 1 0;min-height:0;align-items:stretch}.sheet .questions.double{grid-template-columns:repeat(2,minmax(0,1fr))}.sheet .paper-column{display:flex;flex-direction:column;min-width:0;min-height:0}.sheet .paper-block{flex-shrink:0;min-width:0;break-inside:avoid;page-break-inside:avoid;margin:0 0 3mm;overflow-wrap:anywhere}.sheet .question-start:not(:first-child){margin-top:2mm}.sheet .question-end{margin-bottom:5mm}.sheet .paper-text{white-space:pre-wrap;line-height:1.58}.sheet .images{display:flex;flex-wrap:wrap;gap:3mm;margin-top:2mm}.sheet .images img{max-width:100%;max-height:67mm;width:auto;height:auto;object-fit:contain}.sheet .double .images img{max-height:49.5mm}.sheet .option-group .images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.sheet .option-group .images img{max-width:100%;justify-self:start}.sheet .paper-data-table{border-collapse:collapse;width:100%;table-layout:fixed;line-height:1.5}.sheet .paper-data-table td,.sheet .paper-data-table th{border:1px solid #999;padding:1.5mm;white-space:pre-wrap;overflow-wrap:anywhere}.sheet .feedback-slot{flex:none;padding-top:4mm}.sheet .feedback{width:100%;border-collapse:collapse;font-size:9pt;margin:0}.sheet .feedback td,.sheet .feedback th{border:1px solid #aaa;padding:2mm;text-align:left}.sheet .foot{position:static;flex:none;width:100%;display:flex;justify-content:space-between;color:#666;font-size:9pt;padding-top:3mm;gap:5mm}.sheet .foot span:last-child{white-space:nowrap}.paper.sheet.oversize,.sheet.oversize{height:auto;min-height:${settings.heightMm}mm}.sheet.oversize .questions{flex:none}.sheet .page-warning{font-size:9pt;color:#a12c22;margin:0 0 2mm}.sheet .page-warning[hidden]{display:none}@media print{.sheet{box-shadow:none!important;margin:0!important}.sheet-container{display:block;max-height:none;overflow:visible;padding:0}@page{size:A4;margin:0}}`;
function paginate(host){
 if(!root.document?.createElement||!host.querySelectorAll)return null;
 const faces=[...host.querySelectorAll('.sheet[data-side]')];if(!faces.length)return null;
 const results={frontPages:0,backPages:0,oversize:0,pages:[]};
 for(const source of faces){
  const side=source.dataset.side,blocks=[...source.querySelectorAll('.paper-block')],template=source.cloneNode(true);let page,column=0,used=0,capacity=0,hasOversize=false;
  const pages=[];
  function newPage(){
   page=template.cloneNode(true);page.querySelectorAll('.paper-column').forEach(c=>c.replaceChildren());page.id=(side==='front'?'previewFront':'previewBack')+(pages.length?'_'+(pages.length+1):'');page.dataset.facePage=String(pages.length+1);source.before(page);pages.push(page);column=0;used=0;hasOversize=false;capacity=page.querySelector('.questions').getBoundingClientRect().height-12;return page;
  }
  newPage();
  for(const block of blocks){
   if(hasOversize)newPage();
   let col=page.querySelectorAll('.paper-column')[column];col.append(block);
   let css=root.getComputedStyle(block),height=block.getBoundingClientRect().height+parseFloat(css.marginTop||0)+parseFloat(css.marginBottom||0);
   if(used+height>capacity+1&&col.children.length>1){
    block.remove();const cols=page.querySelectorAll('.paper-column');if(column+1<cols.length){column++;used=0;}else newPage();col=page.querySelectorAll('.paper-column')[column];col.append(block);css=root.getComputedStyle(block);height=block.getBoundingClientRect().height+parseFloat(css.marginTop||0)+parseFloat(css.marginBottom||0);
   }
   if(height>capacity+1){
    page.classList.add('oversize');const warning=page.querySelector('.page-warning');warning.hidden=false;warning.textContent='此处不可拆分内容超过一页高度，已完整显示，请检查打印效果。';page.querySelector('.questions').style.minHeight=(height+12)+'px';hasOversize=true;results.oversize++;
   }
   used+=height;
  }
  const last=pages[pages.length-1],cols=last.querySelectorAll('.paper-column');
  if(cols.length===2&&!last.classList.contains('oversize')){
   const list=[...cols[0].children,...cols[1].children],heights=list.map(b=>{const css=root.getComputedStyle(b);return b.getBoundingClientRect().height+parseFloat(css.marginTop||0)+parseFloat(css.marginBottom||0);}),total=heights.reduce((a,b)=>a+b,0);let sum=0,best=Infinity,cut=0;
   for(let i=1;i<list.length;i++){sum+=heights[i-1];const score=Math.max(sum,total-sum);if(score<=capacity+1&&score<best){best=score;cut=i;}}
   if(cut){cols[0].replaceChildren(...list.slice(0,cut));cols[1].replaceChildren(...list.slice(cut));}
  }
  pages.forEach((p,i)=>{if(i!==pages.length-1)p.querySelector('.feedback-slot').style.visibility='hidden';});
  results[side+'Pages']=pages.length;results.pages.push(...pages);source.remove();
 }
 results.pages.forEach((p,i)=>{const answer=p.dataset.side==='back',n=p.dataset.facePage,total=answer?results.backPages:results.frontPages;p.querySelector('.page-label').textContent=(answer?'答案':'题目')+' '+n+'/'+total+' · '+(i+1)+'/'+results.pages.length;});
 return {...results,pages:results.pages.map(p=>({side:p.dataset.side,number:Number(p.dataset.facePage),oversize:p.classList.contains('oversize')}))};
}
root.PhysicsPaperLayout={settings,style,feedbackRows,fillBlanks,selectAnswerSections,paragraphs,splitOptions,itemBlocks,renderBlock,paginate};if(typeof module!=='undefined')module.exports=root.PhysicsPaperLayout;
})(typeof window!=='undefined'?window:globalThis);

