/* 纯浏览器原生 OOXML 组卷：不使用 HTML altChunk / TikZ / 外部API。
 * 数据来自教师本机 IndexedDB；图片真正嵌入 DOCX，不依赖网页路径。
 */
(function(root){
'use strict';
const MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PICREL=REL+'/image';
const DRAW='http://schemas.openxmlformats.org/drawingml/2006/main';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const escapeXml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const uncode=v=>v.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g,'');
function textRun(s,bold=false,size=21,vertical=''){
  return '<w:r><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/>'+(bold?'<w:b/>':'')+(vertical?'<w:vertAlign w:val="'+vertical+'"/>':'')+'<w:sz w:val="'+size+'"/></w:rPr><w:t xml:space="preserve">'+escapeXml(uncode(s))+'</w:t></w:r>';
}
function paragraph(text,opts={}){
 const align='<w:jc w:val="'+(opts.align||'left')+'"/>';
 const space='<w:spacing w:before="'+(opts.before||0)+'" w:after="'+(opts.after??100)+'" w:line="348" w:lineRule="atLeast"/>';
 const pPr='<w:pPr>'+(opts.keep?'<w:keepNext/>':'')+'<w:keepLines/><w:widowControl/><w:snapToGrid w:val="0"/>'+space+align+'</w:pPr>';
 const run=t=>root.PhysicsMathContent?root.PhysicsMathContent.tokens(t).map(piece=>{
   if(piece.type==='math'){
     if(!root.mml2omml)throw Error('原生Word公式转换模块未加载');
     return root.mml2omml(root.PhysicsMathContent.mathml(piece.text).replace(/<annotation[\s\S]*?<\/annotation>/g,''));
   }
   return piece.text.split('\n').map((line,i)=>(i?'<w:r><w:br/></w:r>':'')+root.PhysicsMathContent.unicodeRuns(line,(v,vertical)=>textRun(v,opts.bold,opts.size||21,vertical))).join('');
 }).join(''):textRun(t,opts.bold,opts.size||21);
 const runs=root.PhysicsMathContent?run(String(text??'')):String(text??'').split('\n').map((line,i)=>(i?'<w:r><w:br/></w:r>':'')+run(line)).join('');
 return '<w:p>'+pPr+runs+'</w:p>';
}
function smallTable(rows,width,keepAfter=false){
 const count=Math.max(...rows.map(r=>r.length),1),widths=Array.from({length:count},()=>Math.floor(width/count));
 const cellPoints=Math.max(20,width/count/20-9),estimated=rows.reduce((height,row)=>height+Math.max(...row.map(t=>String(t).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((w,c)=>w+(c.charCodeAt(0)>255?9.5:5.5),0)/cellPoints)),0)),1)*17.4+9,0);
 const cells=rows.map((row,ri)=>'<w:tr><w:trPr><w:cantSplit/>'+(ri===0?'<w:tblHeader/>':'')+'</w:trPr>'+Array.from({length:count},(_,i)=>{
 const cell=paragraph(row[i]||'',{size:19,after:35,keep:keepAfter||(estimated<=680&&(ri<rows.length-1||i<count-1))});
 return '<w:tc><w:tcPr><w:tcW w:w="'+widths[i]+'" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="AAAAAA"/><w:left w:val="single" w:sz="4" w:color="AAAAAA"/><w:bottom w:val="single" w:sz="4" w:color="AAAAAA"/><w:right w:val="single" w:sz="4" w:color="AAAAAA"/></w:tcBorders><w:tcMar><w:top w:w="70" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>'+cell+'</w:tc>'
 }).join('')+'</w:tr>').join('');
 const table='<w:tbl><w:tblPr><w:tblW w:w="'+width+'" w:type="dxa"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="AAAAAA"/><w:insideV w:val="single" w:sz="4" w:color="AAAAAA"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>'+widths.map(w=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid>'+cells+'</w:tbl>';
 // A single non-splitting container row also protects the whole table during
 // column balancing. Oversized tables must remain pageable to avoid clipping.
 if(estimated>680)return table;
 return '<w:tbl><w:tblPr><w:tblW w:w="'+width+'" w:type="dxa"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side=>'<w:'+side+' w:val="nil"/>').join('')+'</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="'+width+'"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="'+width+'" w:type="dxa"/></w:tcPr>'+table+'<w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p></w:tc></w:tr></w:tbl>';
}
// Section properties describe the current section, including how it starts.
// Body content uses genuine Word columns; headings and feedback use one column.
function sectionProperties(columns,type){
 return '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:type w:val="'+type+'"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="794" w:bottom="794" w:left="850" w:right="850" w:header="360" w:footer="360"/><w:cols w:num="'+columns+'" w:space="510" w:equalWidth="1"/></w:sectPr>';
}
function sectionEnd(columns,type){return '<w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/>'+sectionProperties(columns,type)+'</w:pPr></w:p>';}
function bytesFromData(src){
 const m=/^data:(image\/(?:png|jpeg|jpg|gif|svg\+xml));base64,([\s\S]+)$/i.exec(src||'');
 if(!m)throw Error('存在无法嵌入 Word 的图片（需要 PNG/JPEG/GIF/SVG data URI），请检查题图。');
 if(typeof atob!=='function')throw Error('浏览器缺少图片解码能力。');
 const raw=atob(m[2].replace(/\s/g,'')),b=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)b[i]=raw.charCodeAt(i);
 return {mime:m[1].toLowerCase(),bytes:b};
}
function dimensions(src){
 if(typeof Image==='undefined')return Promise.resolve({w:800,h:400});
 return new Promise(resolve=>{
   const img=new Image();
   img.onload=()=>resolve({w:img.naturalWidth||800,h:img.naturalHeight||400});
   img.onerror=()=>resolve({w:800,h:400});
   img.src=src;
 });
}
async function svgToPng(src){
 if(typeof document==='undefined')throw Error('SVG图片需要浏览器canvas渲染');
 const d=await dimensions(src),canvas=document.createElement('canvas');
 const scale=Math.min(2400/d.w,1800/d.h,Math.max(2,800/d.w,400/d.h));
 canvas.width=Math.max(1,Math.round(d.w*scale));
 canvas.height=Math.max(1,Math.round(d.h*scale));
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('不能创建图片转换画布');
 const img=new Image();
 await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('SVG图片解析失败'));img.src=src});
 ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/png');
}
function pictureXml(relId,idx,cx,cy){
 const xfrm='<a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm>';
 return '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+idx+'" name="题图 '+idx+'"/><a:graphic xmlns:a="'+DRAW+'"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="题图"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+relId+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr>'+xfrm+'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}
function assertXml(text,part){
 if(typeof DOMParser==='undefined')return; // Node regression tests validate with a strict XML parser separately.
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.documentElement?.localName==='parsererror'||doc.getElementsByTagNameNS('*','parsererror').length){const e=Error('Word 文档结构校验失败（'+part+'），请检查公式转换组件或更新完整版本后重新导出');e.code='docx_xml';throw e;}
}
async function createDocx(options){
 const zipLib=options.JSZip||root.JSZip;
 if(!zipLib)throw Error('JSZip 未加载，请刷新页面后重试。');
 const zip=new zipLib(),rels=[],types=new Set();let items=options.plans?.[0]?.items||options.items||[];
 if(!items.length)throw Error('试题篮为空');
 let imageId=0,docPr=0;
 const PL=root.PhysicsPaperLayout;
 if(!PL)throw Error('打印排版模块未加载，请刷新页面');
 const double=options.layout==='double',columns=double?2:1,fullWidth=10206,columnWidth=double?4848:fullWidth;
 async function addPicture(image,limitWidth){
     let src=image.src,parsed=bytesFromData(src);const size=await dimensions(src);
     if(parsed.mime==='image/svg+xml'){src=await svgToPng(src);parsed=bytesFromData(src)}
     const ext=parsed.mime==='image/jpeg'||parsed.mime==='image/jpg'?'jpg':parsed.mime==='image/gif'?'gif':'png';
     const name='image'+(++imageId)+'.'+ext;
     zip.file('word/media/'+name,parsed.bytes);types.add(ext);
     const rid='rId'+(imageId+1);rels.push({id:rid,target:'media/'+name,type:PICREL});
     const w=Math.max(1,size.w),h=Math.max(1,size.h),requested=Number(image.displayWidth)>0?Number(image.displayWidth)/96:w/96;
     let inches=Math.min(limitWidth/1440,requested),hi=inches*(h/w),limitHeight=double?1.95:2.65;
     if(hi>limitHeight){hi=limitHeight;inches=hi*w/h}
     return pictureXml(rid,++docPr,Math.round(inches*914400),Math.round(hi*914400));
 }
 async function renderItem(item,num,isAnswer){
   let xml='';
   for(const block of PL.itemBlocks(item,num,isAnswer,options)){
     const prefix=block.first?num+'. ':'';
     const images=block.images||[],gallery=block.kind==='option-group',after=block.last?150:100;
     if(block.kind==='table'){
       if(prefix)xml+=paragraph(prefix,{keep:true,after:50,size:22});
       xml+=smallTable(block.rows,columnWidth,images.length>0);
     }else if(block.text!==undefined){
       // A multi-line option is one paragraph; its explicitly bound images stay with it.
       xml+=paragraph(prefix+block.text,{after:images.length?40:after,size:22,keep:images.length>0});
     }else if(prefix)xml+=paragraph(prefix,{keep:true,after:40,size:22});
     const rowSize=gallery?2:1;
     for(let i=0;i<images.length;i+=rowSize){
       const batch=images.slice(i,i+rowSize);let runs='';
       for(let j=0;j<batch.length;j++){if(j)runs+=textRun('  ');runs+=await addPicture(batch[j],gallery?Math.floor((columnWidth-180)/2):columnWidth);}
       xml+='<w:p><w:pPr>'+(i+rowSize<images.length?'<w:keepNext/>':'')+'<w:keepLines/><w:spacing w:after="'+(i+rowSize>=images.length?after:60)+'"/></w:pPr>'+runs+'</w:p>';
     }
   }
   return xml;
 }
 async function pageItems(isAnswer){let result='';for(let i=0;i<items.length;i++)result+=await renderItem(items[i],i+1,isAnswer);return result;}
 const title=options.title||'物理精准练习';
 const date=options.date||new Date().toISOString().slice(0,10);
 let body='';
 if(options.plans){
   if(!options.plans.length)throw Error('没有可导出的学生');
   for(let index=0;index<options.plans.length;index++){
     const plan=options.plans[index];items=plan.items;
     if(!items?.length||!plan.student?.name)throw Error('学生或题目为空');
     body+=paragraph(title+' · '+date,{align:'center',bold:true,size:30,after:170});
     body+=paragraph('班级：'+(plan.student.className||'________')+'　姓名：'+plan.student.name,{align:'center',size:19,after:190});
     body+=await pageItems(false);
     if(options.feedback!==false)body+='<w:p><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>'+smallTable(PL.feedbackRows(false),fullWidth);
     // First section is the student's front; subsequent students begin on an odd page.
     body+=sectionEnd(1,index===0?'nextPage':'oddPage');
     body+=paragraph('参考解析 · '+plan.student.name,{align:'center',bold:true,size:30,after:170});
     body+=paragraph('答案与本人的题目页题号对应',{align:'center',size:19,after:150});
     body+=await pageItems(true);
     if(options.feedback!==false)body+='<w:p><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>'+smallTable(PL.feedbackRows(true),fullWidth);
     if(index<options.plans.length-1)body+=sectionEnd(1,'nextPage');
   }
 }else{
 body=paragraph(title+' · '+date,{align:'center',bold:true,size:30,after:170});
 const personal=options.student;
 const nameLine=personal?('班级：'+(personal.className||'________')+'　姓名：'+personal.name):'班级：________　姓名：________';
 body+=paragraph(nameLine,{align:'center',size:19,after:190});
 body+=sectionEnd(1,'nextPage');
 body+=await pageItems(false);
 body+=sectionEnd(columns,'continuous');
 if(options.feedback!==false)body+=smallTable([
   ['完成后勾选（不影响评分）'],
   ['完成：□ 独立　□ 某一步卡住　□ 需要提示'],
   ['针对性：□ 正好练到　□ 部分相关　□ 不太适合'],
   ['困难：□ 题图　□ 规律　□ 步骤衔接　□ 作图表达　□ 其他：________']
 ],fullWidth);
 body+=sectionEnd(1,'continuous');
 body+=paragraph('参考答案 · 自我核对',{align:'center',bold:true,size:30,after:170});
 body+=paragraph('答案与题目页题号对应'+(personal?' · '+personal.name:''),{align:'center',size:19,after:170});
 body+=sectionEnd(1,'nextPage');
 body+=await pageItems(true);
 body+=sectionEnd(columns,'continuous');
 body+=smallTable([['核对后：□ 能独立重做　□ 看懂但有困难　□ 需要教师讲解']],fullWidth);
 }
 const doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+W+'" xmlns:r="'+REL+'"><w:body>'+body+
 sectionProperties(1,options.plans?'nextPage':'continuous')+'</w:body></w:document>';
 const footer='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="'+W+'"><w:p><w:pPr><w:jc w:val="right"/></w:pPr>'+textRun('第 ',false,18)+'<w:fldSimple w:instr="PAGE">'+textRun('1',false,18)+'</w:fldSimple>'+textRun(' / ',false,18)+'<w:fldSimple w:instr="NUMPAGES">'+textRun('1',false,18)+'</w:fldSimple>'+textRun(' 页',false,18)+'</w:p></w:ftr>';
 rels.push({id:'rIdFooter',target:'footer1.xml',type:REL+'/footer'});zip.file('word/footer1.xml',footer);
 const contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
 Array.from(types).map(x=>'<Default Extension="'+x+'" ContentType="image/'+(x==='jpg'?'jpeg':x)+'"/>').join('')+
 '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
 zip.file('[Content_Types].xml',contentTypes);
 zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+REL+'/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml',doc);
 zip.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels.map(r=>'<Relationship Id="'+r.id+'" Type="'+r.type+'" Target="'+r.target+'"/>').join('')+'</Relationships>');
 for(const part of Object.keys(zip.files).filter(name=>/\.(xml|rels)$/.test(name)))assertXml(await zip.file(part).async('string'),part);
 const result=await zip.generateAsync({type:'blob',mimeType:MIME,compression:'DEFLATE',compressionOptions:{level:6}});
 if(!result || result.size<500)throw Error('Word 文件生成结果异常');
 return result;
}
root.PhysicsWordExport={createDocx,MIME};
})(typeof window!=='undefined'?window:globalThis);

