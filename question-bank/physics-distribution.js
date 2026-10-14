/* Read-only, single-assignment physics hierarchy shared by both statistics surfaces. */
(function(root){
'use strict';
const GROUPS=['声学','光学','热学','力学','电磁学','其他','待归类'];
const COLORS=['#7356a3','#a87315','#be5c44','#3679aa','#23867c','#697988','#92979f'];
const TYPES=['选择题','填空题','实验题','作图题','计算题','综合题','其他'];
const $=id=>document.getElementById(id),norm=s=>String(s||'').normalize('NFKC').replace(/[\s/]+/g,'').toLowerCase();
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function uniqueQuestions(rows){const ids=new Set();return (rows||[]).filter(q=>{if(!q||q.archivedAsDuplicate||!q.id||ids.has(q.id))return false;ids.add(q.id);return true})}
function category(c){
 if(!c)return '待归类';
 if(c.module==='声学'||c.chapter==='声现象')return '声学';
 if(['光学','热学','力学','电磁学'].includes(c.module))return c.module;
 return '其他';
}
function infer(original,api){
 // Annotation is performed on a shallow copy, never written back to IndexedDB or the source question.
 const q=root.PhysicsConceptAssessment?.annotate?root.PhysicsConceptAssessment.annotate({...original,knowledgeMappingV1:original.knowledgeMappingV1?{...original.knowledgeMappingV1}:undefined}):original;
 const byId=api.catalogById||new Map(),byName=api.catalogByName||new Map(),type=TYPES.includes(q.type)?q.type:'其他';
 const result=(group,concept,reason)=>({category:group,type,conceptKey:concept?.concept_id||'pending',conceptName:concept?.name||'主知识点待确认',reason});
 if(q.primary_concept_id){const c=byId.get(q.primary_concept_id);return c?result(category(c),c,'题目已有主知识点'):result('待归类',null,'主知识点ID不在当前目录中')}
 const mapping=q.knowledgeMappingV1,parts=mapping?.status!=='stale'?mapping?.parts||[]:[];
 if(parts.length){
  const primary=parts.map(p=>byId.get(p.primary_concept_id));
  if(primary.every(Boolean)){
   const ids=new Set(primary.map(c=>c.concept_id)),groups=new Set(primary.map(category));
   if(ids.size===1)return result(category(primary[0]),primary[0],'各评分单元主知识点一致');
   if(groups.size===1)return result([...groups][0],null,'本题含多个主知识点，未指定整题主知识点');
   return result('待归类',null,'本题评分单元跨大类，整题主归属待确认');
  }
 }
 const known=new Map(),broad=new Set();
 const addId=id=>{const c=byId.get(id);if(c)known.set(c.concept_id,c)};
 const addTag=tag=>{const name=String(tag||'').trim(),c=byName.get(norm(name))||byName.get(name);if(c){addId(c.concept_id);return}
  const alias=root.PhysicsConceptAssessment?.lookup?.(name);for(const id of alias?.concept_ids||[])addId(id);
  const group={'声现象':'声学','声学':'声学','光学':'光学','热学':'热学','力学':'力学','电学':'电磁学','磁学':'电磁学','电磁学':'电磁学'}[name];if(group)broad.add(group);
 };
 for(const id of [...(q.concept_ids||[]),...(original.concept_ids||[])])addId(id);for(const tag of q.tags||[])addTag(tag);
 for(const p of q.parts||[]){for(const id of p.concept_ids||[])addId(id);for(const tag of p.tags||[])addTag(tag)}
 for(const p of parts){for(const id of [...(p.concept_ids||[]),...(p.candidate_concept_ids||[])])addId(id)}
 const list=[...known.values()],groups=new Set([...list.map(category),...broad]);
 if(list.length===1&&groups.size===1&&!parts.some(p=>!p.primary_concept_id&&((p.candidate_concept_ids||[]).length>1)))return result(category(list[0]),list[0],'仅有一个可识别知识点');
 if(groups.size===1)return result([...groups][0],null,list.length?'多个关联知识点，主知识点待确认':'只标注了物理大类');
 return result('待归类',null,groups.size>1?'跨大类关联，整题主归属待确认':'无可识别的主知识点或大类');
}
function classify(original,api){
 const inferred=infer(original,api),manual=original.physicsCategoryV1;
 if(manual?.source==='teacher'&&GROUPS.includes(manual.category)&&manual.category!=='待归类'){
  if(inferred.category===manual.category&&inferred.conceptKey!=='pending')return {...inferred,reason:'教师指定大类；'+inferred.reason};
  return {...inferred,category:manual.category,conceptKey:'category-only',conceptName:'知识点待细化',reason:'教师已指定大类，知识点可稍后补充'};
 }
 return inferred;
}
function matches(q,filter,api){if(q.archivedAsDuplicate)return false;if(filter.approved&&q.review!=='approved')return false;const a=classify(q,api);return (!filter.category||a.category===filter.category)&&(!filter.type||a.type===filter.type)&&(!filter.concept||a.conceptKey===filter.concept)}
const nodeId=path=>JSON.stringify(path);
function compute(rows,api){
 const questions=uniqueQuestions(rows),assignments=new Map(),groups=new Map(GROUPS.map(name=>[name,new Map()]));
 for(const q of questions){const a=classify(q,api);assignments.set(q.id,a);const types=groups.get(a.category);if(!types.has(a.type))types.set(a.type,new Map());const leaves=types.get(a.type);if(!leaves.has(a.conceptKey))leaves.set(a.conceptKey,{name:a.conceptName,ids:[]});leaves.get(a.conceptKey).ids.push(q.id)}
 const tree={id:nodeId([]),name:'全部题目',value:questions.length,path:[],filter:{},children:[]};
 const counts=GROUPS.map((name,i)=>{
  const children=TYPES.filter(type=>groups.get(name).has(type)).map(type=>{
   const children=[...groups.get(name).get(type)].map(([key,leaf])=>({id:nodeId([name,type,key]),name:leaf.name,value:leaf.ids.length,path:[name,type,leaf.name],filter:{category:name,type,concept:key},ids:leaf.ids})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'zh-CN'));
   return {id:nodeId([name,type]),name:type,value:children.reduce((n,c)=>n+c.value,0),path:[name,type],filter:{category:name,type},children};
  });
  const value=children.reduce((n,c)=>n+c.value,0),node={id:nodeId([name]),name,value,path:[name],filter:{category:name},itemStyle:{color:COLORS[i]},children};if(value)tree.children.push(node);return {name,value,color:COLORS[i],id:node.id};
 });
 return {tree,counts,assignments,questions,unconfirmed:[...assignments.values()].filter(a=>['pending','category-only'].includes(a.conceptKey)).length};
}
let api,data,chart,selected='[]',nodes=new Map();
function indexTree(node){nodes.set(node.id,node);for(const child of node.children||[])indexTree(child)}
function shade(hex,amount){return '#'+hex.slice(1).match(/../g).map(x=>Math.round(parseInt(x,16)*(1-amount)+255*amount).toString(16).padStart(2,'0')).join('')}
function chartTree(node,depth=0,color='#edf3f8'){
 const base=node.filter.category?COLORS[GROUPS.indexOf(node.filter.category)]:color,compact=$('detailSunburstChart').clientWidth<420;
 return {...node,itemStyle:{color:depth===0?'#edf3f8':shade(base,Math.max(0,(node.path.length-1)*.24)),borderColor:'#fff',borderWidth:2},label:{show:!compact||depth<=1,fontSize:compact?(depth===0?14:11):depth===0?17:node.path.length===1?15:12,color:depth===0?'#24445e':node.path.length===1?'#fff':'#203b50'},children:node.children?.map(c=>chartTree(c,depth+1,base))};
}
function depth(node){return node.children?.length?1+Math.max(...node.children.map(depth)):1}
function paintChart(node){
 const el=$('detailSunburstChart');if(!root.echarts){el.textContent='图表模块未加载，仍可通过右侧分组明细查看数量。';return}
 chart=chart||root.echarts.init(el);const levels=depth(node),radius=[];
 for(let i=0;i<=levels;i++)radius.push({r0:i===0?0:(i-1)*92/levels+'%',r:i*92/levels+'%',label:{rotate:i===1?0:'tangential',fontSize:i===1?17:i===2?15:12,minAngle:i>2?12:6}});
 chart.setOption({animationDuration:250,tooltip:{trigger:'item',confine:true,formatter:p=>{const n=p.data;return escape(n.path.length?n.path.join(' / '):'全部题目')+'<br>'+n.value+' 道 · 占当前统计范围 '+(data.tree.value?(n.value/data.tree.value*100).toFixed(1):'0')+'%'}},graphic:node.value?[]:[{type:'text',left:'center',top:'middle',style:{text:'暂无有效题目',fill:'#62758b',fontSize:17}}],series:[{type:'sunburst',nodeClick:false,sort:null,radius:[0,'92%'],center:['50%','50%'],levels:radius,emphasis:{focus:'ancestor'},label:{formatter:p=>p.data.path.length===node.path.length?p.name+'\n'+p.value+' 道':p.name},data:node.value?[chartTree(node)]:[]}]},true);
 chart.off('click');chart.on('click',p=>{if(p.data?.id&&nodes.has(p.data.id))select(p.data.id)});
 chart.resize();
}
function select(id){selected=nodes.has(id)?id:'[]';const node=nodes.get(selected);if(!node)return;
 const path=[data.tree]; // Breadcrumbs use IDs, so repeated knowledge-point names remain distinct.
 if(node.filter.category)path.push(nodes.get(nodeId([node.filter.category])));
 if(node.filter.type)path.push(nodes.get(nodeId([node.filter.category,node.filter.type])));
 if(node.filter.concept)path.push(node);
 $('detailDistributionBreadcrumb').innerHTML=path.filter(Boolean).map(n=>'<button data-distribution-node="'+escape(n.id)+'" aria-current="'+(n.id===selected?'true':'false')+'">'+escape(n.name)+'</button>').join('<span aria-hidden="true"> / </span>');
 $('detailDistributionTitle').textContent=(node.path.join(' / ')||'全部题目')+' · '+node.value+' 道';
 const children=node.children||[];
 $('detailDistributionGroups').innerHTML=!node.value?'<p class="hint">当前范围没有有效题目。</p>':children.length?children.map(c=>'<button data-distribution-node="'+escape(c.id)+'"><span>'+escape(c.name)+'</span><strong>'+c.value+' 道</strong></button>').join(''):'<p class="hint">已到知识点层级。点击“查看本组题目”可回到题库检查。</p>';
 const questionIds=node.ids||[];
 $('detailDistributionSample').innerHTML=questionIds.length?'<p class="hint">本组题目示例（最多 5 道）</p>'+questionIds.slice(0,5).map(id=>{const q=data.questions.find(q=>q.id===id),a=data.assignments.get(id);return '<p>'+escape(q.sourceTitle||q.source||id)+' · '+escape(q.sourceNo||id)+'<small>'+escape(a.reason)+'</small></p>'}).join(''):'';
 $('detailDistributionView').disabled=!node.value||!api.focusDistribution;
 $('detailDistributionView').onclick=()=>api.focusDistribution({...node.filter,approved:$('detailScope').value==='approved'});
 $('detailDistributionClassify').disabled=!node.value||!api.classifyDistribution;$('detailDistributionClassify').onclick=()=>api.classifyDistribution({...node.filter,approved:$('detailScope').value==='approved'});
 $('detailDistributionCounts').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.distributionNode===selected)));
 paintChart(node);
}
function init(options){
 api=options;if($('detailDistribution'))return;
 $('detailKpis')?.insertAdjacentHTML('afterend',`<section id="detailDistribution" class="physics-distribution" aria-label="物理大类与旭日图"><div class="detail-chart-title">物理大类与题目结构 <span>总题数 → 大类 → 题型 → 主知识点</span></div><p class="hint">每道有效大题只计一次，不计归档重复题。声现象单列为声学；跨大类且主归属未定的题目列入待归类。能源、数学等列入其他。</p><div id="detailDistributionCounts" class="distribution-counts"></div><div class="distribution-toolbar"><nav id="detailDistributionBreadcrumb" aria-label="当前统计层级"></nav><button id="detailDistributionReset">返回总览</button></div><div class="distribution-layout"><div id="detailSunburstChart" role="img" aria-label="四层物理题库旭日图"></div><div class="distribution-branch"><h3 id="detailDistributionTitle" role="status" aria-live="polite"></h3><p class="hint">点击扇区或下面的分组可展开；悬停查看题量和占比。</p><div id="detailDistributionGroups"></div><button id="detailDistributionView" class="primary">查看本组题目</button><button id="detailDistributionClassify">整理本组分类</button><div id="detailDistributionSample"></div></div></div><p id="detailDistributionFoot" class="detail-foot"></p></section>`);
 $('detailDistribution').addEventListener('click',e=>{const b=e.target.closest('[data-distribution-node]');if(b)select(b.dataset.distributionNode)});
 $('detailDistributionReset').onclick=()=>select('[]');
}
function update(questions,options){if(!$('detailDistribution'))return;api=options;data=compute(questions,options);nodes=new Map();indexTree(data.tree);
 $('detailDistributionCounts').innerHTML=data.counts.map(c=>'<button data-distribution-node="'+escape(c.id)+'" style="--group-color:'+c.color+'" '+(!c.value?'disabled':'')+'><span>'+c.name+'</span><strong>'+c.value+' <small>道</small></strong></button>').join('');
 $('detailDistributionFoot').textContent='当前统计 '+data.tree.value+' 道有效大题；主知识点待确认 '+data.unconfirmed+' 道。这里按单一主归属统计，下面的知识点覆盖表按关联统计，一题可关联多个知识点，因此两者口径不同。';select(selected);
}
function reset(){select('[]')}
function resize(){if(chart&&data)paintChart(nodes.get(selected)||data.tree)}
root.PhysicsBankDistribution={GROUPS,TYPES,uniqueQuestions,classify,infer,matches,compute,init,update,reset,resize,select};
})(typeof window!=='undefined'?window:globalThis);
