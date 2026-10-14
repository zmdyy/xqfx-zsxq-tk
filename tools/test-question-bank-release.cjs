'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),scripts=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts;
const groups=['test','test:editor','test:review','test:preview','test:word','test:package','test:management','test:backup','test:distribution','test:flow','test:edit-classify'];
const files=[...new Set([...groups.flatMap(group=>[...scripts[group].matchAll(/\bnode (tests\/[\w.-]+\.cjs)/g)].map(m=>m[1])),'tests/question-bank-knowledge-math.test.cjs'])];
for(const [i,file] of files.entries()){
 process.stdout.write('\n['+(i+1)+'/'+files.length+'] '+file+'\n');
 const result=spawnSync(process.execPath,[file],{cwd:root,stdio:'inherit',env:process.env});
 if(result.error){console.error(result.error.message);process.exit(1)}
 if(result.status!==0)process.exit(result.status||1);
}
console.log('\nPASS release: '+files.length+' distinct test files; all completed.');
