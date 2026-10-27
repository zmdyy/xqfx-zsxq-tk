/* 个人错题推荐面板，复用原有题篮与导出。 */
(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let api,context,host,excluded=new Set(),selected='',limit=3,error='';
function init(options){
 api=options;const token=new URLSearchParams(location.search).get('practice_context');if(!token)return;
 host=document.createElement('section');host.className='wrong-practice workflow-section';host.setAttribute('aria-label','错题推荐练习');
 document.querySelector('.library').prepend(host);
 try{context=WrongQuestionRecommendations.readContext(localStorage,token);if(!context)error='推荐信息已过期或不在当前浏览器中，请从个人错题本重新打开。';else if(!/物理/.test(context.subject))error='当前题库仅支持物理。';}catch(e){error='推荐信息读取失败，请从个人错题本重新打开。';}
 host.addEventListener('change',e=>{if(e.target.dataset.practiceTarget!==undefined){selected=e.target.value;limit=3;render();}});
 host.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.practiceAdd){api.addQuestion(b.dataset.practiceAdd);render();}
  if(b.dataset.practiceEdit)api.openEditor(b.dataset.practiceEdit);
  if(b.dataset.practiceExclude){excluded.add(b.dataset.practiceExclude);render();}
  if(b.dataset.practiceMore){limit+=12;render();}
  if(b.dataset.practiceReset){excluded.clear();limit=3;render();}
 });
 render();
}
function render(){
 if(!host)return;
 if(error){host.innerHTML='<h2>推荐练习</h2><p role="status">'+esc(error)+'</p>';return;}
 const targets=selected===''?context.targets:context.targets.filter((t,i)=>String(i)===selected);
 const result=WrongQuestionRecommendations.rank(api.questions().filter(q=>!excluded.has(q.id)),{...context,targets},api.units);
 const initial=result.recommended,rows=limit===3?initial:[...initial,...result.rows.filter(r=>!initial.includes(r))].slice(0,limit);
 const concept=id=>api.catalogById.get(id)?.name||id;
 const uncertain=targets.some(t=>['low','unknown'].includes(t.confidence));
 host.innerHTML='<div class="wrong-practice-heading"><div><h2>推荐练习 · '+esc(context.itemLabel)+'</h2><p>'+esc(context.batchLabel||'')+' · '+esc(context.subject)+'</p></div><a href="../index.html">返回成绩分析</a></div>'+
 '<p class="hint">'+(context.wholeOnly?'当前只有整题得分：以下是整题涉及的知识点，不能据此认定每个知识点都未掌握，请选择需要练习的方向。':'依据失分小问的独立得分与已有知识点标注推荐。')+(uncertain?' 部分标注的置信度较低或未知，请先核对。':'')+'</p>'+
 '<label>练习方向 <select data-practice-target aria-label="练习方向"><option value="">全部'+(context.wholeOnly?'涉及':'失分小问')+'知识点</option>'+context.targets.map((t,i)=>'<option value="'+i+'" '+(String(i)===selected?'selected':'')+'>'+esc(t.label+' · '+concept(t.conceptId))+'</option>').join('')+'</select></label>'+
 '<p class="hint">优先同主知识点、同考法，再考虑相关知识点；难度和审核状态沿用题库记录。可确认的原题已排除 '+result.originals+' 道。无法确认的原题可点“排除此题”。</p>'+
 '<p role="status">'+(result.rows.length?'匹配 '+result.rows.length+' 道，当前展示 '+rows.length+' 道。请人工核对后加入题篮。':api.questions().some(q=>!q.archivedAsDuplicate)?'暂无匹配题目。请核对标注，或为这些知识点补充题库。':'当前浏览器题库为空，请先添加题目或恢复题库独立备份。')+'</p>'+
 rows.map(row=>{const q=row.q,inBasket=api.inBasket(q.id);return '<article class="qcard"><div class="qtop"><strong>'+esc(q.type||'题型待审')+' · 第'+esc(q.sourceNo||'?')+'题</strong><div><span class="tag">'+esc(q.difficulty||'难度待审')+'</span><span class="tag '+(q.review==='approved'?'approved':'')+'">'+(q.review==='approved'?'已审核':'待审核')+'</span></div></div><p class="wrong-practice-reason">'+esc(row.reason)+'：'+esc(row.conceptIds.map(concept).join('、'))+'</p><p class="qsource">'+esc(window.PhysicsQuestionSources?.title(q)||q.source||'来源待补充')+'</p><div class="qstem">'+(window.PhysicsMathContent?window.PhysicsMathContent.html(window.PhysicsMathContent.preview(q.stem||'',900)):esc(q.stem||''))+'</div><div class="qimage">'+(q.images||[]).slice(0,4).map(img=>'<img loading="lazy" alt="原题图" src="'+esc(img.useRedraw&&img.redrawPng?img.redrawPng:img.data||img.src||'')+'">').join('')+'</div><div class="wrong-practice-actions"><button type="button" class="small" data-practice-edit="'+esc(q.id)+'">查看 / 审核</button><button type="button" class="small" data-practice-exclude="'+esc(q.id)+'">排除此题</button><button type="button" class="small primary" data-practice-add="'+esc(q.id)+'" '+(inBasket?'disabled':'')+'>'+(inBasket?'已加入题篮':'＋加入题篮')+'</button></div></article>';}).join('')+
 '<div class="wrong-practice-actions">'+(result.rows.length>rows.length?'<button type="button" class="small" data-practice-more="1">查看更多候选</button>':'')+(excluded.size?'<button type="button" class="small" data-practice-reset="1">恢复本次排除（'+excluded.size+'）</button>':'')+'</div><p class="hint">加入后使用右侧原有题篮预览、调整顺序及导出。下方普通题目资源仍可独立筛选。</p>';
}
window.WrongPractice={init,render};
})();
