/* Source scoring units are distinct from paper question numbers. No score allocation is inferred. */
(function(root){
'use strict';
const text=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'');
function memberHeader(value){const s=text(value).replace(/\([\d.]+分\)$/,'');const m=s.match(/(?:第)?(\d+(?:[、,]\d+)+)题_?(\d+)$/);return m&&m[1].split(/[、,]/).includes(m[2])?String(Number(m[2])):null;}
function majors(value){const r=typeof getCanonicalQuestionRefInfo==='function'?getCanonicalQuestionRefInfo(value):null;return r?.kind==='major-list'?r.majors.map(String):r?.major!=null?[String(r.major)]:[];}
function bindings(input){const s=text(input);if(!/^[\d、,\-~至]+$/.test(s))throw Error('请输入题号，例如 9-13 或 1、4');let out=[];for(const part of s.split(/[、,]/)){const m=part.match(/^(\d+)[\-~至](\d+)$/);if(m){let a=Number(m[1]),b=Number(m[2]);if(a>b||b-a>199)throw Error('题号范围无效');for(let i=a;i<=b;i++)out.push(String(i));}else out.push(String(Number(part)));}if(out.some(x=>!/^\d+$/.test(x)||Number(x)<1||Number(x)>200))throw Error('题号须在 1—200 之间');return [...new Set(out)];}
function markSummaries(items,score,full){
 const keys=Object.keys(items);for(const k of keys){const target=items[k];if(!target||typeof target!=='object')continue;delete target.summaryOf;
 const ids=majors(k);let components=[];
 if(ids.length>1)components=ids.map(id=>keys.find(n=>n!==k&&majors(n).length===1&&majors(n)[0]===id&&text(n).replace(/^第/,'').replace(/题$/,'')===id)).filter(Boolean);
 if(/^(?:作文|书面表达)$/.test(k))components=keys.filter(n=>n!==k&&n.startsWith(k)&&/(书写|写作)/.test(n));
 if(components.length<2||(ids.length>1&&components.length!==ids.length))continue;
 if(Math.abs(components.reduce((s,n)=>s+Number(full(items[n])),0)-Number(full(target)))>1e-8)continue;
 if(score&&score(target)!=null&&components.every(n=>score(items[n])!=null)&&Math.abs(components.reduce((s,n)=>s+score(items[n]),0)-score(target))>1e-8)continue;
 target.summaryOf=components;
 }return items;
}
function prepare(map,rows){
 // Only suppress a source total when both full marks and every available numeric row reconcile.
 markSummaries(map,null,x=>x.maxScore);
 for(const q of Object.values(map)){if(!q.summaryOf)continue;const checked=rows.filter(row=>[q,...q.summaryOf.map(k=>map[k])].every(x=>row[x.scoreIndex]!==''&&row[x.scoreIndex]!=null&&Number.isFinite(Number(row[x.scoreIndex]))));if(!checked.length||checked.some(row=>Math.abs(q.summaryOf.reduce((s,k)=>s+Number(row[map[k].scoreIndex]),0)-Number(row[q.scoreIndex]))>1e-8))delete q.summaryOf;}
}
function upgradeItems(items){const fixed={};for(const [key,item]of Object.entries(items||{})){const name=memberHeader(key)||key;if(fixed[name]&&name!==key){fixed[key]=item;continue;}fixed[name]=item;}
 markSummaries(fixed,x=>x.score===''||x.score==null||!Number.isFinite(Number(x.score))?null:Number(x.score),x=>x.maxScore);
 for(const [k,x]of Object.entries(fixed)){if(!x||typeof x!=='object')continue;const ids=majors(k);x.paperMajors=ids;x.sharedScore=ids.length>1;if(x.summaryOf)continue;}
 return fixed;
}
function upgradeBatch(batch){
 for(const s of batch.combinedStudentData||[])for(const sd of Object.values(s.subjects||{}))sd.subScores=upgradeItems(sd.subScores);
 const subjectNames=[...new Set((batch.combinedStudentData||[]).flatMap(s=>Object.keys(s.subjects||{})))];
 for(const name of subjectNames){const maps=(batch.combinedStudentData||[]).map(s=>s.subjects?.[name]?.subScores).filter(Boolean),keys=[...new Set(maps.flatMap(m=>Object.keys(m)))];
  for(const key of keys){const candidate=maps.map(m=>m[key]).find(x=>x?.summaryOf);if(!candidate)continue;const parts=candidate.summaryOf;
   const consistent=maps.every(m=>{const t=m[key];if(!t)return true;if(!parts.every(k=>m[k]))return false;const values=[t,...parts.map(k=>m[k])];if(values.some(x=>x.score===''||x.score==null||!Number.isFinite(Number(x.score))))return true;return Math.abs(parts.reduce((s,k)=>s+Number(m[k].score),0)-Number(t.score))<1e-8;});
   for(const m of maps)if(m[key]){if(consistent)m[key].summaryOf=parts;else delete m[key].summaryOf;}
  }
 }
 for(const h of batch.allSubjectHeaders||[]){const map=h.subScoreQuestionMap;if(!map)continue;const updated={};for(const [k,q]of Object.entries(map)){const name=memberHeader(k)||k;updated[name]={...q,name};}prepare(updated,[]); // summaries in actual records determine suppression when metadata lacks raw rows
 for(const [k,q]of Object.entries(updated)){const samples=(batch.combinedStudentData||[]).map(s=>s.subjects?.[h.name]?.subScores?.[k]).filter(Boolean);if(samples.length&&samples.every(x=>x.summaryOf))q.summaryOf=samples[0].summaryOf;}
 h.subScoreQuestionMap=updated;}
}
function targets(batch,subject,name){const ids=majors(name);if(ids.length)return ids;return Object.entries(batch.notebookCropReviews||{}).flatMap(([key,r])=>{try{const [s,n]=JSON.parse(key);return s===subject&&r.manualScoreBinding&&r.scoreColumns?.includes(name)?[String(n)]:[];}catch{return [];}}).sort((a,b)=>Number(a)-Number(b));}
function isGroup(batch,subject,name){return targets(batch,subject,name).length>1;}
function missingSubjects(batch,student){const all=[...new Set((batch.combinedStudentData||[]).flatMap(s=>Object.keys(s.subjects||{})))];return all.filter(n=>!student.subjects?.[n]);}
root.ScoreUnitRelations={memberHeader,majors,bindings,prepare,upgradeItems,upgradeBatch,targets,isGroup,missingSubjects};
if(typeof module!=='undefined')module.exports=root.ScoreUnitRelations;
})(typeof window!=='undefined'?window:globalThis);
