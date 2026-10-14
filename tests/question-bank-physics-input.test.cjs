'use strict';
const assert=require('assert/strict');
global.katex=require('../katex.min.js');const M=require('../question-bank/math-content.js'),P=require('../question-bank/physics-input.js');
for(const p of P.presets)assert.doesNotThrow(()=>M.mathml(p.tex),p.label);
assert.ok(P.presets.some(p=>p.label==='J/(kg·℃)'));
assert.ok(!P.presets.some(p=>p.label==='J/(kg·K)'||p.label==='电加热综合计算'));
assert.equal(P.scan('型号 AF1X，题号123，单位 kg/m³，公式 \\(F_1=2\\)').length,0);
assert.deepEqual(P.scan('F1，cm3，kg/m3，J/kg℃，Q吸').map(x=>x.after),['\\(F_{1}\\)','cm³','kg/m³','J/(kg·℃)','\\(Q_{\\text{吸}}\\)']);
const typography="R0，R0'，R0′，R0²，R0^2，R0^{2}，R10'，L1，S1，P1，ρ1";
const fixes=P.scan(typography);
assert.equal(fixes.length,11);assert.ok(fixes.every(x=>x.category==='numeric-subscript'));
assert.deepEqual(fixes.slice(0,7).map(x=>x.after),['\\(R_{0}\\)','\\(R_{0}^{\\prime}\\)','\\(R_{0}^{\\prime}\\)','\\(R_{0}^{2}\\)','\\(R_{0}^{2}\\)','\\(R_{0}^{2}\\)','\\(R_{10}^{\\prime}\\)']);
for(const x of fixes)assert.deepEqual(M.validate(x.after),[],x.before);
assert.equal(P.scan("型号 AF1X、R2025，原式 \\(R_{0}^{\\prime}\\)，已规范 R₀′").length,0);
assert.deepEqual(P.scan('cm3；Q吸；1.25×103；J/kg℃').map(x=>x.category),['unit-exponent','text-subscript','scientific-exponent','unit-format']);
for(const [before,after] of [
 ['P1=U额2/R1',String.raw`\(P_{1}=\frac{U_{\text{额}}^{2}}{R_{1}}\)`],
 ['P1=`U额2`/R1',String.raw`\(P_{1}=\frac{U_{\text{额}}^{2}}{R_{1}}\)`],
 ['P=U²/R',String.raw`\(P=\frac{U^{2}}{R}\)`],
 ['P1=U1^2/R1',String.raw`\(P_{1}=\frac{U_{1}^{2}}{R_{1}}\)`],
 ['I=P/U',String.raw`\(I=\frac{P}{U}\)`],
 ['I1=P额/U额',String.raw`\(I_{1}=\frac{P_{\text{额}}}{U_{\text{额}}}\)`],
 ...['G','m','V'].map(b=>[b+'排','\\('+b+'_{\\text{排}}\\)'])
]){
 const fixes=P.scan(before);assert.equal(fixes.length,1,before);assert.equal(fixes[0].before,before);assert.equal(fixes[0].after,after);assert.deepEqual(M.validate(after),[]);assert.equal(P.scan(after).length,0,'already formatted '+before);
}
for(const raw of ["P1=U额2/R1'",'P1=U额2/R1^2','I=P/U1²'])assert.ok(!P.scan(raw).some(x=>x.category==='electric-power-formula'),'do not truncate denominator power/prime');
assert.equal(P.scan('G排²')[0].after,String.raw`\(G_{\text{排}}^{2}\)`);
assert.equal(P.scan("m排'")[0].after,String.raw`\(m_{\text{排}}^{\prime}\)`);
assert.equal(P.scan('型号 AP1X=U额2/R1X').length,0,'do not rewrite model identifiers');
console.log('PASS: all presets parse, thermal exclusions, conservative suggestions and no mutation');

const vm=require('vm'),fs=require('fs'),path=require('path');
const win={katex:global.katex,JSZip:require('../jszip.min.js'),PhysicsMathContent:M,PhysicsPaperLayout:require('../question-bank/paper-layout.js')};
for(const f of ['mathml2omml.js','question-bank/word-export.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),{window:win,console,Uint8Array,atob,Blob});
(async()=>{const blob=await win.PhysicsWordExport.createDocx({items:P.presets.map(p=>({stem:p.label+'：\\('+p.tex+'\\)',answer:'',images:[],answerImages:[]})),feedback:false});const z=await win.JSZip.loadAsync(await blob.arrayBuffer()),xml=await z.file('word/document.xml').async('string');assert.ok(xml.includes('<m:oMath'));assert.ok(!xml.includes('\\frac'));console.log('PASS: every preset converts to native Word equations')})().catch(e=>{console.error(e);process.exitCode=1});
