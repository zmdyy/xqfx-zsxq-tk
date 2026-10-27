const assert=require('node:assert/strict'),R=require('../wrong-question-recommendations.js');
const c={targets:[{conceptId:'force',assessmentIds:['balance'],relatedIds:['motion']}],sourceFile:'模拟一.pdf',questionNo:'23',stem:'这个原题的完整题干内容需要达到三十个字以上才能用文本确认是否与原题相同。'};
const q=(id,ids,difficulty='',review='pending')=>({id,concept_ids:ids,primary_concept_id:ids[0],stem:'练习题'+id,assessment_ids:[],difficulty,review});
const original={...q('orig',['force']),source:'模拟一.docx',sourceNo:'23'};
const qs=[q('related',['motion'],'容易','approved'),q('unrelated',['heat']),q('same',['force'],'容易','approved'),{...q('method',['force'],'普通','approved'),assessment_ids:['balance']},q('pending',['force']),original,{...q('archived',['force']),archivedAsDuplicate:true}];
const r=R.rank(qs,c);assert.equal(r.rows[0].q.id,'method');assert.equal(r.rows.at(-1).q.id,'related');assert.equal(r.originals,1);assert(!r.rows.some(x=>['unrelated','orig','archived'].includes(x.q.id)));
assert.equal(R.rank(qs,{targets:[]}).rows.length,0);
assert(R.sameOriginal({...original,source:'other.docx',sourceRefs:[{file:'模拟一.docx',no:23}]},c));assert(!R.sameOriginal({...original,sourceNo:24},c));assert(R.sameOriginal({...q('text',['force']),stem:'23. '+c.stem},c));
const long='这是重复题目的足够长的完整题干文本，必须超过三十个字才能根据题干文字去重避免重复推荐给用户。';assert.equal(R.rank([{...q('a',['force']),stem:long},{...q('b',['force']),stem:long}],c).rows.length,1);
assert.equal(R.rank([q('combo',['force','heat'])],c,()=>[{concept_ids:['force'],assessment_ids:[]},{concept_ids:['heat'],assessment_ids:['balance']}]).rows[0].tier,3);
const entries=[{ref:'23',parts:[{primary_concept_id:'force',score_eligible:true,score_header:'23-1'},{primary_concept_id:'heat',score_eligible:true,score_header:'23-2'},{primary_concept_id:'motion',score_eligible:false}]}];
assert.deepEqual(R.targetParts(entries,['23-1'],false,x=>x).map(t=>t.conceptId),['force']);assert.equal(R.targetParts(entries,['23'],true,x=>x).length,3);assert.equal(R.targetParts(entries,['23-3'],false,x=>x).length,0);
assert.equal(R.rank([q('legacy',['mech_newton1_core'])],{targets:[{conceptId:'mech_newton1'}]}).rows.length,1);
class Store{constructor(){this.map=new Map()}get length(){return this.map.size}key(i){return [...this.map.keys()][i]}getItem(k){return this.map.get(k)||null}setItem(k,v){this.map.set(k,v)}removeItem(k){this.map.delete(k)}}
const storage=new Store(),token='test-token-123';R.saveContext(storage,c,token);assert.equal(R.readContext(storage,token).targets[0].conceptId,'force');assert.equal(R.readContext(storage,'wrong-token'),null);storage.setItem('practiceRecommendationContextV1:'+token,JSON.stringify({...c,version:1,createdAt:0}));assert.equal(R.readContext(storage,token),null);
assert.equal(R.rank([{...q('img1',['force']),stem:long,images:[{data:'diagram-A'}]},{...q('img2',['force']),stem:long,images:[{data:'diagram-B'}]}],c).rows.length,2);
assert.equal(R.rank([],c).rows.length,0);
console.log('PASS ranking, score bindings, original exclusion, duplicates, aliases, expiry');
