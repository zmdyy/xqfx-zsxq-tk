/* Dedicated worker: snapshot, fingerprints, resource packing and ZIP never run on the UI thread. */
'use strict';
importScripts('../jszip.min.js','bank-package.js?v=20261014backup3');
const internal=new Set(['bankLastBackupV1','bankBackupSnapshotV1']);
function open(name){return new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('题库尚未建立，请刷新页面后重试。'))};r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result)})}
async function snapshot(name,progress){
 const db=await open(name);
 try{return await new Promise((resolve,reject)=>{
  const names=['questions','events','settings'],tx=db.transaction(names,'readonly'),out={format:'physics-training-bank-v1',exportedAt:new Date().toISOString()},totals={};let read=0,last=0;
  for(const name of names){out[name]=[];const store=tx.objectStore(name),count=store.count();count.onsuccess=()=>{totals[name]=count.result};const cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;out[name].push(c.value);read++;if(Date.now()-last>80){last=Date.now();progress?.({stage:'read',read,total:Object.keys(totals).length===3?Object.values(totals).reduce((a,b)=>a+b,0):null})}c.continue()}}
  tx.oncomplete=()=>{out.meta=out.settings.find(s=>s.id==='meta')?.value||{};progress?.({stage:'read',read,total:read});resolve(out)};
  tx.onabort=()=>reject(tx.error||Error('读取题库快照失败'));tx.onerror=()=>{};
 })}finally{db.close()}
}
async function signatures(data,progress){
 const out={};let n=0,total=data.questions.length+data.events.length+data.settings.filter(s=>!internal.has(s.id)).length,last=0;
 for(const name of ['questions','events','settings']){out[name]=[];for(const row of data[name]){if(name==='settings'&&internal.has(row.id))continue;const bytes=new TextEncoder().encode(JSON.stringify(row,(key,value)=>{
  if(key==='baseFingerprint')return PhysicsBankPackage.normalizeFingerprint(value);
  if(value&&typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]]));
  return value;
 })),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');out[name].push([row.id,hash]);n++;if(Date.now()-last>80){last=Date.now();progress?.({stage:'check',read:n,total})}}}
 progress?.({stage:'check',read:n,total});return out;
}
function diff(before=[],after=[]){const old=new Map(before),current=new Map(after);return {added:after.filter(([id])=>!old.has(id)).length,modified:after.filter(([id,h])=>old.has(id)&&old.get(id)!==h).length,deleted:before.filter(([id])=>!current.has(id)).length}}
onmessage=async({data:request})=>{
 try{
  const progress=p=>postMessage({type:'progress',...p}),bank=await snapshot(request.dbName,request.action==='backup'?progress:null);
  if(request.action==='status'){
   const saved=bank.settings.find(s=>s.id==='bankLastBackupV1')?.value||bank.settings.find(s=>s.id==='bankBackupSnapshotV1')?.value;
   const current=saved?.baseline?await signatures(bank):null;
   postMessage({type:'done',result:{questionCount:bank.questions.length,eventCount:bank.events.length,saved:saved?{generatedAt:saved.generatedAt,snapshotAt:saved.snapshotAt}:null,changes:current?Object.fromEntries(['questions','events','settings'].map(k=>[k,diff(saved.baseline[k],current[k])])):null}});return;
  }
  if(request.action!=='backup')throw Error('未知后台操作');
  const baseline=await signatures(bank,progress),snapshotAt=bank.exportedAt;
  bank.settings=bank.settings.filter(s=>!internal.has(s.id));
  bank.settings.push({id:'bankBackupSnapshotV1',value:{snapshotAt,baseline}});
  if(request.extra)bank.diagramRepairBatch=request.extra;
  let last=0;
  const result=await PhysicsBankPackage.create(bank,{kind:'backup',onPrepare:p=>{if(Date.now()-last>80){last=Date.now();progress({stage:'prepare',...p})}},onProgress:p=>{if(Date.now()-last>80||p.percent===100){last=Date.now();progress({stage:'compress',percent:p.percent})}}});
  postMessage({type:'done',result:{blob:result.blob,resourceCount:result.resourceCount,questionCount:bank.questions.length,record:{snapshotAt,generatedAt:new Date().toISOString(),baseline}}});
 }catch(e){postMessage({type:'error',message:e.message||String(e)})}
};
