'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const js=fs.readFileSync(path.join(__dirname,'../question-bank/word-export.js'),'utf8');
const root={PhysicsPaperLayout:require('../question-bank/paper-layout.js')};const sandbox={window:root,atob,Uint8Array,Promise,console};
vm.runInNewContext(js,sandbox,{timeout:1500});
assert.ok(root.PhysicsWordExport&&root.PhysicsWordExport.createDocx,'native OOXML exporter exposed');
let exported;
class ZipFake{
  constructor(){this.files=new Map();exported=this}
  file(name,value){this.files.set(name,value);return this}
  async generateAsync(opts){assert.equal(opts.type,'blob');return {size:2200,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}}
}
const img='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
(async()=>{
for(const layout of ['single','double']){
  const blob=await root.PhysicsWordExport.createDocx({JSZip:ZipFake,title:'力学练习',date:'2026-10-10',layout,feedback:true,items:[
    {stem:'力的示意图',answer:'向下的重力',images:[img],answerImages:[img]},
    {stem:'电路连线',answer:'并联电路',images:[],answerImages:[]}
  ]});
  assert.ok(blob.size>500);
  let x=String(exported.files.get('word/document.xml'));
  assert.ok(x.includes('力学练习'), 'document title present');
  assert.ok(x.includes('w:val="nextPage"'),'page break before answers');
  assert.ok(x.includes('参考答案'),'answers present');
  assert.ok(x.includes('完成后勾选'),'student feedback present');
  assert.ok(!x.includes('altChunk'),'no HTML-dependent Word rendering');
  assert.equal((x.match(/<a:blip r:embed=/g)||[]).length,2,'both question and answer embedded');
  assert.ok(exported.files.has('word/media/image1.png'),'question image embedded');
  assert.ok(exported.files.has('word/media/image2.png'),'answer image embedded');
  assert.ok(String(exported.files.get('word/_rels/document.xml.rels')).includes('image2.png'));
  assert.ok(String(exported.files.get('[Content_Types].xml')).includes('image/png'));
  assert.equal((x.match(/<w:tbl>/g)||[]).length,4,'feedback tables and single-cell keep containers only, no column-layout table');
  assert.equal((x.match(/<w:cols w:num="2"/g)||[]).length,layout==='double'?2:0,'question and answer bodies use native columns');
  assert.ok(x.indexOf('力的示意图')<x.indexOf('电路连线'),'sequential body order');
  assert.ok(exported.files.has('word/footer1.xml'));
  assert.ok(String(exported.files.get('word/footer1.xml')).includes('NUMPAGES'));
  assert.ok(!x.includes('w:trHeight'),'no fixed row heights');
}
await root.PhysicsWordExport.createDocx({JSZip:ZipFake,layout:'double',feedback:false,items:[{stem:'实验表\n项目 | 数值\n'+Array.from({length:20},(_,i)=>'记录'+i+' | 待填').join('\n'),answer:'答案',images:[],answerImages:[]}]});
assert.equal((String(exported.files.get('word/document.xml')).match(/<w:tbl>/g)||[]).length,4,'medium table fitting a column is also kept whole');
const PL=root.PhysicsPaperLayout;
assert.equal(PL.fillBlanks('比热容   的特点，气压为\u3000\u3000Pa。'), '比热容______的特点，气压为______Pa。');
assert.equal(PL.fillBlanks(String.raw`公式\(a   b\)；English   words；表头 |   数值`),String.raw`公式\(a   b\)；English   words；表头 |   数值`);
assert.equal(PL.fillBlanks('选择（　　）；判断(    )；填空   后继续。'),'选择（　　）；判断(    )；填空______后继续。');
assert.equal(PL.fillBlanks('(　　)',()=>'<line/>'),'(　　)','editor rendering also leaves empty parentheses unlined');
const full='【知识点】秘密知识\n【答案】结果甲\n【分析】秘密分析\n【解答】步骤乙\n【解析】秘密解析';
for(const extras of [[],['知识点','分析','解析']]){
 const item={stem:'气压为   Pa。',answer:full,images:[],answerImages:[]};
 await root.PhysicsWordExport.createDocx({JSZip:ZipFake,items:[item],answerSections:extras});
 const xml=String(exported.files.get('word/document.xml'));
 assert.ok(xml.includes('______'));assert.ok(xml.includes('结果甲')&&xml.includes('步骤乙'));
 for(const label of ['知识点','分析','解析'])assert.equal(xml.includes('秘密'+(label==='知识点'?'知识':label)),extras.includes(label));
 assert.ok(!xml.includes('日期：')&&!xml.includes('少量多次'));assert.equal(item.answer,full);
}
assert.equal(PL.selectAnswerSections('未分栏目答案'), '未分栏目答案');
assert.ok(PL.selectAnswerSections('【分析】仅分析').includes('未勾选'));
assert.equal(PL.selectAnswerSections('【分析】仅分析',['分析']),'【分析】仅分析');
await assert.rejects(root.PhysicsWordExport.createDocx({JSZip:ZipFake,items:[]}),/试题篮为空/);
console.log('PASS: OOXML single/double, page break, image relationships, feedback, empty basket');
})().catch(e=>{console.error(e);process.exitCode=1});
