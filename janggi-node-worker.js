'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {choose}=require('./public/janggi/ai-worker.js');
try{const move=choose(workerData.board,workerData.side,'hard',{timeMs:workerData.timeMs});parentPort.postMessage({move});}
catch(e){parentPort.postMessage({error:String(e.message||e)});}
