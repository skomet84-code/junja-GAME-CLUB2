'use strict';
// J-BANK-compatible virtual G wagering for multiplayer Hula only.
// Every participant reserves the maximum possible liability (16x stake).
// Settlement is zero-sum, atomic, and protected by durable room_escrow rows.
const STAKES=Object.freeze(['0','1000000','10000000','100000000','1000000000','10000000000','1000000000000']);
const CAP=16n;
function stakeValue(raw){
 const value=String(raw==null?'0':raw);
 if(!STAKES.includes(value))throw Error('허용된 훌라 판돈을 선택해줘.');
 return value;
}
function quote(stake){return {stake:String(stake),maxMultiplier:Number(CAP),reserve:String(BigInt(stake)*CAP),rules:{unregistered:2,sevenEach:2,hula:4},currency:'G'};}
function createRoyalHulaCasino({db,exactWallet,now}){
 if(!db||!exactWallet)throw Error('훌라 카지노 지갑 연결 오류');
 const users=db.prepare('SELECT id,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?');
 const update=db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?');
 const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
 const saveEscrow=db.prepare('INSERT INTO room_escrow(room_id,user_id,amount,amount_exact,game,created_at) VALUES(?,?,?,?,?,?)');
 const getEscrow=db.prepare('SELECT COALESCE(amount_exact,CAST(amount AS TEXT)) AS amount FROM room_escrow WHERE room_id=? AND user_id=?');
 const dropEscrow=db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?');
 const saveResult=db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO NOTHING');
 function credit(id,delta,kind,memo){
  const u=users.get(id);if(!u)throw Error('훌라 참가자 계정을 찾을 수 없어.');
  const balance=exactWallet.read(u)+delta;if(balance<0n)throw Error('훌라 판돈 예치에 필요한 게임머니가 부족해.');
  const mir=exactWallet.mirror(balance);
  update.run(mir,String(balance),String(mir),id);
  ledger.run(id,exactWallet.mirror(delta),mir,String(delta),String(balance),kind,memo,now());
 }
 function reserve(room){
  if(!room.stake||room.stake==='0')return;
  if(room.mode!=='multi'||room.game!=='hula'||room.players.some(p=>p.bot))throw Error('훌라 카지노는 친구 멀티 대전에서만 가능해.');
  const amount=BigInt(room.stake)*CAP;
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const p of room.players){
    const u=users.get(p.id);if(!u||u.is_disabled)throw Error('훌라 참가자 계정 이용이 제한돼 있어.');
    if(getEscrow.get(room.id,p.id))throw Error('이전 판돈이 아직 정산되지 않았어.');
    if(exactWallet.read(u)<amount)throw Error(p.name+'님의 게임머니가 부족해. 최대 배당금 '+amount.toLocaleString('ko-KR')+'G를 준비해야 해.');
   }
   for(const p of room.players){
    credit(p.id,-amount,'hula_escrow','로얄 훌라 '+room.round+'판 배당 대비 16배 예치');
    saveEscrow.run(room.id,p.id,exactWallet.mirror(amount),String(amount),'royal_hula',now());
   }
   db.exec('COMMIT');room.escrowed=true;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }
 function settle(room,winner,why){
  if(!room.stake||room.stake==='0')return null;
  if(!room.escrowed)throw Error('훌라 판돈 예치 기록을 확인할 수 없어.');
  const stake=BigInt(room.stake),reserved=stake*CAP;
  const losers=room.players.filter(p=>p.id!==winner.id).sort((a,b)=>Number(b.registered)-Number(a.registered)||a.hand.reduce((n,c)=>n+Number(c.slice(1)),0)-b.hand.reduce((n,c)=>n+Number(c.slice(1)),0));
  const isHula=why.includes('훌라');
  const results=new Map();
  let earned=0n;
  for(let i=0;i<losers.length;i++){
   const p=losers[i],seven=p.hand.filter(c=>Number(c.slice(1))===7).length;
   const rankMult=2n**BigInt(i),unreg=p.registered?1n:2n,sevenMult=2n**BigInt(seven),hulaMult=isHula?4n:1n;
   const rawMultiplier=rankMult*unreg*sevenMult*hulaMult;
   const multiplier=rawMultiplier>CAP?CAP:rawMultiplier;
   const lost=stake*multiplier;earned+=lost;
   const reasons=[(i+2)+'위'+(rankMult>1n?' x'+rankMult:'')];
   if(!p.registered)reasons.push('미등록 x2');
   if(seven)reasons.push('7 '+seven+'장 x'+sevenMult);
   if(isHula)reasons.push('훌라 x4');
   if(rawMultiplier>CAP)reasons.push('최대 x16 제한');
   results.set(p.id,{userId:p.id,name:p.name,payout:String(reserved-lost),net:String(-lost),multiplier:Number(multiplier),reason:reasons.join(' · ')});
  }
  results.set(winner.id,{userId:winner.id,name:winner.name,payout:String(reserved+earned),net:String(earned),multiplier:0,reason:isHula?'훌라 x4 승리':'승리 · 상대 정산금 수령'});
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const p of room.players){
    const escrow=getEscrow.get(room.id,p.id);
    if(!escrow||BigInt(escrow.amount)!==reserved)throw Error('훌라 판돈 예치액 검증 실패. 이 판은 관리자 확인이 필요해.');
   }
   for(const p of room.players){
    const result=results.get(p.id);
    credit(p.id,BigInt(result.payout),'hula_settlement','훌라 '+room.round+'판 · '+result.reason);
    dropEscrow.run(room.id,p.id);
   }
   const list=room.players.map(p=>results.get(p.id));
   saveResult.run('royalcards:casino:result:'+room.id+':'+room.round,JSON.stringify({stake:room.stake,winner:winner.id,results:list,at:now()}),now());
   db.exec('COMMIT');room.escrowed=false;room.finalPayouts=list;return list;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }
 return {reserve,settle,quote,stakeValue,stakes:STAKES};
}
module.exports={createRoyalHulaCasino,quote,stakeValue,STAKES,CAP};
