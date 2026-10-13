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
function openAdd(){
 if(busy)return;prepared=[];summary();message('');$('bmAddTitle').textContent='添加题目';$('bmResult').innerHTML='';$('bmViewAdded').hidden=true;
 $('bankImportDialog').showModal();
}
function init(options){
 api=options;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="bankImportDialog" class="bm-dialog" aria-labelledby="bmAddTitle"><div class="bm-head"><h2 id="bmAddTitle">添加题目</h2><button data-bm-close="bankImportDialog" type="button">关闭</button></div><div class="bm-actions"><label class="button primary">从文件导入<input id="fileInput" type="file" accept=".docx,.doc,.json,.zip" multiple hidden></label><button id="newQuestionBtn" type="button">粘贴单题</button></div><p class="hint">导入 Word 试卷或题库包；少量题目可粘贴题干、答案并添加图片。旧版二进制 DOC 请先另存为 DOCX。</p><div id="bmPreview"></div><div id="bmResult"></div><p id="bmImportStatus" class="bm-status" role="status" aria-live="polite"></p><div class="bm-actions"><button id="bmApply" class="primary" hidden>开始导入</button><button id="bmViewAdded" hidden>查看本次新增题目</button></div></dialog>
 <dialog id="bankManageDialog" class="bm-dialog" aria-labelledby="bmManageTitle"><div class="bm-head"><h2 id="bmManageTitle">备份与恢复</h2><button data-bm-close="bankManageDialog" type="button">关闭</button></div><div class="bm-actions"><button id="backupZipBtn" class="primary">下载完整备份（ZIP）</button><label class="button">恢复个人备份<input id="restoreInput" type="file" accept=".json,.zip" hidden></label></div><p class="hint">完整备份包含当前全部题目、图片、审核、草稿、修改历史和使用记录。下载文件后可在其他浏览器恢复。</p><h3>导入与更新记录</h3><p class="hint">记录保存在当前浏览器，并随完整ZIP备份导出。恢复备份后可以继续查看。</p><div id="bmHistory"></div></dialog>`);
 $('addQuestionsBtn').onclick=openAdd;
 $('bankManageBtn').onclick=async()=>{if(busy)return;$('bmHistory').textContent='正在读取记录…';$('bankManageDialog').showModal();try{await refreshHistory()}catch(e){$('bmHistory').textContent='读取失败：'+e.message}};
 document.querySelectorAll('[data-bm-close]').forEach(b=>b.onclick=()=>{if(!busy)$(b.dataset.bmClose).close()});
 $('bankImportDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 $('fileInput').onchange=e=>{const files=Array.from(e.target.files||[]);e.target.value='';choose(files)};
 $('restoreInput').onchange=e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;$('bankManageDialog').close();openAdd();choose(files,true)};
 $('newQuestionBtn').onclick=()=>{$('bankImportDialog').close();api.newQuestion()};
 $('backupZipBtn').onclick=()=>{$('bankManageDialog').close();api.backup()};
 $('bmApply').onclick=execute;
 $('bmHistory').onclick=e=>{const b=e.target.closest('[data-view-import]');if(!b)return;const r=history.slice().reverse()[Number(b.dataset.viewImport)];if(r){api.viewAdded(r);$('bankManageDialog').close()}};
 return {refreshHistory};
}
root.PhysicsBankManagement={init};
})(typeof window!=='undefined'?window:globalThis);
