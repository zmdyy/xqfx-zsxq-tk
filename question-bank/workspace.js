/* 年级题库工作区：每个学年/年级使用独立 IndexedDB；旧共享库只复制归档，不迁移或删除。 */
(function(root){
'use strict';
const REGISTRY='PhysicsTrainingBankWorkspaceRegistry',LEGACY='PhysicsTrainingBankV1',PREFIX='PhysicsTrainingBankV1_',OWNER='bank_'+(root.crypto?.randomUUID?.()||Date.now()+'_'+Math.random().toString(16).slice(2));
let active=null,lockRelease=null,lockTimer=null,lockKey='';
const $=id=>document.getElementById(id);
const valid=id=>{if(!/^[A-Za-z0-9_-]{1,80}$/.test(String(id||'')))throw Error('工作区编号无效');return String(id)};
const dbName=id=>PREFIX+valid(id);
function open(name,version=1,stores=['questions','events','settings']){
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>{for(const s of stores)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s,{keyPath:'id'})};r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>reject(r.error||Error('无法打开题库工作区'));r.onblocked=()=>reject(Error('题库数据库被其他页面占用，请关闭旧页面后重试'))});
}
function registry(){return open(REGISTRY,1,['workspaces'])}
async function list(){const db=await registry();try{return await new Promise((resolve,reject)=>{const r=db.transaction('workspaces').objectStore('workspaces').getAll();r.onsuccess=()=>resolve((r.result||[]).sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt))));r.onerror=()=>reject(r.error)})}finally{db.close()}}
async function get(id){const db=await registry();try{return await new Promise((resolve,reject)=>{const r=db.transaction('workspaces').objectStore('workspaces').get(valid(id));r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}finally{db.close()}}
async function createWorkspace(meta){const db=await registry();let duplicate=false;try{await new Promise((resolve,reject)=>{const tx=db.transaction('workspaces','readwrite'),store=tx.objectStore('workspaces'),all=store.getAll();all.onsuccess=()=>{if(all.result.some(x=>!x.legacyArchive&&x.academicYear===meta.academicYear&&x.grade===meta.grade)){duplicate=true;tx.abort();return}store.add(meta)};all.onerror=()=>{try{tx.abort()}catch(_){}};tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(duplicate?Error('该学年和年级的题库已存在，请切换到现有工作区。'):tx.error||Error('创建题库工作区失败'))})}finally{db.close()}return meta}
async function putMeta(meta,add=false){const db=await registry();try{await new Promise((resolve,reject)=>{const tx=db.transaction('workspaces','readwrite');tx.objectStore('workspaces')[add?'add':'put'](meta);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('保存工作区信息失败'))})}finally{db.close()}return meta}
function openLegacy(){
 return new Promise(resolve=>{let absent=false;const r=indexedDB.open(LEGACY);r.onupgradeneeded=()=>{absent=true;try{r.transaction.abort()}catch(_){}};r.onerror=()=>resolve(null);r.onsuccess=()=>{if(absent){r.result.close();resolve(null)}else resolve(r.result)}});
}
async function migrateLegacy(){
 let old=await openLegacy();if(!old)return null;
 try{
  const prior=await get('legacy-archive');if(prior?.ready)return prior;
  const stores=Array.from(old.objectStoreNames);if(!stores.includes('questions'))return null;
  const rows={};await new Promise((resolve,reject)=>{const tx=old.transaction(stores,'readonly');stores.forEach(name=>{const r=tx.objectStore(name).getAll();r.onsuccess=()=>rows[name]=r.result||[]});tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('读取旧题库失败'))});
  const target=await open(dbName('legacy-archive'),1,stores);
  try{await new Promise((resolve,reject)=>{const tx=target.transaction(stores,'readwrite');stores.forEach(name=>(rows[name]||[]).forEach(row=>tx.objectStore(name).put(row)));tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('复制旧题库失败'))})}finally{target.close()}
  return await putMeta({id:'legacy-archive',name:'历史题库（待整理）',grade:'待整理',legacyArchive:true,ready:true,createdAt:new Date().toISOString(),description:'从旧版共享题库复制；原数据库保持不变。'},true).catch(async e=>{const raced=await get('legacy-archive');if(raced)return raced;throw e});
 }finally{old.close()}
}
async function acquire(id){
 const key='physics-bank-workspace:'+id;
 if(root.navigator?.locks?.request){
  let resolveLock,release;const got=new Promise(r=>resolveLock=r),hold=new Promise(r=>release=r);let settled=false;
  try{const req=root.navigator.locks.request(key,{mode:'exclusive',ifAvailable:true},lock=>{if(!lock){if(!settled){settled=true;resolveLock(false)}return}lockRelease=release;if(!settled){settled=true;resolveLock(true)}return hold});req.catch(()=>{if(!settled){settled=true;resolveLock(null)}});const ok=await got;if(ok!==null)return ok;lockRelease=null}catch(_){}
 }
 lockKey='xqfx:bank-lock:'+id;
 try{const now=Date.now(),old=JSON.parse(localStorage.getItem(lockKey)||'null');if(old&&old.expiresAt>now&&old.owner!==OWNER)return false;
  const write=()=>localStorage.setItem(lockKey,JSON.stringify({owner:OWNER,expiresAt:Date.now()+120000}));write();
  if(JSON.parse(localStorage.getItem(lockKey)||'null')?.owner!==OWNER)return false;
  lockTimer=setInterval(()=>{try{const v=JSON.parse(localStorage.getItem(lockKey)||'null');if(v?.owner!==OWNER){release();return}write()}catch(_){release()}},20000);return true;
 }catch(_){throw Error('浏览器无法提供可靠的题库编辑锁，请通过 HTTPS/localhost 打开并允许本站使用本地存储')}
}
function release(){if(lockRelease){try{lockRelease()}catch(_){}lockRelease=null}if(lockTimer)clearInterval(lockTimer);lockTimer=null;try{const v=JSON.parse(localStorage.getItem(lockKey)||'null');if(v?.owner===OWNER)localStorage.removeItem(lockKey)}catch(_){}}
root.addEventListener('pagehide',release);
function url(id){const u=new URL(location.href);u.searchParams.set('workspace',id);return u.href}
function go(id){location.assign(url(id))}
function style(){if($('bankWorkspaceStyle'))return;const s=document.createElement('style');s.id='bankWorkspaceStyle';s.textContent='.bank-ws-backdrop{position:fixed;inset:0;z-index:30000;background:rgba(15,28,42,.58);display:grid;place-items:center;padding:20px}.bank-ws-panel{width:min(760px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 18px 60px #0003;color:#1e293b}.bank-ws-panel h2{margin:0 0 8px}.bank-ws-panel p{color:#64748b;line-height:1.6}.bank-ws-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:18px 0}.bank-ws-card{border:1px solid #dbe3ec;border-radius:10px;padding:14px}.bank-ws-card strong,.bank-ws-card small{display:block}.bank-ws-card small{color:#64748b;margin:6px 0 12px}.bank-ws-panel button{border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:9px 13px;cursor:pointer}.bank-ws-panel button.primary{background:#1c3d5c;color:white;border-color:#1c3d5c}.bank-ws-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bank-ws-form label{display:grid;gap:5px}.bank-ws-form input,.bank-ws-form select{padding:9px;border:1px solid #cbd5e1;border-radius:8px;min-width:0}.bank-ws-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;margin:0 0 12px;border:1px solid #dbe3ec;border-radius:9px;background:#f8fafc}.bank-ws-toolbar strong{margin-right:auto}@media(max-width:560px){.bank-ws-form{grid-template-columns:1fr}}';document.head.appendChild(s)}
function panel(title,description){style();const back=document.createElement('div');back.className='bank-ws-backdrop';const box=document.createElement('section');box.className='bank-ws-panel';box.innerHTML='<h2>'+title+'</h2><p>'+description+'</p>';back.appendChild(box);document.body.appendChild(back);return {box,close:()=>back.remove()}}
function addToolbar(meta){const host=$('questionBankHome')||document.querySelector('.dashboard-page');if(!host||$('bankWorkspaceToolbar'))return;const bar=document.createElement('div');bar.id='bankWorkspaceToolbar';bar.className='bank-ws-toolbar';const label=document.createElement('strong');label.textContent='当前题库：'+meta.name+' · '+([meta.academicYear,meta.grade].filter(Boolean).join(' / ')||'历史归档');const sw=document.createElement('button');sw.textContent='切换工作区';sw.onclick=()=>{const u=new URL(location.href);u.searchParams.delete('workspace');location.assign(u.href)};const add=document.createElement('button');add.textContent='新建年级题库';add.onclick=()=>createDialog();bar.append(label,sw,add);host.prepend(bar)}
async function createDialog(){const p=panel('新建年级题库','新工作区使用独立的本地数据库，不复制或覆盖其他年级题目。');const f=document.createElement('div');f.className='bank-ws-form';f.innerHTML='<label>学年<input id="bwy" placeholder="例如：2026—2027" value="2026—2027"></label><label>年级<select id="bwg"><option>七年级</option><option selected>八年级</option><option>九年级</option></select></label><label style="grid-column:1/-1">名称（可选）<input id="bwn" placeholder="默认按学年和年级生成"></label>';const btn=document.createElement('button');btn.className='primary';btn.textContent='创建并进入';p.box.append(f,btn);btn.onclick=async()=>{const year=$('bwy').value.trim(),grade=$('bwg').value,name=$('bwn').value.trim();if(!year)return alert('请填写学年');try{const id='ws_'+(crypto.randomUUID?.()||Date.now()+'_'+Math.random().toString(16).slice(2));await createWorkspace({id,academicYear:year,grade,name:name||year+' · '+grade,createdAt:new Date().toISOString()});p.close();go(id)}catch(e){alert('创建失败：'+e.message)}}}
async function chooser(){
 const items=await list(),p=panel('选择题库工作区','每个学年、年级分别保存题目、教师修改、审核、草稿和使用记录。历史题库只作为待整理副本，不会自动分配给某个年级。');
 const listBox=document.createElement('div');listBox.className='bank-ws-list';p.box.appendChild(listBox);
 if(!items.length){const empty=document.createElement('p');empty.textContent='尚无题库工作区。请在下方创建第一个学年和年级。';listBox.appendChild(empty)}
 items.forEach(meta=>{const card=document.createElement('div');card.className='bank-ws-card';const title=document.createElement('strong');title.textContent=meta.name;const sub=document.createElement('small');sub.textContent=meta.legacyArchive?'旧版共享题库副本 · 待人工整理':[meta.academicYear,meta.grade].filter(Boolean).join(' · ');const btn=document.createElement('button');btn.className='primary';btn.textContent='进入题库';btn.onclick=async()=>{if(!await acquire(meta.id))return alert('这个题库已在另一个页面打开，请先关闭另一个页面。');p.close();const u=new URL(location.href);u.searchParams.set('workspace',meta.id);history.replaceState(null,'',u.href);active=meta;root.dispatchEvent(new CustomEvent('bankworkspacechange',{detail:{id:meta.id,dbName:dbName(meta.id),meta}}));addToolbar(meta)};card.append(title,sub,btn);listBox.appendChild(card)});
 const create=document.createElement('button');create.className='primary';create.textContent='新建学年／年级题库';create.onclick=()=>{p.close();createDialog()};p.box.appendChild(create);return new Promise(resolve=>{root.addEventListener('bankworkspacechange',e=>resolve(e.detail),{once:true})})
}
async function resolve(){
 const id=new URLSearchParams(location.search).get('workspace');
 if(id&&/^[A-Za-z0-9_-]{1,80}$/.test(id)){const meta=await get(id);if(meta){if(!await acquire(id))throw Error('当前题库已在另一个页面打开，请关闭另一个页面后重试。');active=meta;addToolbar(meta);decorateLinks();return{id,dbName:dbName(id),meta}}}
 await migrateLegacy();
 return chooser();
}
function current(){if(!active)throw Error('尚未选择题库工作区');return{id:active.id,dbName:dbName(active.id),meta:active}}
async function readPracticeData(id){
 const meta=await get(id);
 if(!meta||meta.legacyArchive)throw Error('当前考试绑定的年级题库不可用，请重新选择');
 const db=await open(dbName(meta.id));
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(['questions','events'],'readonly');
   const questions=tx.objectStore('questions').getAll();
   const events=tx.objectStore('events').getAll();
   tx.oncomplete=()=>resolve({questions:questions.result,events:events.result});
   tx.onabort=tx.onerror=()=>reject(tx.error||Error('读取年级题库失败'));
  });
 }finally{db.close()}
}
function decorateLinks(){document.querySelectorAll('a[href]').forEach(a=>{try{const u=new URL(a.href,location.href);if(u.origin===location.origin&&u.pathname.includes('/question-bank/')&&/dashboard\.html|index\.html/.test(u.pathname)&&!u.searchParams.has('workspace'))u.searchParams.set('workspace',active?.id||'');if(u.searchParams.get('workspace')==='')u.searchParams.delete('workspace');a.href=u.href}catch(_){}})}
root.PhysicsBankWorkspace={resolve,current,list,get,dbName,decorateLinks,readPracticeData};
})(window);
