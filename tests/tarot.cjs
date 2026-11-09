'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const createTarot=require('../tarot-server');
async function run(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE game_state (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL)');
 let saves=0;
 const oracle=createTarot({db,crypto,now:()=>1794210000000,flush:async()=>{saves++},
  readBody:async req=>req.body,
  requireAuth:(req,res)=>req.user?{id:req.user}: (Object.assign(res,{status:401,body:{error:'login'}}),null),
  rateLimit:()=>true,
  json:(res,status,body)=>Object.assign(res,{status,body})
 });
 assert.equal(oracle.DECK.length,78,'actual 78 card deck');
 assert.equal(Object.keys(oracle.THEMES).length,6,'six independent categories');
 async function api(user,method,path,body){
   const req={user,method,body};
   const res={};
   const handled=await oracle.handle(req,res,new URL(path,'http://test.local'));
   assert.equal(handled,true);return res;
 }
 let r=await api(null,'GET','/api/tarot/status');
 assert.equal(r.status,401,'unauthenticated access blocked');
 r=await api(1,'GET','/api/tarot/status');assert.equal(r.status,200);
 assert.equal(r.body.categories.every(c=>c.reading===null),true);
 r=await api(1,'POST','/api/tarot/draw',{category:'love',picks:[0,0,1]});
 assert.equal(r.status,400,'duplicate positions rejected');
 r=await api(1,'POST','/api/tarot/draw',{category:'love',picks:[0,1,12]});
 assert.equal(r.status,400,'out-of-range position rejected');
 r=await api(1,'POST','/api/tarot/draw',{category:'hidden',picks:[1,2,3]});
 assert.equal(r.status,400,'unknown categories rejected');
 r=await api(1,'POST','/api/tarot/draw',{category:'love',picks:[1,5,11]});
 assert.equal(r.status,201,JSON.stringify(r));
 assert.equal(r.body.reading.cards.length,3);
 assert.equal(new Set(r.body.reading.cards.map(x=>x.id)).size,3);
 assert.equal(r.body.reading.interpretation.details.length,3);
 assert.ok(r.body.reading.interpretation.connection.length>80);
 assert.equal(saves,1);
 const first=JSON.stringify(r.body.reading);
 r=await api(1,'POST','/api/tarot/draw',{category:'love',picks:[2,6,8]});
 assert.equal(r.status,409,'cannot redraw same category');
 assert.equal(JSON.stringify(r.body.reading),first,'replay returns the original saved reading');
 assert.equal(saves,1,'replay creates no new snapshot writes');
 r=await api(1,'GET','/api/tarot/status');
 assert.equal(r.body.categories.find(x=>x.category==='love').reading.createdAt,1794210000000);
 assert.equal(r.body.categories.find(x=>x.category==='money').reading,null);
 r=await api(1,'POST','/api/tarot/draw',{category:'money',picks:[0,4,9]});
 assert.equal(r.status,201,'different category is independently available');
 r=await api(2,'POST','/api/tarot/draw',{category:'love',picks:[0,4,9]});
 assert.equal(r.status,201,'other member can draw the same category');
 assert.equal(saves,3);
 const rows=db.prepare("SELECT key FROM game_state WHERE key LIKE 'tarot:permanent:%'").all();
 assert.equal(rows.length,3,'unique snapshot-backed per-account and category keys');
 db.close();
 console.log('TAROT PASS: deck 78, auth, validation, irreversible per-category, independent users, archive and snapshot');
}
run().catch(e=>{console.error(e);process.exitCode=1});
