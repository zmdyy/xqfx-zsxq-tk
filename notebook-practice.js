/* 将当前错题的最少必要信息传给同源题库；不传姓名、班级、成绩、原卷图片或密钥。 */
(function(){
'use strict';
function contextFor(item){
 const batch=DataPool.batches.find(b=>b.id===item.batchId);
 if(!batch)return {targets:[]};
 const subject=item.subjectName,majors=window.ScoreUnitRelations?.targets(batch,subject,item.lookupItemName||item.itemName)||[],major=(majors.length===1?majors[0]:getErrorMajorKey(item.lookupItemName||item.itemName)),shared=item.sharedScore||majors.length>1;
 function ref(value){const r=getCanonicalQuestionRefInfo(value);return r.kind==='unknown'?null:JSON.stringify([r.major,r.minors||[]]);}
 const wrong=item.recommendationItemNames||item.detailItemNames||[item.itemName];
 const wrongRefs=wrong.map(ref).filter(Boolean),whole=(item.sharedScore||majors.length>1)||wrong.some(n=>!getCanonicalQuestionRefInfo(n).isSubQuestion);
 const entries=[];
 for(const [key,mapping] of Object.entries(batch.questionConceptMap||{})){
  if(!key.startsWith(subject+'/'))continue;
  const title=key.slice(subject.length+1);
  if(shared?!majors.includes(String(getErrorMajorKey(title))):String(getErrorMajorKey(title))!==String(major))continue;
  const parts=qkNormalizeMappingParts(mapping,key,batch.id);
  if(parts.length)entries.push({ref:ref(title),parts});
 }
 const targets=WrongQuestionRecommendations.targetParts(entries,wrongRefs,whole,ref);
 return {subject,itemLabel:item.itemName,batchLabel:item.batchLabel,questionNo:major,sourceFile:item.sourceFileName||'',stem:(item.stemMarkdown||'').slice(0,60000),targets,wholeOnly:whole,sharedScore:shared};
}
function decorate(){
 document.querySelectorAll('[data-notebook-practice]').forEach(button=>{
  const subject=window.lastErrorNotebookExport?.subjects[Number(button.dataset.subjectIndex)],item=subject?.items[Number(button.dataset.itemIndex)];
  if(!item)return;
  if(!/物理/.test(item.subjectName)){button.disabled=true;button.textContent='该科目题库尚未接入';return;}
  const context=contextFor(item);
  if(!context.targets.length){button.disabled=true;button.textContent='推荐练习（请先标注知识点）';button.title='在小题分析中完成本题的 AI 知识点标注或人工标注后，再打开错题本。';return;}
  button.textContent='推荐练习';button.title=context.wholeOnly?'按整题涉及知识点找题；不判定所有知识点均未掌握':'按失分小问的知识点找题';
 });
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-notebook-practice]');if(!button||button.disabled)return;
 const item=window.lastErrorNotebookExport?.subjects[Number(button.dataset.subjectIndex)]?.items[Number(button.dataset.itemIndex)];if(!item)return;
 try{
  const context=contextFor(item);if(!context.targets.length)throw Error('未找到可用的知识点标注，请重新打开错题本。');
  const token=crypto.randomUUID();WrongQuestionRecommendations.saveContext(localStorage,context,token);
  const a=document.createElement('a');a.href='question-bank/index.html?practice_context='+encodeURIComponent(token);a.target='_blank';a.rel='noopener';a.click();
 }catch(e){showAlert('打开推荐练习失败：'+e.message);}
});
window.NotebookPractice={decorate,contextFor};
})();
