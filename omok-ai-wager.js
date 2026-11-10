'use strict';
// Solo omok J-BOT wager: virtual G only; the bot never owns a user wallet.
const STAKES=Object.freeze(['0','1000000','10000000','100000000','1000000000','10000000000','1000000000000']);
function stakeValue(value){
 const stake=String(value==null?'0':value);
 if(!STAKES.includes(stake))throw Error('허용된 오목 AI 판돈을 선택해주세요.');
 return stake;
}
function createOmokAiWager({db,exactWallet,now}){
 const user=db.prepare('SELECT id,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?');
 const update=db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?');
 const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
 const escrow=db.prepare('SELECT COALESCE(amount_exact,CAST(amount AS TEXT)) amount FROM room_escrow WHERE room_id=? AND user_id=?');
 const insert=db.prepare('INSERT INTO room_escrow(room_id,user_id,amount,amount_exact,game,created_at) VALUES(?,?,?,?,?,?)');
 const remove=db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?');
 const receipt=db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO NOTHING');
 function credit(id,delta,reason,round){
  const u=user.get(id);if(!u)throw Error('오목 플레이어를 찾을 수 없습니다.');
  const next=exactWallet.read(u)+delta;
  if(next<0n)throw Error('게임머니가 부족합니다.');
  const mirror=exactWallet.mirror(next);
  update.run(mirror,String(next),String(mirror),id);
  ledger.run(id,exactWallet.mirror(delta),mirror,String(delta),String(next),'omok_ai_'+reason,'오목 AI '+round+'국 · '+reason,now());
 }
 function reserve(room){
  const stake=BigInt(room.stake||'0');
  if(stake===0n)return;
  const human=room.players.find(p=>p.id!==0);
  if(!room.aiMode||room.players.length!==2||!human)throw Error('오목 AI 참가자 오류');
  db.exec('BEGIN IMMEDIATE');
  try{
   const u=user.get(human.id);
   if(!u||u.is_disabled)throw Error('게임머니 이용이 제한된 계정입니다.');
   if(escrow.get(room.id,human.id))throw Error('이전 AI 대국 정산이 완료되지 않았습니다.');
   if(exactWallet.read(u)<stake)throw Error('오목 판돈 '+stake.toLocaleString('ko-KR')+' G가 부족합니다.');
   credit(human.id,-stake,'entry',room.round+1);
   insert.run(room.id,human.id,exactWallet.mirror(stake),String(stake),'omok_ai',now());
   db.exec('COMMIT');room.escrowed=true;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }
 function settle(room,winner){
  const stake=BigInt(room.stake||'0');
  if(stake===0n)return null;
  if(!room.escrowed)throw Error('오목 AI 판돈 예치 정보가 없습니다.');
  const human=room.players.find(p=>p.id!==0);
  if(!human)throw Error('오목 AI 플레이어 정보가 없습니다.');
  const net=winner==null?0n:winner===human.id?stake:-stake;
  const payout=stake+net;
  const result={net:exactWallet.output(net),stake:String(stake),outcome:winner==null?'draw':net>0n?'win':'loss'};
  db.exec('BEGIN IMMEDIATE');
  try{
   const held=escrow.get(room.id,human.id);
   if(!held||BigInt(held.amount)!==stake)throw Error('오목 AI 예치액 검증 실패');
   credit(human.id,payout,'settlement',room.round);
   remove.run(room.id,human.id);
   receipt.run('omok:ai:wager:'+room.id+':'+room.round,JSON.stringify(result),now());
   db.exec('COMMIT');room.escrowed=false;return result;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }
 return {reserve,settle};
}
module.exports={STAKES,stakeValue,createOmokAiWager};
