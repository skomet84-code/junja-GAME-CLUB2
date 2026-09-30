'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
(async()=>{
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
  const port=socket.address().port;await new Promise(r=>socket.close(r));
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'holdem-http-'));
  const child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,ADMIN_USERNAME:'',ADMIN_PASSWORD:'',PORT:String(port),HOST:'127.0.0.1',DATA_DIR:data,DATABASE_URL:'',RESTORE_DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const base=`http://127.0.0.1:${port}`;
  try{
    for(let n=0;n<100;n++){try{await fetch(base);break;}catch{await new Promise(r=>setTimeout(r,50));}}
    const users=[];
    for(let n=0;n<3;n++){
      const response=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'qatest'+n,nickname:'테스트'+n,password:'local-test-only'})});
      assert.equal(response.status,201,await response.clone().text());
      const body=await response.json();users.push({id:body.user.id,cookie:response.headers.get('set-cookie').split(';')[0]});
    }
    async function api(who,url,body){const response=await fetch(base+url,{method:body?'POST':'GET',headers:{cookie:users[who].cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;}
    assert.equal((await api(0,'/api/my-room')).room,null);
    const raid=(await api(0,'/api/treasure-raid/rooms',{entry:1000000,maxPlayers:2})).room;
    const mine=(await api(0,'/api/my-room')).room;
    assert.equal(mine.id,raid.id);assert.equal(mine.game,'treasure');
    assert.equal((await api(1,'/api/my-room')).room,null,'room lookup is scoped to the authenticated user');
    const blocked=await fetch(base+'/api/rooms',{method:'POST',headers:{cookie:users[0].cookie,'Content-Type':'application/json'},body:JSON.stringify({game:'holdem'})});
    assert.equal(blocked.status,409,'an active funded seat must still block a second game');
    await api(0,`/api/treasure-raid/rooms/${raid.id}/leave`,{});
    assert.equal((await api(0,'/api/me')).user.balance,1000000,'waiting entry refunded exactly once');
    assert.equal((await api(0,'/api/my-room')).room,null);
    const poker=(await api(0,'/api/rooms',{game:'holdem',maxPlayers:2})).room;
    assert.equal((await api(0,'/api/my-room')).room.id,poker.id);
    await api(0,`/api/rooms/${poker.id}/leave`,{});
    assert.equal((await api(0,'/api/me')).user.balance,1000000);
    const baccarat=(await api(0,'/api/baccarat/rooms',{})).room;
    assert.equal((await api(0,'/api/my-room')).room.game,'baccarat');
    await api(0,`/api/baccarat/rooms/${baccarat.id}/leave`,{});
    assert.equal((await api(0,'/api/my-room')).room,null);
    console.log('ROOM_MEMBERSHIP_HTTP_TESTS_OK');
  }catch(e){console.error(logs);throw e;}
  finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
