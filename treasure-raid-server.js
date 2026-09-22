'use strict';

module.exports=function createTreasureRaid(deps){
  const {crypto,now,readBody,requireAuth,json,walletChange,userPublic,escrowSet,escrowDelete,pushRefresh,formatMoney,rateLimit,isUserBusy}=deps;
  const rooms=new Map();
  const MAX_ROUNDS=5,MIN_ENTRY=1000000,MAX_ENTRY=100000000,ENTRY_STEP=1000000,MAX_MULT=100,CHOICE_MS=30000;
  const OUTCOMES={
    trap:{key:'trap',label:'☠ 함정',mult:0},half:{key:'half',label:'🪙 절반',mult:.5},base:{key:'base',label:'◎ 기본',mult:1},
    x2:{key:'x2',label:'💰 행운',mult:2},x5:{key:'x5',label:'🧰 대박',mult:5},x10:{key:'x10',label:'✨ 초대박',mult:10},jackpot:{key:'jackpot',label:'💎 JACKPOT',mult:100}
  };
  const TABLES={
    1:[['trap',8],['half',20],['base',38],['x2',26],['x5',8]],
    2:[['trap',12],['half',20],['base',30],['x2',26],['x5',10],['x10',2]],
    3:[['trap',18],['half',18],['base',25],['x2',25],['x5',10],['x10',4]],
    4:[['trap',23],['half',17],['base',20],['x2',24],['x5',10],['x10',5],['jackpot',1]],
    5:[['trap',28],['half',14],['base',16],['x2',22],['x5',11],['x10',7],['jackpot',2]]
  };

  function makeId(){let id;do{id=crypto.randomBytes(2).toString('hex').toUpperCase()}while(rooms.has(id));return id}
  function normalizeEntry(v){
    const n=Math.floor(Number(v));
    if(!Number.isSafeInteger(n)||n<MIN_ENTRY||n>MAX_ENTRY||n%ENTRY_STEP!==0)throw new Error('배팅금액은 100만G~1억G, 100만G 단위로 설정해줘.');
    return n;
  }
  function roomPlayer(r,uid){return r.players.find(p=>Number(p.userId)===Number(uid))||null}
  function hasUser(uid){uid=Number(uid);for(const r of rooms.values())if(roomPlayer(r,uid))return true;return false}
  function findUserRoom(uid){uid=Number(uid);for(const r of rooms.values())if(roomPlayer(r,uid))return r;return null}
  function touch(r){r.updatedAt=now();r.version=(r.version||0)+1}
  function safeProfile(uid){try{const u=userPublic(uid);return u?{cosmetics:u.cosmetics,rank:u.rank}:{} }catch{return {}}}
  function playerPublic(p){return {userId:p.userId,nickname:p.nickname,avatar:p.avatar,ready:!!p.ready,status:p.status,round:p.round,bank:p.bank,entry:p.entry,lastChest:p.lastChest,lastOutcome:p.lastOutcome,payout:p.payout||0,deadlineAt:p.deadlineAt||0,lastActionAt:p.lastActionAt||0,...safeProfile(p.userId)}}
  function roomPublic(r,selfId){return {id:r.id,name:r.name,hostEntry:r.hostEntry,maxPlayers:r.maxPlayers,hostId:r.hostId,phase:r.phase,maxRounds:MAX_ROUNDS,choiceMs:CHOICE_MS,entryMode:'individual',createdAt:r.createdAt,updatedAt:r.updatedAt,version:r.version,selfId:Number(selfId),players:r.players.map(playerPublic)}}
  function summary(r){return {id:r.id,name:r.name,hostEntry:r.hostEntry,maxPlayers:r.maxPlayers,players:r.players.length,phase:r.phase,entryMode:'individual',updatedAt:r.updatedAt}}
  function allFinished(r){return r.players.length>0&&r.players.every(p=>['escaped','eliminated','complete'].includes(p.status))}
  function maybeComplete(r){if(r.phase==='playing'&&allFinished(r)){r.phase='complete';touch(r)}}
  function drawOutcome(round){const rows=TABLES[Math.max(1,Math.min(MAX_ROUNDS,Number(round)||1))],total=rows.reduce((a,x)=>a+x[1],0);let roll=crypto.randomInt(total);for(const [key,w] of rows){if(roll<w)return {...OUTCOMES[key]};roll-=w}return {...OUTCOMES.base}}
  function armDeadline(p){p.lastActionAt=now();p.deadlineAt=p.lastActionAt+CHOICE_MS}
  function clearDeadline(p){p.deadlineAt=0;p.lastActionAt=now()}
  function settlePlayer(r,p,reason='탈출 정산'){
    if(['escaped','complete'].includes(p.status)&&p.payout>0)return p.payout;
    const payout=Math.max(0,Math.min(Number(p.entry||0)*MAX_MULT,Math.floor(Number(p.bank||0))));
    escrowDelete(r.id,p.userId);
    if(payout>0)walletChange(p.userId,payout,'treasure_raid_cashout',`${r.name} · ${reason} · ${formatMoney(payout)}G`);
    p.payout=payout;p.status=p.round>=MAX_ROUNDS?'complete':'escaped';p.ready=false;clearDeadline(p);touch(r);maybeComplete(r);pushRefresh();return payout;
  }
  function refundWaiting(r,p,reason='대기방 퇴장 환급'){
    const amount=Math.max(0,Number(p.entry||0));escrowDelete(r.id,p.userId);if(amount>0)walletChange(p.userId,amount,'treasure_raid_refund',`${r.name} · ${reason}`);clearDeadline(p);return amount
  }
  function removePlayer(r,p){
    r.players=r.players.filter(x=>Number(x.userId)!==Number(p.userId));
    if(!r.players.length){rooms.delete(r.id);return}
    if(Number(r.hostId)===Number(p.userId))r.hostId=r.players[0].userId;
    if(r.phase==='playing')maybeComplete(r);
    touch(r);
  }
  function createPlayer(u,entry){return {userId:u.id,nickname:u.nickname,avatar:u.avatar,entry,ready:false,status:'waiting',round:0,bank:entry,lastChest:null,lastOutcome:null,payout:0,joinedAt:now(),lastActionAt:now(),deadlineAt:0}}
  function sweepAllRooms(){
    const t=now();
    for(const r of rooms.values()){
      if(r.phase!=='playing')continue;
      for(const p of r.players){
        if(!['choosing','decision'].includes(p.status)||!p.deadlineAt||t<p.deadlineAt)continue;
        settlePlayer(r,p,'30초 시간초과 자동 탈출');
      }
    }
  }
  const timeoutTimer=setInterval(()=>{try{sweepAllRooms()}catch(e){console.error('[TREASURE RAID TIMEOUT]',e)}},1000);
  timeoutTimer.unref?.();

  async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/treasure-raid'))return false;
    sweepAllRooms();
    const u=requireAuth(req,res);if(!u)return true;
    if(!rateLimit('treasure:'+u.id,90,60000)){json(res,429,{error:'보물 레이드 요청이 너무 빠릅니다. 잠시 후 다시 시도해줘.'});return true}

    if(url.pathname==='/api/treasure-raid/rooms'&&req.method==='GET'){
      const mine=findUserRoom(u.id);json(res,200,{rooms:[...rooms.values()].map(summary).sort((a,b)=>b.updatedAt-a.updatedAt),mine:mine?roomPublic(mine,u.id):null,user:userPublic(u.id)});return true;
    }

    if(url.pathname==='/api/treasure-raid/rooms'&&req.method==='POST'){
      if(hasUser(u.id)||isUserBusy?.(u.id)){json(res,409,{error:'이미 다른 게임방에 참가 중이야. 먼저 그 방에서 나와줘.'});return true}
      let b;try{b=await readBody(req)}catch(e){json(res,400,{error:e.message});return true}
      if(hasUser(u.id)||isUserBusy?.(u.id)){json(res,409,{error:'이미 다른 게임방에 참가 중이야. 먼저 그 방에서 나와줘.'});return true}
      let entry;try{entry=normalizeEntry(b.entry)}catch(e){json(res,400,{error:e.message});return true}
      const maxPlayers=Math.max(1,Math.min(6,Math.floor(Number(b.maxPlayers)||4)));
      if(Number(u.balance)<entry){json(res,400,{error:'게임머니가 부족해.'});return true}
      const id=makeId(),name=`보물 원정대 ${id}`,t=now();
      try{
        walletChange(u.id,-entry,'treasure_raid_entry',`${name} 개인 배팅금 ${formatMoney(entry)}G`);
        const p=createPlayer(u,entry),r={id,name,hostEntry:entry,maxPlayers,hostId:u.id,phase:'waiting',players:[p],createdAt:t,updatedAt:t,version:1};
        rooms.set(id,r);escrowSet(id,u.id,entry,'treasure_raid');pushRefresh();
        json(res,201,{room:roomPublic(r,u.id),user:userPublic(u.id)});
      }catch(e){json(res,400,{error:e.message})}
      return true;
    }

    const m=url.pathname.match(/^\/api\/treasure-raid\/rooms\/([A-F0-9]+)(?:\/(join|leave|ready|start|pick|continue|cashout))?$/);
    if(!m){json(res,404,{error:'보물 레이드 경로를 찾을 수 없어.'});return true}
    const r=rooms.get(m[1]);if(!r){json(res,404,{error:'보물 레이드 방을 찾을 수 없어.'});return true}
    const op=m[2]||'';

    if(!op&&req.method==='GET'){
      const p=roomPlayer(r,u.id);if(!p){json(res,403,{error:'이 원정대 참가자가 아니야.'});return true}
      json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true;
    }

    if(op==='join'&&req.method==='POST'){
      if(roomPlayer(r,u.id)){json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true}
      if(hasUser(u.id)||isUserBusy?.(u.id)){json(res,409,{error:'이미 다른 게임방에 참가 중이야.'});return true}
      if(r.phase!=='waiting'){json(res,409,{error:'이미 원정이 시작됐어.'});return true}
      if(r.players.length>=r.maxPlayers){json(res,409,{error:'원정대가 가득 찼어.'});return true}
      let b;try{b=await readBody(req)}catch(e){json(res,400,{error:e.message});return true}
      if(hasUser(u.id)||isUserBusy?.(u.id)){json(res,409,{error:'이미 다른 게임방에 참가 중이야.'});return true}
      let entry;try{entry=normalizeEntry(b.entry)}catch(e){json(res,400,{error:e.message});return true}
      if(Number(u.balance)<entry){json(res,400,{error:'선택한 배팅금보다 게임머니가 부족해.'});return true}
      try{
        walletChange(u.id,-entry,'treasure_raid_entry',`${r.name} 개인 배팅금 ${formatMoney(entry)}G`);
        const p=createPlayer(u,entry);r.players.push(p);escrowSet(r.id,u.id,entry,'treasure_raid');touch(r);pushRefresh();
        json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});
      }catch(e){json(res,400,{error:e.message})}
      return true;
    }

    const p=roomPlayer(r,u.id);if(!p){json(res,403,{error:'이 원정대 참가자가 아니야.'});return true}

    if(op==='ready'&&req.method==='POST'){
      if(r.phase!=='waiting'){json(res,409,{error:'이미 원정이 시작됐어.'});return true}
      p.ready=!p.ready;p.status=p.ready?'ready':'waiting';p.lastActionAt=now();touch(r);pushRefresh();
      json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true;
    }

    if(op==='start'&&req.method==='POST'){
      if(Number(r.hostId)!==Number(u.id)){json(res,403,{error:'방장만 원정을 시작할 수 있어.'});return true}
      if(r.phase!=='waiting'){json(res,409,{error:'이미 시작된 원정이야.'});return true}
      let b={};try{b=await readBody(req)}catch{}
      const solo=r.players.length===1;
      const allReady=r.players.every(x=>x.ready);
      if(!solo&&!allReady&&!b.force){json(res,409,{error:'아직 준비하지 않은 참가자가 있어. 준비된 인원으로 시작 버튼을 사용할 수 있어.'});return true}
      if(!solo&&!allReady&&b.force){
        const drop=r.players.filter(x=>!x.ready&&Number(x.userId)!==Number(r.hostId));
        for(const x of drop){refundWaiting(r,x,'준비 미완료 자동 환급');removePlayer(r,x)}
      }
      if(!r.players.length){json(res,409,{error:'시작할 참가자가 없어.'});return true}
      r.phase='playing';
      for(const x of r.players){x.ready=false;x.status='choosing';x.round=1;x.bank=x.entry;x.lastChest=null;x.lastOutcome=null;x.payout=0;armDeadline(x)}
      touch(r);pushRefresh();json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true;
    }

    if(op==='pick'&&req.method==='POST'){
      if(r.phase!=='playing'||p.status!=='choosing'){json(res,409,{error:'지금은 상자를 선택할 차례가 아니야.'});return true}
      if(p.deadlineAt&&now()>=p.deadlineAt){settlePlayer(r,p,'30초 시간초과 자동 탈출');json(res,409,{error:'선택 시간이 지나 자동 탈출 처리됐어.'});return true}
      let b;try{b=await readBody(req)}catch(e){json(res,400,{error:e.message});return true}
      if(r.phase!=='playing'||p.status!=='choosing'){json(res,409,{error:'이미 상자 선택이 처리됐어.'});return true}
      const chest=Number(b.chest);if(!Number.isInteger(chest)||chest<1||chest>8){json(res,400,{error:'1~8번 보물상자 중 하나를 선택해줘.'});return true}
      const outcome=drawOutcome(p.round);p.lastChest=chest;p.lastOutcome=outcome;p.lastActionAt=now();
      if(outcome.key==='trap'){
        p.bank=0;p.status='eliminated';clearDeadline(p);escrowDelete(r.id,p.userId);touch(r);maybeComplete(r);pushRefresh();
        json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true;
      }
      if(outcome.key==='jackpot')p.bank=p.entry*MAX_MULT;
      else p.bank=Math.max(1,Math.min(p.entry*MAX_MULT,Math.floor(Number(p.bank||p.entry)*outcome.mult)));
      escrowSet(r.id,p.userId,p.bank,'treasure_raid');
      if(outcome.key==='jackpot'||p.round>=MAX_ROUNDS)settlePlayer(r,p,outcome.key==='jackpot'?'JACKPOT 즉시 정산':'최종 라운드 완주 정산');
      else{p.status='decision';armDeadline(p);touch(r);pushRefresh()}
      json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true;
    }

    if(op==='continue'&&req.method==='POST'){
      if(r.phase!=='playing'||p.status!=='decision'){json(res,409,{error:'계속 도전할 수 있는 상태가 아니야.'});return true}
      if(p.deadlineAt&&now()>=p.deadlineAt){settlePlayer(r,p,'30초 시간초과 자동 탈출');json(res,409,{error:'선택 시간이 지나 자동 탈출 처리됐어.'});return true}
      if(p.round>=MAX_ROUNDS){settlePlayer(r,p,'최종 라운드 정산');json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true}
      p.round+=1;p.status='choosing';p.lastChest=null;p.lastOutcome=null;armDeadline(p);touch(r);pushRefresh();
      json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true;
    }

    if(op==='cashout'&&req.method==='POST'){
      if(r.phase!=='playing'||!['decision','choosing'].includes(p.status)){json(res,409,{error:'현재는 탈출 정산할 수 없어.'});return true}
      settlePlayer(r,p,'자진 탈출 정산');json(res,200,{room:roomPublic(r,u.id),user:userPublic(u.id)});return true;
    }

    if(op==='leave'&&req.method==='POST'){
      let payout=0;
      try{
        if(r.phase==='waiting')payout=refundWaiting(r,p);
        else if(r.phase==='playing'&&['choosing','decision'].includes(p.status))payout=settlePlayer(r,p,'원정 중단 정산');
        else payout=Number(p.payout||0);
        removePlayer(r,p);pushRefresh();json(res,200,{ok:true,payout,user:userPublic(u.id)});
      }catch(e){json(res,400,{error:e.message})}
      return true;
    }

    json(res,405,{error:'지원하지 않는 보물 레이드 요청이야.'});return true;
  }

  return {handle,hasUser,findUserRoom,roomCount:()=>rooms.size,sweepNow:sweepAllRooms};
};
