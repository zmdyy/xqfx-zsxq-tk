/* 统一题库包V2：bank.json + manifest.json + 按SHA-256去重的media。
 * 存储记录保持原有结构；资源标记只存在于文件中，读取后完全还原。
 */
(function(root){
'use strict';
const FORMAT='physics-training-bank-v2',LEGACY='physics-training-bank-v1',MARK='$physicsAsset';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{ignoreBOM:true});
const editorFields=['stem','answer','tags','type','difficulty','relation','review','parts','images','answerImages','normalizationDecisionsV1','sourceEvidenceV1','sourceTitle'];
// Synchronous SHA-256 keeps the existing synchronous editor comparison API.
// Resource/file integrity uses WebCrypto independently.
function digestText(text){
 const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 const input=encoder.encode(text),bytes=new Uint8Array(Math.ceil((input.length+9)/64)*64),view=new DataView(bytes.buffer),w=new Int32Array(64),h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],rotate=(x,n)=>(x>>>n)|(x<<(32-n));
 bytes.set(input);bytes[input.length]=128;view.setUint32(bytes.length-8,Math.floor(input.length*8/4294967296));view.setUint32(bytes.length-4,input.length*8);
 for(let offset=0;offset<bytes.length;offset+=64){
  for(let i=0;i<16;i++)w[i]=view.getInt32(offset+i*4);
  for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+w[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10)))|0}
  let [a,b,c,d,e,f,g,j]=h;
  for(let i=0;i<64;i++){const t1=(j+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0}
  [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)|0);
 }
 return h.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
