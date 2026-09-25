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
  const child=spawn(process.execPath,['admin-unlimited-start.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:data,DATABASE_URL:'',RESTORE_DATABASE_URL:''},stdio:['ignore','pipe','pipe']});
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
    let room=(await api(0,'/api/rooms',{game:'holdem',maxPlayers:3})).room;
    const url='/api/rooms/'+room.id;
    await api(1,url+'/join',{});await api(0,url+'/ready',{});await api(1,url+'/ready',{});
    room=(await api(0,url+'/start',{})).room;
    const pot=room.hand.pot;
    room=(await api(2,url+'/join',{})).room;
    assert.equal(room.hand.pot,pot);assert.equal(room.hand.players[users[2].id],undefined);
    assert.equal(room.players.find(p=>p.userId===users[2].id).joinNextHand,true);
    assert.equal((await api(2,url+'/leave',{})).queued,false);
    assert.equal((await api(2,'/api/me')).user.balance,1000000);
    await api(2,url+'/join',{});
    assert.equal((await api(0,url+'/leave',{})).queued,true);
    const actor=users.findIndex(u=>u.id===room.hand.turnUserId);
    room=(await api(actor,url+'/poker/action',{action:'fold'})).room;
    assert.equal(room.hand.phase,'complete');assert.ok(room.hand.result.payouts.length===2);
    assert.equal((await api(0,url)).left,true);
    assert.equal((await api(2,url+'/leave',{})).queued,false);
    await api(1,url+'/leave',{});
    let sum=0;for(let n=0;n<3;n++)sum+=(await api(n,'/api/me')).user.balance;
    assert.equal(sum,3000000,'all chips conserved through queue, fold and cashout');
    const html=await (await fetch(base)).text();
    assert.ok(html.indexOf('/money-format.js')<html.indexOf('/app.js'));
    assert.equal((await fetch(base+'/money-format.js')).status,200);
    let solo=(await api(0,'/api/solo/holdem/start',{})).room;
    const total=solo.players.reduce((n,p)=>n+p.stack,0)+solo.hand.pot;
    for(let hand=0;hand<8;hand++){
      let guard=0;
      while(solo.hand.phase!=='complete'&&guard++<15){
        assert.equal(solo.hand.turnUserId,users[0].id);
        const legal=solo.hand.legal;
        const action=legal.maxRaiseTo>solo.hand.currentBet?'raise':legal.toCall?'call':'check';
        solo=(await api(0,'/api/solo/holdem/action',{action,raiseTo:legal.maxRaiseTo})).room;
      }
      assert.equal(solo.hand.phase,'complete');
      assert.equal(solo.players.reduce((n,p)=>n+p.stack,0),total,'AI round preserves chips');
      if(solo.players.some(p=>p.stack<=0))break;
      solo=(await api(0,'/api/solo/holdem/next',{})).room;
    }
    await api(0,'/api/solo/holdem/leave',{});
    let seven=(await api(1,'/api/solo/seven/start',{})).game;
    const sevenTotal=seven.stack.user+seven.stack.bot+(seven.complete?0:seven.pot);
    let steps=0;while(!seven.complete&&steps++<15){
      assert.equal(seven.turn,'user');
      const action=seven.legal.canRaise?'raise':seven.legal.toCall?'call':'check';
      seven=(await api(1,'/api/solo/seven/action',{action,raiseTo:seven.legal.maxRaiseTo})).game;
    }
    assert.ok(seven.complete);assert.equal(seven.stack.user+seven.stack.bot,sevenTotal);
    const cashout=await api(1,'/api/solo/seven/leave',{});assert.equal(cashout.user.balance,seven.stack.user);
    const {DatabaseSync}=require('node:sqlite');
    const localDB=new DatabaseSync(path.join(data,'club.db'));
    localDB.prepare('UPDATE users SET balance=? WHERE id=?').run(30000000000000,users[2].id);localDB.close();
    const ids=['frame_ultimate_solar','frame_ultimate_void','frame_ultimate_seraph'];
    for(let i=0;i<ids.length;i++){
      const bought=await api(2,'/api/shop/buy',{itemId:ids[i]});
      assert.equal(bought.user.balance,(2-i)*10000000000000);
      assert.equal(bought.user.cosmetics.frame.id,ids[i]);
    }
    const shop=await api(2,'/api/shop');
    assert.equal(shop.items.filter(x=>x.collection==='ultimate'&&x.owned).length,3);
    const duplicate=await fetch(base+'/api/shop/buy',{method:'POST',headers:{cookie:users[2].cookie,'Content-Type':'application/json'},body:JSON.stringify({itemId:ids[0]})});
    assert.equal(duplicate.status,400);assert.equal((await api(2,'/api/me')).user.balance,0);
    const verifyDB=new DatabaseSync(path.join(data,'club.db'));
    assert.equal(verifyDB.prepare('SELECT frame FROM user_loadout WHERE user_id=?').get(users[2].id).frame,ids[2]);
    assert.equal(verifyDB.prepare('SELECT count(*) n FROM user_inventory WHERE user_id=?').get(users[2].id).n,3);verifyDB.close();
    console.log('HOLDEM_SEVEN_ULTIMATE_HTTP_RUNTIME_TESTS_OK');
  }catch(e){console.error(logs);throw e;}
  finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
