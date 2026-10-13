'use strict';
const assert=require('node:assert/strict');
const OI=require('../question-bank/option-images.js');
const img=option=>option?{data:'x',option}:{data:'x'};

const stem='10．其中有效的是（　　）\nA．\nB．\nC．\nD．';
assert.deepEqual(OI.emptyOptionLetters(stem),['A','B','C','D']);
assert.deepEqual(OI.suggest({stem,images:[img(),img(),img(),img()]}).map(x=>[x.index,x.option]),[[0,'A'],[1,'B'],[2,'C'],[3,'D']],'one figure per empty option');
assert.deepEqual(OI.suggest({stem,images:[img(),img(),img(),img(),img()]}).map(x=>x.index),[1,2,3,4],'one extra figure is kept as the stem figure');
assert.equal(OI.suggest({stem,images:[img(),img()]}),null,'count mismatch is not guessed');
assert.equal(OI.suggest({stem,images:[img('A'),img(),img(),img()]}),null,'existing teacher mapping is never overridden');
assert.equal(OI.suggest({stem:'1．下列说法正确的是\nA．压强增大\nB．压强减小',images:[img(),img()]}),null,'text options are not paired with figures');
assert.deepEqual(OI.emptyOptionLetters('A．　　B．\nC．　　D．'),['A','B','C','D'],'two options per line');

const blocks=OI.layout(stem,[img(),img('A'),img('B'),img('C'),img('D')]);
assert.deepEqual(blocks.map(b=>b.kind),['text','images','grid'],'stem, then the stem figure, then the option grid');
assert.deepEqual(blocks[2].cells.map(c=>c.label),['A．','B．','C．','D．']);
assert.ok(blocks[2].cells.every(c=>c.images.length===1));

const mixed=OI.layout('1．如图\nA．甲图正确\nB．乙图正确',[img('A'),img('B')]);
assert.deepEqual(mixed.map(b=>b.kind),['text','images','text','images'],'options with text keep their figure right after the option line');
assert.ok(mixed[2].text.startsWith('B．'));

const segs=OI.segments(stem,[img('B')]);
assert.equal(segs.map(s=>s.text).join('\n'),stem,'segments preserve the original text for highlight offsets');
assert.equal(OI.layout('1．无选项',[img(),img()]).length,2,'unanchored questions keep the legacy layout');
console.log('PASS: option figure suggestion guards, stem figure ordering, option grid, text-option figures, offset-preserving segments');
