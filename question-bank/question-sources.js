/* 来源显示与检索共用；原始文件名和重复题的所有出处均保留。 */
(function(root){
'use strict';
function refs(q){
 const items=[{file:q.source||'',no:q.sourceNo||''},...(q.sourceRefs||[])],seen=new Set();
 return items.filter(r=>{if(!r.file)return false;const key=r.file+'\u001f'+String(r.no??'');if(seen.has(key))return false;seen.add(key);return true});
}
function title(q){return String(q.sourceTitle||q.source||'来源待补充').replace(/\.(docx?|json)$/i,'')}
function search(q){return [q.sourceTitle||'',...refs(q).map(r=>r.file+' '+(r.no??''))].join(' ')}
root.PhysicsQuestionSources={refs,title,search};
})(typeof window!=='undefined'?window:globalThis);
