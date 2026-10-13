/* 选择题的选项图：图片对象上的 option 字段（如 'A'）表示该图属于哪个选项。
 * 未标 option 的图片仍按原来的方式排在题干之后。 */
(function(root){
'use strict';
const LETTER=/(?:^|[\s　])([A-H])[．.、]/g;
const EMPTY_OPTION_LINE=/^[\s　]*(?:[A-H][．.、][\s　]*)+$/;
function lettersIn(line){return Array.from(String(line).matchAll(LETTER),m=>m[1])}
function optionLines(stem){
 const map=new Map();
 String(stem||'').split('\n').forEach((line,i)=>{for(const letter of lettersIn(line))if(!map.has(letter))map.set(letter,i)});
 return map;
}
function optionLetters(stem){return Array.from(optionLines(stem).keys())}
function emptyOptionLetters(stem){
 const out=[];
 for(const line of String(stem||'').split('\n'))if(EMPTY_OPTION_LINE.test(line))out.push(...lettersIn(line));
 return out;
}
function suggest(q){
 const images=q?.images||[];
 if(!images.length||images.some(im=>im&&im.option))return null;
 const letters=emptyOptionLetters(q.stem);
 if(letters.length<2)return null;
 let offset;
 if(images.length===letters.length)offset=0;
 else if(images.length===letters.length+1)offset=1;
 else return null;
 return letters.map((option,i)=>({index:i+offset,option}));
}
function apply(q,mapping){
 for(const {index,option}of mapping||[])if(q.images?.[index])q.images[index].option=option;
 return q;
}
/* images：[{src, option}]；返回按行切开的片段，选项图紧跟在所属选项那一行之后。 */
function segments(stem,images){
 const lines=String(stem||'').split('\n'),at=optionLines(stem),anchored=new Map(),loose=[];
 for(const im of images||[]){
  const line=im&&im.option?at.get(im.option):undefined;
  if(line===undefined)loose.push(im);else{if(!anchored.has(line))anchored.set(line,[]);anchored.get(line).push(im)}
 }
 if(!anchored.size)return [{text:lines.join('\n'),images:loose,option:false}];
 const firstOption=Math.min(...at.values()),out=[];let buffer=[];
 lines.forEach((line,i)=>{
  if(i===firstOption&&firstOption>0&&loose.length){out.push({text:buffer.join('\n'),images:loose,option:false});buffer=[]}
  buffer.push(line);
  if(anchored.has(i)){out.push({text:buffer.join('\n'),images:anchored.get(i),option:true});buffer=[]}
 });
 out.push({text:buffer.join('\n'),images:firstOption>0?[]:loose,option:false});
 return out;
}
/* 排版块：text 文本；images 图片（option 表示选项图）；grid 连续的“仅字母+图”选项，按试卷习惯并排。 */
function layout(stem,images){
 const blocks=[];
 for(const seg of segments(stem,images)){
  const lines=seg.text.split('\n'),last=lines[lines.length-1];
  if(seg.option&&EMPTY_OPTION_LINE.test(last)){
   const before=lines.slice(0,-1).join('\n');
   if(before.trim())blocks.push({kind:'text',text:before});
   const cell={label:last.trim(),images:seg.images},prev=blocks[blocks.length-1];
   if(prev&&prev.kind==='grid')prev.cells.push(cell);else blocks.push({kind:'grid',cells:[cell]});
   continue;
  }
  if(seg.text.trim())blocks.push({kind:'text',text:seg.text});
  if(seg.images.length)blocks.push({kind:'images',images:seg.images,option:seg.option});
 }
 return blocks;
}
function hasAnchors(images){return (images||[]).some(im=>im&&im.option)}
root.PhysicsOptionImages={optionLetters,emptyOptionLetters,suggest,apply,segments,layout,hasAnchors};
if(typeof module!=='undefined')module.exports=root.PhysicsOptionImages;
})(typeof window!=='undefined'?window:globalThis);
