/* 错题推荐：只使用已有知识点标注；不调用外部 API，不推断学生未作答。 */
(function(root){
'use strict';
const PREFIX='practiceRecommendationContextV1:',TTL=24*60*60*1000;
const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const alias={mech_newton1_core:'mech_newton1',mech_archimedes_core:'mech_archimedes',mech_balance_forces_core:'mech_balance_forces'};
const cid=id=>alias[id]||id;
const unique=a=>[...new Set(a.filter(Boolean))];
function targetParts(entries,wrongRefs,whole,ref){
 const result=[];
 for(const entry of entries){
  for(const part of entry.parts){
   if(!part.primary_concept_id)continue;
   const binding=part.score_header?ref(part.score_header):entry.ref;
   const exact=part.score_eligible&&binding&&wrongRefs.includes(binding);
   if(!exact&&!whole)continue;
   result.push({conceptId:cid(part.primary_concept_id),assessmentIds:unique(part.assessment_ids||[]),relatedIds:unique((part.related_concept_ids||[]).map(cid)),label:part.part_label||'整题',scope:exact?'scored':'whole',confidence:part.confidence||'unknown'});
  }
 }
 const seen=new Set();return result.filter(t=>{const k=JSON.stringify(t);if(seen.has(k))return false;seen.add(k);return true});
}
function cleanStem(s){return norm(String(s||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/<[^>]*>/g,'').replace(/^\s*(?:第\s*)?\d{1,3}\s*(?:题|[．.、])\s*/,''));}
function fileKey(s){return norm(s).replace(/\.(pdf|docx?|md|json)$/,'');}
function sameOriginal(q,c){
 const a=cleanStem(q.stem),b=cleanStem(c.stem);
 if(a.length>=30&&a===b&&!(q.images||[]).length&&!/!\[|<img\b/i.test(String(q.stem||'')+String(c.stem||'')))return true;
 const source=fileKey(c.sourceFile);
 return Boolean(source&&c.questionNo&&(q.sourceRefs||[]).concat([{file:q.source,no:q.sourceNo}]).some(r=>fileKey(r.file)===source&&String(r.no)===String(c.questionNo)));
}
function rank(questions,context,units){
 const targets=context.targets||[],primary=new Set(targets.map(t=>cid(t.conceptId))),related=new Set(targets.flatMap(t=>t.relatedIds||[]).map(cid));
 const rows=[];let originals=0;
 for(const q of questions){
  if(q.archivedAsDuplicate)continue;
  if(sameOriginal(q,context)){originals++;continue;}
  const parts=units?units(q):[{concept_ids:q.concept_ids||[],assessment_ids:q.assessment_ids||[]}];
  const ids=unique([q.primary_concept_id,...(q.concept_ids||[]),...parts.flatMap(p=>p.concept_ids||[])].map(cid));
  const hit=ids.filter(id=>primary.has(id)),secondary=ids.filter(id=>related.has(id));
  if(!hit.length&&!secondary.length)continue;
  const method=parts.some(p=>targets.some(t=>cid(p.primary_concept_id||(parts.length===1?q.primary_concept_id:null))===cid(t.conceptId)&&(p.assessment_ids||[]).some(id=>(t.assessmentIds||[]).includes(id))));
  const primaryHit=unique([q.primary_concept_id,...parts.map(p=>p.primary_concept_id)].map(cid)).some(id=>primary.has(id));
  const tier=primaryHit?(method?4:3):hit.length?2:1;
  rows.push({q,tier,conceptIds:hit.length?hit:secondary,reason:primaryHit?(method?'同主知识点、同考法':'同主知识点'):hit.length?'包含目标知识点（请核对考查重点）':'相关知识点（补充候选）',score:tier*100+(q.review==='approved'?10:0)+(q.primary_concept_id&&primary.has(cid(q.primary_concept_id))?5:0)});
 }
 rows.sort((a,b)=>b.score-a.score||String(a.q.id).localeCompare(String(b.q.id)));
 const stems=new Set(),ids=new Set();const dedup=rows.filter(r=>{const key=cleanStem(r.q.stem),textOnly=!(r.q.images||[]).length&&!/!\[|<img\b/i.test(r.q.stem||'');if(ids.has(r.q.id)||(textOnly&&key.length>=30&&stems.has(key)))return false;ids.add(r.q.id);if(textOnly&&key.length>=30)stems.add(key);return true});
 // 三个建议保留真实难度；未知难度不冒充基础题。仍以知识点/考法匹配优先。
 const best=dedup[0]?.tier,top=dedup.filter(r=>r.tier===best),chosen=[];
 for(const difficulty of ['容易','普通','困难']){const r=top.find(r=>r.q.difficulty===difficulty&&!chosen.includes(r));if(r)chosen.push(r);}
 for(const r of dedup)if(chosen.length<3&&!chosen.includes(r))chosen.push(r);
 return {rows:dedup,recommended:chosen.slice(0,3),originals};
}
function saveContext(storage,context,token){
 const now=Date.now();for(let i=storage.length-1;i>=0;i--){const k=storage.key(i);if(!k?.startsWith(PREFIX))continue;try{if(now-JSON.parse(storage.getItem(k)).createdAt>TTL)storage.removeItem(k)}catch(e){storage.removeItem(k)}}
 storage.setItem(PREFIX+token,JSON.stringify({...context,version:1,createdAt:now}));return token;
}
function readContext(storage,token){if(!/^[a-zA-Z0-9-]{8,100}$/.test(token||''))return null;const value=storage.getItem(PREFIX+token);if(!value)return null;const c=JSON.parse(value);if(c.version!==1||!Number.isFinite(c.createdAt)||Date.now()-c.createdAt>TTL||!Array.isArray(c.targets))return null;return c;}
root.WrongQuestionRecommendations={targetParts,rank,saveContext,readContext,sameOriginal};
if(typeof module!=='undefined')module.exports=root.WrongQuestionRecommendations;
})(typeof window!=='undefined'?window:globalThis);
