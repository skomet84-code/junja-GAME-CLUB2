'use strict';
const assert=require('node:assert/strict');
const E=require('../public/blackroom/engine.js');
const factory=require('../blackroom-cloud.js');
const saved=new Map(),writes=[];
const handler=factory({
 requireAuth:(req,res)=>req.user||((res.code=401),null),
 readBody:async req=>req.body,
 json:(res,status,data)=>{res.code=status;res.data=data;},
 gameStateGet:(key,fallback)=>saved.has(key)?saved.get(key):fallback,
 gameStateSet:(key,val)=>{writes.push(key);saved.set(key,JSON.parse(JSON.stringify(val)));return val;}
});
const send=async(method,user,revision,state)=>{
 const res={code:0,data:null};
 await handler.handle({method,user,body:{revision,state}},res,{pathname:'/api/blackroom/state'});
 return res;
};
(async()=>{
 const ua={id:17,nickname:'A'},ub={id:29,nickname:'B'};
 const first=await send('GET',ua);assert.equal(first.code,200);assert.equal(first.data.revision,0);
 const s=E.initial();s.started=true;assert.equal(E.collect(s,'guest').ok,true);
 let r=await send('PUT',ua,0,s);assert.equal(r.code,200);assert.equal(r.data.revision,1);
 assert.equal(writes[0],'blackroom:ep01:user:17');
 let b=await send('GET',ub);assert.equal(b.data.state,null,'one player cannot see another player data');
 let stale=await send('PUT',ua,0,s);assert.equal(stale.code,409,'overwrites from stale devices must fail');
 const malicious=E.initial();malicious.links.push('timeline');
 let invalid=await send('PUT',ua,1,malicious);assert.equal(invalid.code,400,'must reject unsupported evidence connections');
 const badClue=E.initial();badClue.clues=['footage'];badClue.archive=true;badClue.door=false;
 assert.equal((await send('PUT',ua,1,badClue)).code,400);
 const s2=E.initial();s2.started=true;s2.door=true;
 assert.equal(E.collect(s2,'guest').ok,true);
 assert.equal(E.collect(s2,'invitation').ok,true);
 const good=await send('PUT',ua,1,s2);
 assert.equal(good.code,200);assert.equal(good.data.revision,2);
 assert.equal((await send('DELETE',ua,1)).code,409,'reset must be revision checked');
 assert.equal((await send('DELETE',ua,2)).code,200);
 const after=await send('GET',ua);assert.equal(after.data.revision,3);assert.equal(after.data.state.started,false);
 const noAuth=await send('GET',null);assert.equal(noAuth.code,401);
 assert.equal(saved.size,1,'other accounts and other game records untouched');
 console.log('BLACKROOM_CLOUD_OK — isolation, auth, schema checks, stale revisions, revision-checked reset');
})().catch(e=>{console.error(e);process.exitCode=1});