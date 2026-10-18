/* Separate source totals from audited task subtotals. Never colour an incomplete sum. */
(function(root){
'use strict';
const total=rs=>rs.reduce((s,r)=>s+(r.scores||[]).reduce((a,b)=>a+b,0),0);
const labels={verified:'已核对',reference:'参考',unallocated:'未拆分',conflict:'冲突待核',missing:'缺资料',notSeen:'本版未见'};
function create(data){
 const legacy=data.legacyRecords||[],cache=new Map();
 function moduleScore(mid,year){
  const rs=data.records.filter(r=>r.moduleId===mid&&r.year===year),tasks=rs.filter(r=>r.tested),old=(year===2020?rs:legacy.filter(r=>r.moduleId===mid&&r.year===year)),reported=old.filter(r=>r.tested);
  const sources=reported.map(r=>({id:r.id,scores:r.scores,content:r.content,source:r.source,issue:r.issue||''}));
  const parents=[...new Set(tasks.flatMap(r=>(r.references||[]).map(x=>x.paperId+':'+x.sourceNo)))];
  const base={moduleId:mid,year,sources,parents,tested:tasks.length>0,scope:'原图专题汇总口径；不代表新增任务分值已全部核准',value:null};
  const finish=(status,extra={})=>({...base,status,statusLabel:labels[status],...extra});
  if(!rs.length)return finish('missing');
  if(!tasks.length)return reported.length?finish('conflict',{reason:'原图有记录，上传整理版未见明确任务，考点归属仍需核对。'}):finish('notSeen');
  if(tasks.every(r=>r.scoreStatus==='known')&&!tasks.some(r=>r.optionalGroup)){
   const seen=new Set(),unique=tasks.filter(r=>{const id=r.scoreGroup||r.id;if(seen.has(id))return false;seen.add(id);return true;});
   return finish('verified',{value:total(unique),scope:'已对应任务且计分依据明确',reason:[...new Set(unique.map(r=>r.scoreBasis).filter(Boolean))].join('；')});
  }
  // The earlier safety label was vague; the source task is now explicitly identified.
  const resolvedSafety=mid==='safety'&&year===2023&&tasks.some(r=>r.references?.some(x=>x.sourceNo==='3'));
  if(reported.length&&reported.every(r=>r.scores.length&&(r.scoreStatus==='known'||resolvedSafety))){
   return finish('reference',{value:total(reported),reason:'保留原汇总图片的专题分值；未将Word中缺少小问计分当作原图分值错误。'});
  }
  const explicitConflict=reported.some(r=>/不一致|归属.*待核/.test(r.issue||''));
  const numbers=[...new Set(reported.flatMap(r=>r.scores||[]))];
  return finish(explicitConflict?'conflict':'unallocated',{
   reportedNumbers:numbers,
   reason:reported.length?reported.map(r=>r.issue||(!r.scores.length?'原图该项未提供分值':'原图只提供部分任务分值')).join('；'):'有对应任务，但原图没有可对应的专题分值，尚不能拆分计分。',
   groupLabel:mid==='heat'&&year===2025?'蓄冷剂整组6分（原图参考），多个考点共用，不能计成18分。':null,
   partialValue:total(reported.filter(r=>r.scoreStatus==='known'))||null
  });
 }
 function get(ids,year){
  ids=[...new Set(Array.isArray(ids)?ids:[ids])];const key=ids.join('|')+':'+year;if(cache.has(key))return cache.get(key);
  const cells=ids.map(mid=>moduleScore(mid,year)),active=cells.filter(c=>c.tested||c.status==='conflict');let out;
  if(ids.length===1)out=cells[0];
  else if(!active.length)out={status:cells.every(c=>c.status==='missing')?'missing':'notSeen',value:null,tested:false,sources:cells.flatMap(c=>c.sources),reason:'该年缺资料或上传版未见对应任务。'};
  else if(active.some(c=>c.status==='conflict'))out={status:'conflict',value:null,tested:true,reason:'合并专题中存在来源冲突，不能生成可比较的总分。',sources:active.flatMap(c=>c.sources)};
  else if(active.length===1)out={...active[0]};
  else{
   const valued=active.filter(c=>c.value!==null),unvalued=active.filter(c=>c.value===null),seen=new Set();let overlap=false;
   for(const c of valued)for(const p of c.parents){if(seen.has(p))overlap=true;seen.add(p);}
   // A newly tagged subsidiary topic may be covered by the one existing source total.
   const coveredBySingle=valued.length===1&&unvalued.every(c=>c.parents.length&&c.parents.every(p=>valued[0].parents.includes(p)));
   if(coveredBySingle)out={...valued[0],reason:'合并专题沿用一份原图参考分值；新增关联考点不重复相加。'};
   else if(valued.length===active.length&&!overlap&&valued.every(c=>c.parents.length))out={status:valued.every(c=>c.status==='verified')?'verified':'reference',value:valued.reduce((s,c)=>s+c.value,0),tested:true,reason:'各子专题有分值且所对应来源题组无交叉，按原图口径合并。',sources:active.flatMap(c=>c.sources)};
   else out={status:'unallocated',value:null,tested:true,reason:overlap?'子专题涉及相同题组，无法确认小问分配；不相加、不用部分小计着色。':'合并专题的计分尚未完整拆分；不使用已知部分作为年度总分。',sources:active.flatMap(c=>c.sources),components:active.map(c=>({moduleId:c.moduleId,value:c.value,status:c.status,groupLabel:c.groupLabel}))};
  }
  out.statusLabel=labels[out.status];cache.set(key,out);return out;
 }
 return {get};
}
root.PhysicsExamScores={create};if(typeof module!=='undefined'&&module.exports)module.exports=root.PhysicsExamScores;
})(typeof window!=='undefined'?window:globalThis);
