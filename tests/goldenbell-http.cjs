'use strict';
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
(async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'goldenbell-http-')),child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,DATABASE_URL:'',RESTORE_DATABASE_URL:'',ADMIN_USERNAME:'',ADMIN_PASSWORD:''},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);const base='http://127.0.0.1:'+port,users=[];
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/healthz');break;}catch{await new Promise(r=>setTimeout(r,50));}}
  const html=await (await fetch(base)).text();assert.ok(html.includes('view-goldenbell')&&html.includes('/goldenbell/game.js'));
  for(const file of ['/goldenbell/game.js','/goldenbell/style.css'])assert.equal((await fetch(base+file)).status,200);
  assert.equal((await fetch(base+'/api/goldenbell')).status,401);
  for(let i=0;i<2;i++){const res=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'belltest'+i,nickname:'벨테스트'+i,password:'local-only-test'})});assert.equal(res.status,201,await res.clone().text());users.push(res.headers.get('set-cookie').split(';')[0]);}
  async function request(id,url,body){const res=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{cookie:users[id],'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};}
  async function api(id,url,body){const r=await request(id,url,body);assert.ok(r.status<300,JSON.stringify(r));return r.body;}
  let r=(await api(0,'/api/goldenbell/create',{mode:'score',entry:1000})).room;
  assert.equal((await api(0,'/api/my-room')).room.game,'goldenbell');
  assert.equal((await request(0,'/api/rooms',{game:'holdem'})).status,409);
  assert.equal((await request(0,'/api/sichuan/battle/create',{})).status,409);
  assert.equal((await request(0,'/api/treasure-raid/rooms',{entry:1000000,maxPlayers:2})).status,409);
  await api(1,'/api/goldenbell/'+r.id+'/join',{});for(const id of [0,1])await api(id,'/api/goldenbell/'+r.id+'/ready',{ready:true});
  r=(await api(0,'/api/goldenbell/'+r.id+'/start',{})).room;
  assert.equal((await api(0,'/api/me')).user.balance,999000);
  assert.equal(r.question.answer,undefined);assert.equal(r.result,null);
  await api(0,'/api/goldenbell/'+r.id+'/answer',{token:r.question.token,choice:0});
  const other=(await api(1,'/api/goldenbell/'+r.id)).room;assert.equal(other.myAnswer,null);assert.equal(other.result,null);assert.equal(other.players[0].choice,undefined);
  r=(await api(1,'/api/goldenbell/'+r.id+'/answer',{token:r.question.token,choice:0})).room;assert.equal(r.phase,'reveal');assert.equal(typeof r.result.answer,'number');
  await api(0,'/api/goldenbell/'+r.id+'/leave',{});await api(1,'/api/goldenbell/'+r.id+'/leave',{});
  for(const id of [0,1]){assert.equal((await api(id,'/api/me')).user.balance,1000000);assert.equal((await api(id,'/api/my-room')).room,null);}
  console.log('GOLDENBELL_HTTP_OK: production boot, assets, auth, cross-game membership, exact debit, private answers, reveal, all-left refund');
 }catch(e){console.error(logs);throw e;}finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
