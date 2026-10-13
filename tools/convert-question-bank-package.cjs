/* 将旧题库ZIP/备份JSON转换为统一V2，不覆盖原件。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
globalThis.JSZip=require('../jszip.min.js');
if(!globalThis.crypto)globalThis.crypto=require('node:crypto').webcrypto;
const codec=require('../question-bank/bank-package.js');
(async()=>{
 const [input,output,kind]=process.argv.slice(2);
 if(!input||!output)throw Error('用法：node tools/convert-question-bank-package.cjs 输入文件 输出ZIP [backup|update]');
 if(path.resolve(input)===path.resolve(output)||fs.existsSync(output))throw Error('输出文件已存在或与原件相同，已停止，避免覆盖。');
 const bytes=fs.readFileSync(input),file={name:path.basename(input),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>bytes.toString('utf8')};
 const pkg=await codec.read(file),result=await codec.create(pkg.bank,{kind:kind||pkg.kind,type:'nodebuffer'});
 fs.writeFileSync(output,result.blob,{flag:'wx'});
 console.log('已生成统一V2：'+pkg.bank.questions.length+'道题，'+result.resourceCount+'份去重资源，类型'+result.manifest.kind+'；原件保留。');
})().catch(e=>{console.error(e.message);process.exitCode=1});
