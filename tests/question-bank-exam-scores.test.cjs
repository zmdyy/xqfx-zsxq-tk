'use strict';
const assert=require('node:assert/strict'),data=require('../question-bank/exam-data.json'),{create}=require('../question-bank/exam-scores.js'),scores=create(data);
assert.deepEqual([2021,2022,2023,2024,2025].map(y=>scores.get('sound',y).value),[2,2,2,2,2]);assert.equal(scores.get('sound',2021).status,'verified');assert.equal(scores.get('sound',2023).status,'reference');assert.equal(scores.get('safety',2023).value,2);
assert.deepEqual([2021,2022,2023,2024,2025].map(y=>scores.get('electric-power',y).value),[8,7,9,6,5]);assert.equal(scores.get('heat',2025).value,null);assert.match(scores.get('heat',2025).groupLabel,/整组6分/);assert.equal(scores.get(['heat','engine'],2025).value,null);assert.equal(scores.get('work',2021).status,'conflict');assert.equal(scores.get('pressure',2024).value,null);assert.equal(scores.get('lens',2022).status,'notSeen');assert.equal(scores.get('sound',2020).status,'missing');
const r=(id,status,value)=>({id,taskId:id,moduleId:'x',year:2025,tested:true,scoreStatus:status,scores:value?[value]:[],references:[{paperId:'p',sourceNo:'1'}]});
assert.equal(create({records:[r('a','known',2),r('b','review')]}).get('x',2025).value,null,'known partial score must not become topic total');
const same=create({records:[r('a','known',2),{...r('b','known',2),moduleId:'y'}]});assert.equal(same.get(['x','y'],2025).value,null,'overlapping parent groups cannot be summed automatically');
for(const g of data.overviewGroups)for(const y of data.years){const c=scores.get(g.moduleIds,y);if(c.value!==null)assert.ok(['verified','reference'].includes(c.status));}
console.log('PASS: reference restoration, source conflict states, whole-group heat dedup, incomplete and overlapping sums excluded from colour values');
