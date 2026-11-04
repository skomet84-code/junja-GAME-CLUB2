'use strict';
// The existence of a payment prototype must never be interpreted as permission to process money.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const gates=JSON.parse(fs.readFileSync(path.join(root,'docs/COMMERCE_GO_LIVE_GATE.json'),'utf8'));
const files=['server.js','premium-pg-core.js','premium-purchase-core.js','premium-toss-readonly.js','public/premium-preview.html'];
const contents=Object.fromEntries(files.map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));
const required=['game-legal','business-registration','pg-contract','merchant-terms','isolated-payments','live-provider','game-wallet','paid-use','disaster-recovery','support-operations','mobile-qa','security-qa'];
assert.equal(gates.goLive,false,'This branch must never enable real money.');
assert(gates.paymentModel.includes('NO casino money charging'),'Casino game-money purchases are not part of the approved model.');
assert(gates.paymentModel.includes('NO pre-paid J-CASH'),'Prepaid cash requires separate acceptance and review.');
assert.equal(gates.required.length,required.length);
assert.deepEqual(gates.required.map(x=>x.id).sort(),required.sort(),'All launch gates must be represented.');
const permitted=new Set(['blocked','prototype-tested','completed']);
assert(gates.required.every(x=>permitted.has(x.status)&&x.owner));
const blocked=gates.required.filter(x=>x.status!=='completed');
assert(blocked.length>0,'This branch cannot be certified production ready without approvals.');
for(const gate of gates.required){
 if(gate.status==='completed')assert(gate.evidence&&gate.evidence.length>12,'Completed gates need evidence');
}
assert(!contents['server.js'].includes("require('./premium-pg-core')"),'Live service must not mount the payment store.');
assert(!contents['server.js'].includes("require('./premium-toss-readonly')"),'Live service must not mount the payment adapter.');
assert(!contents['server.js'].includes("require('./premium-appearance-store')"),'Live service must not mount premium selections.');
assert(contents['premium-pg-core.js'].includes('enabled=false'),'PostgreSQL code must default OFF.');
assert(contents['premium-purchase-core.js'].includes('enabled=false'),'SQLite demo code must default OFF.');
assert(contents['premium-toss-readonly.js'].includes('enabled=false'),'Toss read-only adapter must default OFF.');
assert(!/<form\b|<script\b/i.test(contents['public/premium-preview.html']),'Preview cannot collect or submit payment data.');
assert(!/(window\.TossPayments|\/api\/payment\/confirm|\/api\/premium\/buy)/.test(contents['public/premium-preview.html']),'No checkout in showroom preview.');
assert(contents['public/premium-preview.html'].includes('판매 준비 중'),'All paid actions must remain disabled.');
console.log('COMMERCE_LAUNCH_BLOCKED_AS_INTENDED: '+blocked.length+'/'+gates.required.length+' launch gates still unapproved, product demo has no real payments');
