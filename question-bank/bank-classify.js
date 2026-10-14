/* Quick categories are saved independently of optional knowledge detail. */
(function(root){
'use strict';
const $=id=>document.getElementById(id),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let api,ids=[],index=0,current=null,busy=false,suggestion=null,session=0;
function message(t){$('bcStatus').textContent=t}
async function load(){
 const token=++session;current=null;message('正在读取题目…');const q=await api.getQuestion(ids[index]);if(token!==session)return;if(!q){message('该题已不存在，请关闭后重新打开。');return}current=q;
 const D=root.PhysicsBankDistribution,a=D.classify(q,api);suggestion=D.infer(q,api);
 $('bcTitle').textContent='整理题目分类 · '+(index+1)+' / '+ids.length;
 $('bcQuestion').innerHTML='<h3>'+E(q.sourceTitle||q.source||'题目')+' · 第 '+E(q.sourceNo||'?')+' 题</h3><div>'+ (root.PhysicsMathContent?root.PhysicsMathContent.html(q.stem||''):E(q.stem))+'</div>'+(q.images||[]).map(im=>'<img alt="原题图" src="'+E(im.useRedraw&&im.redrawPng?im.redrawPng:im.data||im.src||'')+'">').join('')+'<h3>答案</h3><div>'+(root.PhysicsMathContent?root.PhysicsMathContent.html(q.answer||''):E(q.answer))+'</div>';
 $('bcCategory').value=q.physicsCategoryV1?.source==='teacher'?q.physicsCategoryV1.category:'';
 $('bcCurrent').textContent='当前归属：'+a.category+' / '+a.conceptName+'。'+a.reason;
 $('bcRefine').checked=false;$('bcFine').hidden=true;
 $('bcPrimary').innerHTML='<option value="">暂不确定</option>'+[...api.catalogById.values()].map(c=>'<option value="'+E(c.concept_id)+'">'+E(c.module+' / '+c.name)+'</option>').join('');$('bcPrimary').value=q.primary_concept_id||'';
 $('bcRelated').value=(q.tags||[]).join('；');
 $('bcSuggestion').textContent=suggestion.category==='待归类'?'自动建议：尚无可靠大类依据，建议手动选择。':'自动建议：'+suggestion.category+'。依据：'+suggestion.reason+'；'+suggestion.conceptName;
 $('bcUseSuggestion').disabled=suggestion.category==='待归类';message('只选大类即可保存，知识点可以稍后细化。');
}
async function save(next){
 if(busy||!current)return;busy=true;$('bcDialog').querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
 try{
  const category=$('bcCategory').value,refine=$('bcRefine').checked,primary=$('bcPrimary').value;
  const related=$('bcRelated').value.split(/[；;,，、]/).map(t=>t.trim()).filter(Boolean).map(name=>[...api.catalogById.values()].find(c=>c.name===name)?.concept_id);
  if(refine&&related.some(id=>!id))throw Error('关联知识点中有目录未识别的名称，请使用已有知识点名称。');
  const selectedConcept=api.catalogById.get(primary);
  if(refine&&category&&selectedConcept){const group=root.PhysicsBankDistribution.infer({primary_concept_id:primary},api).category;if(group!==category)throw Error('主知识点与所选大类不一致，请核对后保存。')}
  current=await api.save(current,{category,refine,primary,related});message('分类已保存。原题干、答案、图片和原有标签保留。');
  if(next&&index<ids.length-1){index++;await load()}else if(next)message('分类已保存，已到本组最后一题。');
 }catch(e){message('保存失败：'+e.message)}finally{busy=false;$('bcDialog').querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);if(suggestion?.category==='待归类')$('bcUseSuggestion').disabled=true}
}
function init(options){api=options;document.body.insertAdjacentHTML('beforeend',`<dialog id="bcDialog" class="bc-dialog" aria-labelledby="bcTitle"><header class="bm-head"><h2 id="bcTitle">整理题目分类</h2><button id="bcClose">关闭</button></header><div class="bc-layout"><section id="bcQuestion" class="bc-question"></section><section class="bc-controls"><h3>快速归类</h3><p id="bcCurrent"></p><label>大类<select id="bcCategory"><option value="">按已有知识点自动归类（撤销手动指定）</option>${root.PhysicsBankDistribution.GROUPS.filter(g=>g!=='待归类').map(g=>'<option>'+g+'</option>').join('')}</select></label><p>只选大类即可保存，不要求填写主知识点和关联知识点。</p><p id="bcSuggestion"></p><button id="bcUseSuggestion">采用大类建议</button><label><input type="checkbox" id="bcRefine">同时细化知识点（可选）</label><div id="bcFine" hidden><label>主知识点<select id="bcPrimary"></select></label><label>关联知识点（使用目录名称，以分号分隔）<textarea id="bcRelated"></textarea></label><p>新增的知识点会补入标签，原有标签保留。</p></div><p id="bcStatus" role="status" aria-live="polite"></p><div class="bm-actions"><button id="bcPrev">上一题</button><button id="bcNext">下一题</button></div><div class="bm-actions"><button id="bcSave">保存</button><button id="bcSaveNext" class="primary">保存并下一题</button></div></section></div></dialog>`);
 $('bcClose').onclick=()=>{if(!busy){session++;$('bcDialog').close()}};$('bcDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else session++});$('bcRefine').onchange=()=>$('bcFine').hidden=!$('bcRefine').checked;
 $('bcUseSuggestion').onclick=()=>{$('bcCategory').value=suggestion.category;message('已选择建议大类；点击保存后写入题库。')};$('bcSave').onclick=()=>save(false);$('bcSaveNext').onclick=()=>save(true);
 for(const [id,step]of [['bcPrev',-1],['bcNext',1]])$(id).onclick=()=>{if(busy)return;if(index+step<0||index+step>=ids.length){message('已到本组边界。');return}index+=step;load().catch(e=>message(e.message))};
}
async function open(filter={}){if(busy)return;ids=root.PhysicsBankDistribution.uniqueQuestions(api.questions()).filter(q=>root.PhysicsBankDistribution.matches(q,filter,api)).map(q=>q.id);index=0;if(!ids.length)return; $('bcDialog').showModal();try{await load()}catch(e){message('读取失败：'+e.message)}}
root.PhysicsBankClassify={init,open};
})(window);