function fingerprint(q){const content=Object.fromEntries(editorFields.map(k=>[k,q[k]??(['tags','parts','images','answerImages','normalizationDecisionsV1'].includes(k)?[]:'')]));return 'sha256-editor-v1:'+digestText(JSON.stringify(content))}
function normalizeFingerprint(value){if(typeof value==='string'&&value.startsWith('{')){try{const q=JSON.parse(value);if(q&&Object.prototype.hasOwnProperty.call(q,'stem'))return fingerprint(q)}catch(e){}}return value}
function teacherEdited(q){return !!q.teacherEditedAt||[q.teacherHistoryV1,q.qualityEditHistory].some(rows=>Array.isArray(rows)&&rows.length>0)}
function clone(value){if(Array.isArray(value))return value.map(clone);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)]));return value}
function equal(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equal(a[k],b[k]))}
async function sha(bytes){if(!root.crypto?.subtle)throw Error('浏览器不支持题库校验，请使用HTTPS页面或新版浏览器。');return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')}
function base64(bytes){let str='';for(let i=0;i<bytes.length;i+=16384)str+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(str)}
function bytes64(text){const s=atob(text.replace(/\s/g,''));return Uint8Array.from(s,c=>c.charCodeAt(0))}
function safePath(path){if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('\\')||path.split('/').some(x=>x==='..'||x==='.')||/^\w+:/.test(path))throw Error('资源路径无效：'+path);return path}
function ids(rows,label){const seen=new Set();for(const row of rows){if(!row||typeof row.id!=='string'||!row.id.trim()||seen.has(row.id))throw Error(label+'存在空或重复ID：'+(row?.id||'空'));seen.add(row.id)}}
function validate(bank,kind){
 if(!bank||!Array.isArray(bank.questions))throw Error('题库缺少题目数组。');
 ids(bank.questions,'题目');
 for(const q of bank.questions){
  if(typeof q.stem!=='string'||(!q.stem.trim()&&!q.archivedAsDuplicate&&!(q.images||[]).length))throw Error('题干无效：'+q.id);
  for(const key of ['images','answerImages','tags','parts','sourceRefs'])if(q[key]!==undefined&&!Array.isArray(q[key]))throw Error(q.id+'的'+key+'不是数组。');
  for(const key of ['teacherHistoryV1','qualityEditHistory','qualityReviewEventsV2'])if(q[key]!==undefined&&!Array.isArray(q[key]))throw Error(q.id+'的'+key+'不是历史数组。');
  if(q.revision!==undefined&&(!Number.isInteger(q.revision)||q.revision<0))throw Error('题目修订号无效：'+q.id);
 }
 for(const key of ['events','settings'])if(bank[key]!==undefined){if(!Array.isArray(bank[key]))throw Error(key+'不是记录数组。');ids(bank[key],key==='events'?'使用记录':'管理记录')}
 for(const s of bank.settings||[]){
  if(s.id==='bankImportHistoryV1'&&(!Array.isArray(s.value)||s.value.some(r=>!r||typeof r!=='object'||(r.addedIds!==undefined&&(!Array.isArray(r.addedIds)||r.addedIds.some(id=>typeof id!=='string'))))))throw Error('导入历史结构无效。');
  if(s.id.startsWith('teacher-draft:')&&s.value&&(!s.value.content||typeof s.value.content!=='object'||Array.isArray(s.value.content)))throw Error('草稿内容无效：'+s.id);
 }
 if(bank.meta!==undefined&&(!bank.meta||typeof bank.meta!=='object'||Array.isArray(bank.meta)))throw Error('题库目录数据无效。');
 if(kind==='update'&&!bank.questions.length)throw Error('更新包没有题目。');
}
function marker(value){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.prototype.hasOwnProperty.call(value,MARK)}
async function walk(value,leaf,path='题库'){
 const replaced=await leaf(value,path);if(replaced!==undefined)return replaced;
 if(Array.isArray(value)){const out=[];for(let i=0;i<value.length;i++)out.push(await walk(value[i],leaf,path+'['+i+']'));return out}
 if(value&&typeof value==='object'){const out={};for(const [key,item] of Object.entries(value))Object.defineProperty(out,key,{value:await walk(item,leaf,path+'.'+key),enumerable:true,writable:true,configurable:true});return out}
 return value;
}
async function legacyImages(bank,zip){
 const cache=new Map();
 async function resource(ref,path){safePath(ref);if(!zip)throw Error('旧JSON引用了外部资源：'+path+'。请导入包含图片的ZIP。');if(cache.has(ref))return cache.get(ref);const entry=zip.file(ref);if(!entry)throw Error('缺少资源：'+path+' → '+ref);const ext=ref.split('.').pop().toLowerCase(),mime={jpg:'image/jpeg',jpeg:'image/jpeg',svg:'image/svg+xml',gif:'image/gif',webp:'image/webp',emf:'application/x-emf',wmf:'application/x-wmf'}[ext]||'image/png';const data='data:'+mime+';base64,'+await entry.async('base64');cache.set(ref,data);return data}
 async function visit(node,path='题库'){
  if(!node||typeof node!=='object')return;
  if(typeof node.baseFingerprint==='string')node.baseFingerprint=normalizeFingerprint(node.baseFingerprint);
  for(const [key,value] of Object.entries(node)){
   if(['images','answerImages'].includes(key)&&Array.isArray(value))for(let i=0;i<value.length;i++){
    const im=value[i],where=path+'.'+key+'['+i+']';if(!im||typeof im!=='object')throw Error('图片记录无效：'+where);
    if(im.ref&&!im.data){im.data=await resource(im.ref,where);delete im.ref}
    if(im.repair)for(const [r,d] of [['originalRef','originalData'],['candidateRef','candidateData'],['alternativeCandidateRef','alternativeCandidateData'],['previewPngRef','previewPngData'],['legacyCandidateRef','legacyCandidateData']])if(im.repair[r]&&!im.repair[d]){im.repair[d]=await resource(im.repair[r],where+'.repair.'+r);delete im.repair[r]}
   }
   await visit(value,path+'.'+key);
  }
 }
 await visit(bank);return bank;
}
function validateImages(node,path='题库'){
 if(!node||typeof node!=='object')return;
 if(marker(node))throw Error('尚未还原的资源标记：'+path);
 for(const [key,value] of Object.entries(node)){
  if(['images','answerImages'].includes(key)&&Array.isArray(value))for(let i=0;i<value.length;i++){
   const im=value[i];if(!im||typeof im!=='object')throw Error('图片记录无效：'+path+'.'+key+'['+i+']');
   for(const field of ['data','redrawPng'])if(im[field]!=null&&typeof im[field]!=='string')throw Error('图片数据未完整还原：'+path+'.'+key+'['+i+'].'+field);
   if(im.src&&!im.data&&!/^data:/i.test(im.src))throw Error('图片使用外部链接，无法完整备份：'+path+'.'+key+'['+i+']。请先替换为本地图。');
  }
  validateImages(value,path+'.'+key);
 }
}
async function create(data,options={}){
 if(!root.JSZip)throw Error('JSZip未加载。');
 const kind=options.kind||'backup';if(!['backup','update'].includes(kind))throw Error('未知题库包用途。');
 validate(data,kind);validateImages(data);
 const zip=new root.JSZip(),resources={},memo=new Map();let visited=0,resourceCount=0;
 async function addResource(bytes){const hash=await sha(bytes),ref='media/'+hash+'.bin';if(!resources[ref]){zip.file(ref,bytes,{compression:'STORE'});resources[ref]={sha256:hash,size:bytes.length};resourceCount++}return ref}
 const bank=await walk({...data,format:FORMAT},async(value,path)=>{
  options.onPrepare?.({visited:++visited,resources:resourceCount});
  if(marker(value))throw Error('尚未还原的资源标记：'+path);
  if(typeof value==='string'&&path.endsWith('.baseFingerprint'))return normalizeFingerprint(value);
  if(/\.(id|stem)$/.test(path))return;
  if(typeof value!=='string'||!/^data:/i.test(value))return;
  if(memo.has(value))return {...memo.get(value)};
  const comma=value.indexOf(',');if(comma<0)throw Error('资源编码无效：'+path);
  const prefix=value.slice(0,comma+1),encoding=/;base64,$/i.test(prefix)?'base64':'uri';let bytes;
  try{bytes=encoding==='base64'?bytes64(value.slice(comma+1)):encoder.encode(decodeURIComponent(value.slice(comma+1)))}catch(e){throw Error('资源编码无效：'+path)}
  const ref=await addResource(bytes),result={[MARK]:ref,prefix,encoding};
  const suffix=value.slice(comma+1),canonical=encoding==='base64'?base64(bytes):encodeURIComponent(decoder.decode(bytes));
  // Preserve unusual URI escaping/base64 whitespace too: draft fingerprints
  // must survive a complete backup/restore without textual changes.
  if(suffix!==canonical)result.sourceRef=await addResource(encoder.encode(suffix));
  memo.set(value,result);return {...result};
 });
 const text=JSON.stringify(bank),bankBytes=encoder.encode(text);
 const manifest={format:'physics-training-bank-package',schemaVersion:2,kind,createdAt:data.exportedAt||new Date().toISOString(),bank:{path:'bank.json',sha256:await sha(bankBytes),size:bankBytes.length},resources};
 zip.file('bank.json',text,{compression:'DEFLATE'});zip.file('manifest.json',JSON.stringify(manifest),{compression:'DEFLATE'});
 const blob=await zip.generateAsync({type:options.type||'blob',compression:'DEFLATE',streamFiles:true},options.onProgress);
 return {blob,manifest,resourceCount:Object.keys(resources).length};
}
async function read(input){
 let zip=null,raw,kind,legacy=true,manifest=null;
 if(input.name&&typeof input.arrayBuffer==='function'&&/\.zip$/i.test(input.name)){
  zip=await root.JSZip.loadAsync(await input.arrayBuffer(),{checkCRC32:true});
  const m=zip.file('manifest.json'),b=zip.file('bank.json'),old=zip.file('teacher-bank-backup.json');
  if(b&&old)throw Error('ZIP有多个题库入口，无法确定用途。');
  if(m){
   manifest=JSON.parse(await m.async('text'));
   if(manifest.format!=='physics-training-bank-package'||manifest.schemaVersion!==2||!['backup','update'].includes(manifest.kind)||manifest.bank?.path!=='bank.json'||typeof manifest.createdAt!=='string'||!manifest.createdAt||!manifest.resources||typeof manifest.resources!=='object'||Array.isArray(manifest.resources))throw Error('不支持的题库清单或格式版本。');
   if(!b)throw Error('新版题库缺少bank.json。');const bytes=await b.async('uint8array');
   if(bytes.length!==manifest.bank.size||await sha(bytes)!==manifest.bank.sha256)throw Error('题库正文校验失败，未导入任何题目。');
   raw=JSON.parse(decoder.decode(bytes));if(raw.format!==FORMAT)throw Error('正文与清单的格式版本不一致。');kind=manifest.kind;legacy=false;
  }else{const entry=b||old;if(!entry)throw Error('无法识别这个ZIP：没有题库正文。');raw=JSON.parse(await entry.async('text'));if(raw.format!==LEGACY)throw Error('旧包格式无效，或新版题库缺少manifest.json。');kind=old?'backup':'update'}
 }else{raw=typeof input.text==='function'?JSON.parse(await input.text()):clone(input);if(raw?.format===FORMAT)throw Error('新版JSON引用独立图片，请导入完整ZIP。');if(raw?.format!==LEGACY)throw Error('不是题库备份JSON。');kind=Array.isArray(raw.settings)||Array.isArray(raw.events)?'backup':'update'}
 validate(raw,kind);
 let bank;
 if(!legacy){
  const cached=new Map();
  for(const [ref,info] of Object.entries(manifest.resources)){
   safePath(ref);if(!/^media\/[0-9a-f]{64}\.bin$/.test(ref)||!info||info.sha256!==ref.slice(6,-4)||!Number.isInteger(info.size)||info.size<0)throw Error('资源清单无效：'+ref);
   const entry=zip.file(ref);if(!entry)throw Error('题图或历史资源缺失：'+ref);const bytes=await entry.async('uint8array');if(bytes.length!==info.size||await sha(bytes)!==info.sha256)throw Error('图片资源校验失败：'+ref);cached.set(ref,base64(bytes));
  }
  bank=await walk(raw,(value,path)=>{
   if(!marker(value))return;
   const ref=value[MARK];safePath(ref);if(!cached.has(ref)||typeof value.prefix!=='string'||!/^data:[^,]*,$/i.test(value.prefix)||!['base64','uri'].includes(value.encoding)||(/;base64,$/i.test(value.prefix)!==(value.encoding==='base64')))throw Error('资源引用无效：'+path);
   let suffix=value.encoding==='base64'?cached.get(ref):encodeURIComponent(decoder.decode(bytes64(cached.get(ref))));
   if(value.sourceRef!==undefined){safePath(value.sourceRef);if(!cached.has(value.sourceRef))throw Error('资源原始编码缺失：'+path);suffix=decoder.decode(bytes64(cached.get(value.sourceRef)));let bytes;try{bytes=value.encoding==='base64'?bytes64(suffix):encoder.encode(decodeURIComponent(suffix))}catch(e){throw Error('资源原始编码无效：'+path)}if(base64(bytes)!==cached.get(ref))throw Error('资源原始编码与内容不一致：'+path)}
   return value.prefix+suffix;
  });
 }else bank=await legacyImages(clone(raw),zip);
 validateImages(bank);bank.format=LEGACY;
 return {bank,zip,kind,legacy,manifest,resourceCount:manifest?Object.keys(manifest.resources).length:0};
}
const api={create,read,validate,clone,equal,fingerprint,normalizeFingerprint,digestText,editorFields,teacherEdited,FORMAT};root.PhysicsBankPackage=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
