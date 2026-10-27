'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {selectMove}=require('./omok-ai');
try{parentPort.postMessage({move:selectMove(workerData.board,workerData.color,{timeMs:workerData.timeMs})});}
catch(error){parentPort.postMessage({error:String(error?.message||error)});}
