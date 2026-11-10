'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto');
const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,nickname TEXT);INSERT INTO users VALUES(1,'first','첫회원'),(2,'second','둘째')`);
let writes=0;const api=require('../tarot-server')({db,crypto,requireAuth:()=>null,requireAdmin:(req,res)=>{if(req.role==='admin')return {id:9};res.status=req.role?403:401;return null;},json:(res,status,body)=>Object.assign(res,{status,body}),flush:()=>{writes++}});
const original={category:'love',title:'연애운',createdAt:100,cards:[{name:'태양',reversed:true}],interpretation:{advice:'원본 해석 <script>'}};
for(let n=1;n<=25;n++){db.prepare('INSERT INTO game_state VALUES(?,?,?)').run('tarot:permanent:v1:'+n+':love',JSON.stringify({...original,createdAt:n}),n);}
db.prepare('INSERT INTO game_state VALUES(?,?,?)').run('tarot:permanent:v1:2:money',JSON.stringify({...original,category:'money'}),100);
db.prepare('INSERT INTO game_state VALUES(?,?,?)').run('tarot:permanent:v1:1:health','broken',100);
async function call(role,path='/api/admin/tarot',method='GET'){const res={setHeader(k,v){this[k]=v}};assert.equal(await api.handle({role,method},res,new URL(path,'http://local')),true);return res;}
(async()=>{assert.equal((await call(null)).status,401);assert.equal((await call('member')).status,403);assert.equal((await call('admin',undefined,'POST')).status,405);
let r=await call('admin');assert.equal(r.body.pagination.total,26);assert.equal(r.body.rows.length,20);assert.equal(r['Cache-Control'],'no-store');assert.equal(r.body.rows[0].reading.createdAt,100);
r=await call('admin','/api/admin/tarot?page=2');assert.equal(r.body.rows.length,6);
r=await call('admin','/api/admin/tarot?q=둘째&category=love');assert.equal(r.body.pagination.total,1);assert.equal(r.body.rows[0].user.username,'second');assert.deepEqual(r.body.rows[0].reading.interpretation,original.interpretation);
assert.equal((await call('admin','/api/admin/tarot?category=invalid')).status,400);
assert.equal((await call('admin','/api/admin/tarot?q=nobody')).body.pagination.total,0);assert.equal(writes,0);assert.equal(db.prepare('SELECT count(*) AS n FROM game_state').get().n,27);console.log('TAROT ADMIN PASS: admin-only, original interpretation, filters, pagination, corrupt rows, no writes');db.close();})().catch(e=>{console.error(e);process.exitCode=1});
