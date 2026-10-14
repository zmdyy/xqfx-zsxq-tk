/* Shared background job and storage status. No main-thread ZIP fallback. */
(function(root){
'use strict';
const workerURL=new URL('bank-backup-worker.js?v=20261014backup3',document.currentScript.src).href;
let api,job=null,url=null,statusWorker=null;
function run(action,onProgress,extra){
 if(!root.Worker)throw Error('当前浏览器不支持后台备份，请使用新版浏览器。');
 const worker=new Worker(workerURL);let rejectJob;
 const promise=new Promise((resolve,reject)=>{rejectJob=reject;worker.onmessage=({data:m})=>{if(m.type==='progress')onProgress?.(m);else{worker.terminate();if(m.type==='error')reject(Error(m.message));else resolve(m.result)}};worker.onerror=e=>{e.preventDefault();worker.terminate();reject(Error('后台模块加载或运行失败，请刷新后重试。'))};worker.postMessage({action,dbName:api.dbName,extra})});
 return {promise,cancel:()=>{worker.terminate();rejectJob(new DOMException('备份已取消','AbortError'))}};
}
function init(options){api=options}
async function backup({onProgress,extra,fileName}={}){
 if(job)throw Error('已有完整备份正在生成，请查看进度或先取消。');
 onProgress?.({stage:'starting'});const active=run('backup',onProgress,extra);job=active;
 try{
  const result=await active.promise;active.finalizing=true;onProgress?.({stage:'finishing'});
  let warning='';try{await api.setSetting('bankLastBackupV1',result.record)}catch(e){warning='备份文件已生成，但生成记录未保存：'+e.message}
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(result.blob);
  const name=fileName||'私人题库完整备份_'+new Date().toISOString().slice(0,10)+'.zip';
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  return {...result,url,fileName:name,warning};
 }finally{if(job===active)job=null}
}
function cancel(){if(job&&!job.finalizing)job.cancel()}
async function status(){
 if(statusWorker){statusWorker.cancel();statusWorker=null}
 const active=run('status');statusWorker=active;
 try{return await active.promise}finally{if(statusWorker===active)statusWorker=null}
}
root.addEventListener('pagehide',()=>{job?.cancel();statusWorker?.cancel();if(url)URL.revokeObjectURL(url)});
root.PhysicsBankBackup={init,backup,cancel,status,get busy(){return !!job}};
})(window);
