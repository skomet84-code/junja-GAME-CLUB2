'use strict';
// V10 decision aid ONLY. Never enables checkout, PG integration or payments.
// A successful engineering test is NOT legal clearance, card-network approval
// or a merchant refund operation.
const fs=require('node:fs');
const path=require('node:path');
const DEFAULT_FILE=path.join(__dirname,'docs','COMMERCE_GO_LIVE_GATE.json');
const REQUIRED_IDS=Object.freeze([
 'game-legal','business-registration','pg-contract','merchant-terms',
 'isolated-payments','live-provider','game-wallet','paid-use',
 'disaster-recovery','support-operations','mobile-qa','security-qa'
]);
function report({file=DEFAULT_FILE,now=Date.now}={}){
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!Array.isArray(data.required)||data.required.length!==REQUIRED_IDS.length)
  throw Error('Commercial gate checklist is incomplete.');
 const ids=new Set();
 const checks=data.required.map(item=>{
  if(!item||typeof item.id!=='string'||!REQUIRED_IDS.includes(item.id)||ids.has(item.id)||
    !['blocked','prototype-tested','verified'].includes(item.status)||!item.label||!item.owner)
   throw Error('Commercial gate contains invalid or duplicate status.');
  ids.add(item.id);
  if(item.status==='verified'&&typeof item.evidence!=='string')
   throw Error('Verified commercial requirement lacks evidence.');
  return {id:item.id,label:item.label,owner:item.owner,status:item.status,
   evidence:typeof item.evidence==='string'?item.evidence:null};
 });
 const statusCounts={blocked:checks.filter(x=>x.status==='blocked').length,
  prototypeTested:checks.filter(x=>x.status==='prototype-tested').length,
  verified:checks.filter(x=>x.status==='verified').length};
 const technicalChecklistComplete=checks.every(x=>x.status==='verified');
 const liveRequested=data.goLive===true;
 // This build explicitly has no real-money checkout integration. Do not infer
 // that changing a JSON checklist could activate real payment acceptance.
 return {
  ok:true,kind:'PRE_COMMERCIAL_OWNER_REVIEW',checkedAt:now(),
  title:data.title,paymentModel:data.paymentModel,
  livePaymentsEnabled:false,
  productionCheckoutAvailable:false,
  goLive:false,checkoutBlocked:true,
  decision:'NOT_APPROVED_FOR_REAL_MONEY',
  readiness:technicalChecklistComplete?'VERIFICATION_STILL_REQUIRED':'BLOCKED',
  manifestRequestsLive:liveRequested,
  warning:liveRequested?'검증되지 않은 출시 플래그가 발견됐습니다. 결제 시스템은 계속 비활성화됩니다.':'실제 결제는 승인 및 별도 배포 전까지 비활성 상태입니다.',
  totals:{required:checks.length,...statusCounts},
  outstanding:checks.filter(x=>x.status!=='verified').map(x=>({id:x.id,label:x.label,status:x.status,owner:x.owner})),
  requirements:checks
 };
}
module.exports={report,REQUIRED_IDS};
