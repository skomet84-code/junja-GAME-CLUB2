'use strict';
const assert=require('node:assert/strict');
const E=require('../public/blackroom/engine.js'),cloudFactory=require('../blackroom-cloud');
const state=E.initial();state.started=true;state.door=true;state.archive=true;
for(const id of Object.keys(E.CLUES))assert.equal(E.collect(state,id).ok,true,id);
const data=[
 ['guest','clock','provisional',null],
 ['clock','mirror','verified','timeline'],
 ['guest','lock','verified','entry'],
 ['latch','footprint','verified','path'],
 ['footage','ledger','verified','disguise'],
 ['invitation','ledger','verified','suspect']
];
for(const [a,b,status,expect] of data){
 const r=E.connect(state,a,b);
 assert.equal(r.ok,true,a+'+'+b);
 if(status==='provisional'){assert.equal(r.provisional,true);assert.equal(state.links.length,0);}
 else{assert.equal(r.key,expect);assert.equal(state.links.includes(expect),true);}
}
assert.equal(state.links.length,5);
assert.equal(state.hypotheses.length,1);
assert.equal(E.proofFor(state,'timeline').includes('거울'),true);
assert.equal(E.connect(state,'cup','clock').ok,false);
assert.equal(E.connect(state,'lock','guest').already,true);
const saved=E.hydrate(JSON.parse(JSON.stringify(state)));
assert.deepEqual(saved.links,state.links);assert.deepEqual(saved.hypotheses,state.hypotheses);
assert.equal(saved.proofs.timeline,'clock|mirror');
const storage=new Map(),factory=cloudFactory({
 requireAuth:(req,res)=>req.user,readBody:async req=>req.body,
 json:(res,code,data)=>{res.code=code;res.data=data;},
 gameStateGet:(key,fallback)=>storage.get(key)??fallback,
 gameStateSet:(key,val)=>storage.set(key,val)});
const req=body=>({method:'PUT',user:{id:551,nickname:'tester'},body});
(async()=>{
 const ok={};await factory.handle(req({revision:0,state}),ok,{pathname:'/api/blackroom/state'});
 assert.equal(ok.code,200,'alternative evidence proofs and hypotheses must persist in cloud');
 const malicious=E.hydrate(state);malicious.hypotheses.push('clock|footage');
 const stored=E.hydrate(JSON.parse(JSON.stringify(malicious)));
 assert.equal(stored.hypotheses.includes('clock|footage'),true,'recognized preliminary theory');
 const corrupted=JSON.parse(JSON.stringify(state));
 corrupted.links=['entry'];corrupted.clues=['clock','sync'];corrupted.proofs={entry:'guest|lock'};
 const res={};await factory.handle(req({revision:1,state:corrupted}),res,{pathname:'/api/blackroom/state'});
 assert.equal(res.code,400,'cloud must reject conclusion without supporting evidence');
 assert.equal(storage.size,1,'other save records untouched');
 console.log('BLACKROOM_COMBINE_OK — verified alternate links, hypotheses, order independence, secure cloud saves');
})().catch(e=>{console.error(e);process.exitCode=1});