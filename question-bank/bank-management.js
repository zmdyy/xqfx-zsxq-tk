/* 集中添加、备份和恢复入口。沿用现有包格式，导入前明确用途。 */
(function(root){
'use strict';
const $=id=>document.getElementById(id),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let api,prepared=[],busy=false,history=[];
const historyKey='bankImportHistoryV1';
function message(text,error=false){$('bmImportStatus').textContent=text;$('bmImportStatus').classList.toggle('error',error)}
function lock(value){busy=value;$('bankImportDialog').querySelectorAll('button,input,select').forEach(n=>n.disabled=value)}
function summary(){
 const ids=new Set(api.questions().map(q=>q.id));
 $('bmPreview').innerHTML=prepared.map(p=>{
  const counts=p.questions?'<p data-merge-plan>识别 '+p.questions.length+' 道题；预计新增 '+p.plan.added+' 道，合并或更新 '+p.plan.existing+' 道'+(p.plan.conflicts?'，冲突保留 '+p.plan.conflicts+' 道':'')+'。</p>':'';
  const restore=p.kind==='backup'?'<label>处理方式 <select data-backup-mode><option value="merge">只添加题目，保留现有修改和使用记录</option><option value="restore">恢复完整备份，同ID记录将覆盖</option></select></label><p data-restore-plan hidden>恢复将写入 '+p.questions.length+' 道题，其中 '+p.questions.filter(q=>ids.has(q.id)).length+' 道与当前ID相同，将使用备份内容覆盖；含 '+(p.data.events||[]).length+' 条使用记录。</p><p class="hint">恢复会读取审核、草稿、修改历史和使用记录；当前其他题目仍保留。</p>':'';
  return '<section class="bm-summary"><h3>'+E(p.file.name)+'</h3><p>'+E(p.description)+'</p>'+counts+restore+'</section>';
 }).join('');
 $('bmApply').hidden=!prepared.length;
 $('bmApply').textContent='开始导入';
 const select=$('bmPreview').querySelector('[data-backup-mode]');
 if(select)select.onchange=()=>{const restoring=select.value==='restore';$('bmPreview').querySelector('[data-merge-plan]').hidden=restoring;$('bmPreview').querySelector('[data-restore-plan]').hidden=!restoring;$('bmApply').textContent=restoring?'开始恢复':'开始导入'};
}
async function choose(files,restoreOnly=false){
 if(busy||!files.length)return;
 prepared=[];$('bmResult').innerHTML='';$('bmViewAdded').hidden=true;summary();lock(true);message('正在读取文件并准备导入摘要…');
 try{
  const list=[];
  for(const file of files){message('正在检查：'+file.name);const p=await api.prepare(file);
   if(restoreOnly&&p.kind!=='backup')throw Error('这个文件是题目或更新包。请从“添加题目”导入；恢复需要个人完整备份。');
   list.push(p);
  }
  if(list.some(p=>p.kind==='backup')&&list.length!==1)throw Error('个人备份请单独选择，便于核对恢复范围。');
  prepared=list;summary();
  if(restoreOnly){const select=$('bmPreview').querySelector('[data-backup-mode]');select.value='restore';select.onchange();$('bmAddTitle').textContent='恢复个人备份'}
  message('请核对文件用途和数量，再开始处理。'+(files.length>1?'多文件的预计数量分别按当前题库估算，实际去重结果以完成报告为准。':''));
 }catch(e){message(e.message,true)}finally{lock(false)}
}
async function refreshHistory(){
 history=await api.getSetting(historyKey)||[];
 const container=$('bmHistory');
 container.innerHTML=history.length?history.slice().reverse().map((r,i)=>'<section class="bm-record"><h3>'+E(r.fileName)+'</h3><small>'+E(new Date(r.at).toLocaleString('zh-CN'))+' · '+E(r.action)+' · '+E(r.status==='failed'?'未全部完成':'已完成')+'</small><p>'+E(r.summary)+'</p>'+(r.addedIds?.length?'<button data-view-import="'+i+'">查看本次新增（'+r.addedIds.length+'道）</button>':'')+'</section>').join(''):'<p class="hint">暂无导入记录。本次功能上线后的导入会记录文件名、时间和结果，并随完整备份保存。</p>';
}
async function execute(){
 if(busy||!prepared.length)return;
 const mode=$('bmPreview').querySelector('[data-backup-mode]')?.value||'merge';
 if(mode==='restore'&&!confirm('恢复备份会覆盖同ID的题目、草稿和记录，当前其他题目仍保留。确定按所选备份恢复？'))return;
 lock(true);message('正在导入，请等待处理结果…');let records=[],last=null;
 try{
  for(const p of prepared){
   const before=new Set(api.questions().map(q=>q.id));let result,error;
   try{result=await api.apply(p,mode)}catch(e){error=e}
   const addedIds=api.questions().filter(q=>!before.has(q.id)).map(q=>q.id);
   const text=error?'未全部完成：'+error.message:result.summary;
   const record={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),at:new Date().toISOString(),fileName:p.file.name,action:mode==='restore'?'恢复完整备份':p.kind==='update'?'更新题库':p.kind==='index'?'补充目录':'添加题目',status:error?'failed':'done',added:addedIds.length,addedIds,merged:result?.merged||0,updated:result?.updated||0,conflicts:result?.conflicts||0,summary:text};
   records.push(record);if(addedIds.length)last=record;
   try{const stored=await api.getSetting(historyKey)||[];await api.setSetting(historyKey,[...stored,record])}catch(e){record.summary+='；导入记录保存失败：'+e.message}
   if(addedIds.length)api.rememberAdded?.(record);api.onChange();if(error)break;
  }
  $('bmResult').innerHTML=records.map(r=>'<section class="bm-record"><h3>'+E(r.fileName)+'</h3><p class="'+(r.status==='failed'?'error':'')+'">'+E(r.summary)+'</p></section>').join('');
  if(last&&records.length>1)last={fileName:'本次导入的 '+records.length+' 个文件',addedIds:[...new Set(records.flatMap(r=>r.addedIds))]};
  $('bmViewAdded').hidden=!last;
  $('bmViewAdded').onclick=()=>{api.viewAdded(last);$('bankImportDialog').close()};
  message(records.some(r=>r.status==='failed')?'部分处理未完成，请查看上方结果。':'处理完成。'+(last?'可以直接查看本次新增题目。':''));
  api.notify?.(records.map(r=>r.fileName+'：'+r.summary).join('；'));prepared=[];summary();await refreshHistory();
 }catch(e){message(e.message,true)}finally{lock(false)}
}
let backupBusy=false,lastBackup=null,storageSequence=0;
const bytes=n=>Number.isFinite(n)?(n/1024/1024).toFixed(1)+' MB':'无法估算';
function backupProgress(p){
 const bar=$('bmBackupProgress');bar.removeAttribute('value');
 let text={starting:'正在启动后台备份…',finishing:'备份文件已生成，正在记录本次快照…'}[p.stage];
 if(p.stage==='read')text='读取同一份题库快照：'+p.read+(p.total!==null?' / '+p.total:'')+' 条记录';
 if(p.stage==='check')text='核对备份基线：'+p.read+' / '+p.total+' 条记录';
 if(p.stage==='prepare')text='整理题目、草稿和历史图片：已检查 '+p.visited+' 项，已归集 '+p.resources+' 份独立资源';
 if(p.stage==='compress'){bar.value=p.percent;text='压缩完整 ZIP：'+p.percent.toFixed(1)+'%'}
 $('bmBackupText').textContent=text;$('bmBackupCancel').disabled=p.stage==='finishing';
}
async function startBackup(options={}){
 if(backupBusy)throw Error('已有备份正在生成，请查看右下方进度。');
 backupBusy=true;lastBackup=null;$('bmBackupToggle').setAttribute('aria-expanded','true');$('bmBackupPanel').hidden=false;$('bmBackupBody').hidden=false;$('bmBackupSave').hidden=true;$('bmBackupProgress').hidden=false;$('bmBackupCancel').hidden=false;$('bmBackupDismiss').hidden=true;$('backupZipBtn').disabled=true;$('bmBackupText').classList.remove('error');
 try{
  const result=await api.backup({...options,onProgress:backupProgress});lastBackup=result;
  const save=$('bmBackupSave');save.href=result.url;save.download=result.fileName;save.hidden=false;
  $('bmBackupText').textContent='完整备份已生成：'+result.questionCount+' 道题，'+result.resourceCount+' 份独立资源，'+bytes(result.blob.size)+'。已发起下载；请确认文件已保存。'+(result.warning?' '+result.warning:'');
  api.notify?.('完整备份已生成，请在浏览器下载列表确认保存。');return result;
 }catch(e){$('bmBackupText').textContent=e.name==='AbortError'?'备份已取消。原题库保持完整，可以重新生成。':'备份失败：'+e.message;$('bmBackupText').classList.toggle('error',e.name!=='AbortError');throw e}
 finally{backupBusy=false;$('backupZipBtn').disabled=false;$('bmBackupProgress').hidden=true;$('bmBackupCancel').hidden=true;$('bmBackupDismiss').hidden=false;if($('bankManageDialog').open)refreshStorage()}
}
async function refreshStorage(){
 const sequence=++storageSequence;const storage=navigator.storage;
 $('bmStorageData').textContent='正在后台核对本地题库及备份后的变化…';
 const checks=await Promise.allSettled([root.PhysicsBankBackup.status(),storage?.estimate?storage.estimate():Promise.resolve(null),storage?.persisted?storage.persisted():Promise.resolve(null)]);
 if(sequence!==storageSequence)return;
 const [data,estimate,persisted]=checks.map(r=>r.status==='fulfilled'?r.value:null);
 $('bmStorageProtection').textContent=persisted===true?'持久化保护已启用。':persisted===false?'尚未获得持久化保护。':'当前浏览器无法查询持久化保护。';
 $('bmPersist').disabled=persisted===true||!storage?.persist;
 $('bmStorageUsage').textContent=estimate?'当前网站约使用 '+bytes(estimate.usage)+' / 可用配额 '+bytes(estimate.quota)+'（同源网站合计，包含其他工具，并非仅题库）。':'当前浏览器无法估算存储用量。';
 if(!data){$('bmStorageData').textContent='本地题库状态读取失败：'+(checks[0].reason?.message||'无法查询');return}
 let text='当前已写入浏览器：'+data.questionCount+' 道题、'+data.eventCount+' 条使用记录。';
 if(data.saved){text+='\n'+(data.saved.generatedAt?'上次备份生成时间：':'恢复的备份快照时间：')+new Date(data.saved.generatedAt||data.saved.snapshotAt).toLocaleString('zh-CN');const c=data.changes;
  if(c){text+='\n相对备份快照：新增 '+c.questions.added+' 道，修改 '+c.questions.modified+' 道，删除 '+c.questions.deleted+' 道；使用记录变化 '+(c.events.added+c.events.modified+c.events.deleted)+' 条；草稿、目录或管理记录变化 '+(c.settings.added+c.settings.modified+c.settings.deleted)+' 条。'}
 }else text+='\n还没有可核对的完整备份记录，请下载一份完整 ZIP。';
 $('bmStorageData').textContent=text;
}
async function protectStorage(){
 $('bmPersist').disabled=true;$('bmStorageProtection').textContent='正在请求浏览器持久化保护…';
 try{const accepted=await navigator.storage.persist();$('bmStorageProtection').textContent=accepted?'持久化保护已启用。清除网站数据仍会删除本地题库，请保留 ZIP 备份。':'浏览器未授予持久化保护，题库仍能正常使用，请定期备份。';$('bmPersist').disabled=accepted}
 catch(e){$('bmStorageProtection').textContent='请求失败：'+e.message;$('bmPersist').disabled=false}
}
function openAdd(){
 if(busy)return;prepared=[];summary();message('');$('bmAddTitle').textContent='添加题目';$('bmResult').innerHTML='';$('bmViewAdded').hidden=true;
 $('bankImportDialog').showModal();
}
function init(options){
 api=options;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="bankImportDialog" class="bm-dialog" aria-labelledby="bmAddTitle"><div class="bm-head"><h2 id="bmAddTitle">添加题目</h2><button data-bm-close="bankImportDialog" type="button">关闭</button></div><div class="bm-actions"><label class="button primary">从文件导入<input id="fileInput" type="file" accept=".docx,.doc,.json,.zip" multiple hidden></label><button id="newQuestionBtn" type="button">粘贴单题</button></div><p class="hint">导入 Word 试卷或题库包；少量题目可粘贴题干、答案并添加图片。旧版二进制 DOC 请先另存为 DOCX。</p><div id="bmPreview"></div><div id="bmResult"></div><p id="bmImportStatus" class="bm-status" role="status" aria-live="polite"></p><div class="bm-actions"><button id="bmApply" class="primary" hidden>开始导入</button><button id="bmViewAdded" hidden>查看本次新增题目</button></div></dialog>
 <dialog id="bankManageDialog" class="bm-dialog" aria-labelledby="bmManageTitle"><div class="bm-head"><h2 id="bmManageTitle">备份与恢复</h2><button data-bm-close="bankManageDialog" type="button">关闭</button></div><div class="bm-actions"><button id="backupZipBtn" class="primary">下载完整备份（ZIP）</button><label class="button">恢复个人备份<input id="restoreInput" type="file" accept=".json,.zip" hidden></label></div><p class="hint">完整备份包含当前全部题目、图片、审核、草稿、修改历史和使用记录。下载文件后可在其他浏览器恢复。</p><section class="bm-record"><h3>本地保存与保护</h3><p id="bmStorageData" class="bm-status"></p><p id="bmStorageProtection"></p><p id="bmStorageUsage"></p><div class="bm-actions"><button id="bmPersist">申请持久化保护</button><button id="bmStorageRefresh">刷新保存状态</button><button id="bmShowBackup">查看备份进度</button></div><p class="hint">这里检查已写入题库的数据；编辑器中尚未保存的文字不计入。持久化保护可减少浏览器自动回收，清除网站数据或更换浏览器仍需用 ZIP 恢复。</p><details><summary>数据存放范围</summary><p class="hint">沿用现有本地题库，旧题目无需重新导入。同一网站域名下的题库页面可能共用存储，网址路径不同并不自动隔离。当前没有自动迁移或删除原库。</p></details></section><h3>导入与更新记录</h3><p class="hint">记录保存在当前浏览器，并随完整ZIP备份导出。恢复备份后可以继续查看。</p><div id="bmHistory"></div></dialog>`);
 document.body.insertAdjacentHTML('beforeend',`<aside id="bmBackupPanel" class="bm-backup-panel" aria-label="完整备份进度" hidden><div class="bm-head"><button id="bmBackupToggle" aria-expanded="true">完整题库备份 · 展开 / 收起</button><button id="bmBackupDismiss" hidden aria-label="关闭备份提示">关闭</button></div><div id="bmBackupBody"><p id="bmBackupText" role="status" aria-live="polite"></p><progress id="bmBackupProgress" max="100" aria-label="备份处理进度"></progress><div class="bm-actions"><button id="bmBackupCancel">取消备份</button><a id="bmBackupSave" class="button primary" hidden>重新下载此备份</a></div><p class="hint">生成期间可以继续浏览和编辑。备份只包含开始读取时的快照，之后的修改将在保存状态中列出。</p></div></aside>`);
 $('bmBackupToggle').onclick=()=>{const body=$('bmBackupBody');body.hidden=!body.hidden;$('bmBackupToggle').setAttribute('aria-expanded',String(!body.hidden))};
 $('bmBackupDismiss').onclick=()=>{$('bmBackupPanel').hidden=true};
 $('bmBackupCancel').onclick=()=>root.PhysicsBankBackup.cancel();
 $('bmShowBackup').onclick=()=>{if(!backupBusy&&!lastBackup){$('bmStorageData').textContent+='\n暂无备份任务，请先下载完整备份。';return}$('bankManageDialog').close();$('bmBackupPanel').hidden=false;$('bmBackupBody').hidden=false;$('bmBackupToggle').setAttribute('aria-expanded','true')};
 $('bmStorageRefresh').onclick=refreshStorage;$('bmPersist').onclick=protectStorage;
 $('addQuestionsBtn').onclick=openAdd;
 $('bankManageBtn').onclick=async()=>{if(busy)return;$('bmHistory').textContent='正在读取记录…';$('bankManageDialog').showModal();refreshStorage();try{await refreshHistory()}catch(e){$('bmHistory').textContent='读取失败：'+e.message}};
 document.querySelectorAll('[data-bm-close]').forEach(b=>b.onclick=()=>{if(!busy)$(b.dataset.bmClose).close()});
 $('bankImportDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 $('fileInput').onchange=e=>{const files=Array.from(e.target.files||[]);e.target.value='';choose(files)};
 $('restoreInput').onchange=e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;$('bankManageDialog').close();openAdd();choose(files,true)};
 $('newQuestionBtn').onclick=()=>{$('bankImportDialog').close();api.newQuestion()};
 $('backupZipBtn').onclick=()=>{$('bankManageDialog').close();startBackup().catch(()=>{})};
 $('bmApply').onclick=execute;
 $('bmHistory').onclick=e=>{const b=e.target.closest('[data-view-import]');if(!b)return;const r=history.slice().reverse()[Number(b.dataset.viewImport)];if(r){api.viewAdded(r);$('bankManageDialog').close()}};
 return {refreshHistory};
}
root.PhysicsBankManagement={init,backup:startBackup};
})(typeof window!=='undefined'?window:globalThis);
