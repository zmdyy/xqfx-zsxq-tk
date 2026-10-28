/* Small, allowlisted API diagnostics. Never retain request/response text or credentials. */
(function(root){
'use strict';
const BUILD='20261028-unified-v1',KEY='practiceAiDiagnosticsV1',LIMIT=80;let memory=[],sequence=0,loaded=false;
const token=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v)?v:undefined;
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:undefined;
const select=(obj,keys,fn)=>Object.fromEntries(keys.map(k=>[k,fn(obj?.[k])]).filter(x=>x[1]!==undefined));
function usage(value){const out=select(value,['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens'],number);out.reasoning_tokens=number(value?.completion_tokens_details?.reasoning_tokens);return out;}
function shape(content){const out={characters:typeof content==='string'?content.length:0};try{const j=JSON.parse(String(content).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));out.validJson=true;out.object=!!j&&typeof j==='object'&&!Array.isArray(j);if(out.object){out.fields={};for(const key of ['goal','summary','evidence','conceptIds','assessmentIds','hypotheses','uncertainty','reason','items','diagnosis','plan']){const v=j[key];out.fields[key]={type:v===null?'null':Array.isArray(v)?'array':typeof v};if(Array.isArray(v)||typeof v==='string')out.fields[key].length=v.length;}out.unknownFields=Object.keys(j).filter(k=>!Object.hasOwn(out.fields,k)).length;}}catch{out.validJson=false;}return out;}
function transport(meta){return {...select(meta,['build','requestId','phase','errorType','finishReason','model'],token),...select(meta,['elapsedMs','upstreamStatus','responseCharacters','reasoningCharacters','maxTokens'],number),thinking:['disabled','enabled'].includes(meta?.thinking)?meta.thinking:undefined,jsonMode:meta?.jsonMode===true,usage:usage(meta?.usage)};}
function load(){if(loaded)return memory;loaded=true;try{const rows=JSON.parse(root.localStorage?.getItem(KEY)||'[]');if(Array.isArray(rows))memory=rows.slice(-LIMIT);}catch{}return memory;}
function record(event={},config={}){const secret=String(config.apiKey||'');const scrub=v=>secret&&v?String(v).split(secret).join('[redacted]'):v;const item={id:'d'+Date.now().toString(36)+'-'+(++sequence),at:new Date().toISOString(),build:BUILD,...select(event,['stage','outcome','errorCode','transport','alias','taskId'],token),...select(event,['attempt','elapsedMs','httpStatus','messageCount','imageCount','textCharacters','candidateCount','examCount','targetCount','mappingTagCount','maxTokens','requestBytes'],number)};
item.jsonMode=event.jsonMode===true;if(['enabled','disabled'].includes(event.thinking))item.thinking=event.thinking;
try{item.apiHost=new URL(config.baseUrl).hostname;}catch{}item.model=token(scrub(config.model));if(secret&&item.apiHost?.includes(secret))delete item.apiHost;
if(event.server)item.server=transport(event.server);if(event.responseShape)item.responseShape=event.responseShape;if(event.counts)item.counts=select(event.counts,['total','active','matched','originalGroup','noStem','noAnswer','unknownDifficulty','recentlyAssigned','eligible','pendingIncluded'],number);
// Only schema/count summaries created above are accepted; never arbitrary event or exception strings.
if(item.responseShape)item.responseShape=shapeSummary(item.responseShape);
const clean=value=>typeof value==='string'?scrub(value):Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)])):value;const safe=clean(item);
load();memory.push(safe);memory=memory.slice(-LIMIT);try{root.localStorage?.setItem(KEY,JSON.stringify(memory));}catch{}return safe.id;}
function shapeSummary(s){const out={characters:number(s.characters),validJson:s.validJson===true,object:s.object===true,unknownFields:number(s.unknownFields),fields:{}};for(const k of ['goal','summary','evidence','conceptIds','assessmentIds','hypotheses','uncertainty','reason','items','diagnosis','plan'])if(s.fields?.[k])out.fields[k]={type:['string','number','object','array','undefined','null','boolean'].includes(s.fields[k].type)?s.fields[k].type:'unknown',length:number(s.fields[k].length)};return out;}
function bundle(){return {schema:'score-ai-call-diagnostics',version:1,build:BUILD,exportedAt:new Date().toISOString(),notice:'只含调用元数据和结构统计；不含密钥、姓名、班级、成绩明细、题干、图片或模型回复正文。',records:load()};}
function download(){const blob=new Blob([JSON.stringify(bundle(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AI调用诊断_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return blob;}
root.AiPracticeDiagnostics={BUILD,record,shape,transport,usage,bundle,download};
if(typeof module!=='undefined')module.exports=root.AiPracticeDiagnostics;
})(typeof window!=='undefined'?window:globalThis);
