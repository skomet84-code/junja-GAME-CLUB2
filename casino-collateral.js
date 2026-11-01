'use strict';
// Casino collateral is reserved before play. All methods run INSIDE a caller-owned
// BEGIN IMMEDIATE transaction, so payout and forced liquidation are one atomic write.
const {SELL_RATE_BP}=require('./j-bank-core');
const min=(a,b)=>a<b?a:b;
function createCasinoCollateral({db,exactWallet,jBank,levels,now}){
 if(!db||!exactWallet||!jBank||!Array.isArray(levels))throw Error('카지노 담보 연결 실패');
 const readUser=db.prepare('SELECT id,is_disabled,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?');
 const held=db.prepare('SELECT COALESCE(amount_exact,CAST(amount AS TEXT)) AS amount,game FROM room_escrow WHERE room_id=? AND user_id=?');
 const conflict=db.prepare("SELECT room_id FROM room_escrow WHERE user_id=? AND game LIKE 'casino_%' LIMIT 1");
 const insert=db.prepare('INSERT INTO room_escrow(room_id,user_id,amount,amount_exact,game,created_at) VALUES(?,?,?,?,?,?)');
 const updateHold=db.prepare('UPDATE room_escrow SET amount=?,amount_exact=?,game=? WHERE room_id=? AND user_id=?');
 const drop=db.prepare('DELETE FROM room_escrow WHERE room_id=? AND user_id=?');
 const save=db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
 const del=db.prepare('DELETE FROM game_state WHERE key=?');
 const updateBalance=db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?');
 const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
 const pledgeKey=(roomId,userId)=>'casino:pledge:'+roomId+':'+userId;
 function rankValue(level){
  let v=0n;for(let i=1;i<=Math.min(levels.length-1,Number(level));i++)v+=BigInt(String(levels[i].cost))*SELL_RATE_BP/10000n;
  return v;
 }
 function credit(userId,delta,kind,memo){
  if(delta===0n)return;
  const u=readUser.get(userId);if(!u)throw Error('카지노 회원을 찾을 수 없어.');
  const next=exactWallet.read(u)+delta;
  if(next<0n)throw Error('카지노 정산 중 게임머니가 부족해.');
  const mir=exactWallet.mirror(next);
  updateBalance.run(mir,String(next),String(mir),userId);
  ledger.run(userId,exactWallet.mirror(delta),mir,String(delta),String(next),kind,memo,now());
 }
 function available(userId){
  const u=readUser.get(userId);if(!u||u.is_disabled)throw Error('카지노 이용이 제한된 회원이야.');
  const cash=exactWallet.read(u),rank=rankValue(u.rank_level),debt=jBank.owed(userId);
  return {cash,rank,bankDebt:debt,usableRank:rank>debt?rank-debt:0n,total:cash+(rank>debt?rank-debt:0n)};
 }
 // existing=true converts a lobby's already-paid buy-in to a secured bet.
 function reserve(roomId,userId,maxLoss,game,{existing=false}={}){
  const limit=BigInt(maxLoss);if(limit<=0n)throw Error('카지노 보증금이 잘못됐어.');
  const old=held.get(roomId,userId);
  if(old&&!existing)throw Error('이전 카지노 예치금이 아직 남아 있어.');
  if(existing&&(!old||old.game!=='gostop'))throw Error('맞고 기존 참가금이 확인되지 않아.');
  if(conflict.get(userId))throw Error('이미 다른 카지노 게임에 담보가 묶여 있어.');
  const quote=available(userId),base=old?BigInt(old.amount):0n;
  if(base>limit)throw Error('기존 참가금이 최대 손실액보다 커.');
  if(base+quote.total<limit)throw Error('최대 패배액 '+limit.toLocaleString('ko-KR')+' G를 보증할 자산이 부족해. 판돈을 낮춰줘.');
  const additional=min(quote.cash,limit-base),cash=base+additional;
  if(additional>0n)credit(userId,-additional,'casino_escrow',game+' 최대 손실 예치');
  if(old)updateHold.run(exactWallet.mirror(cash),String(cash),'casino_'+game,roomId,userId);
  else insert.run(roomId,userId,exactWallet.mirror(cash),String(cash),'casino_'+game,now());
  save.run(pledgeKey(roomId,userId),JSON.stringify({maxLoss:String(limit),cash:String(cash),rankLevel:Number(readUser.get(userId).rank_level),bankDebt:String(quote.bankDebt),game,at:now()}),now());
  return {cash:String(cash),rankPledge:String(limit-cash),maxLoss:String(limit)};
 }
 // Winner receives his escrow plus the aggregate of losers' actual losses.
 // Losers pay EXACTLY their measured loss, including compulsory 99% rank sales.
 function settle(roomId,userId,loss,win=0n){
  const record=held.get(roomId,userId),p=db.prepare('SELECT value FROM game_state WHERE key=?').get(pledgeKey(roomId,userId));
  if(!record||!p||!record.game.startsWith('casino_'))throw Error('카지노 판돈 보증 기록이 없어. 관리자 확인이 필요해.');
  const info=JSON.parse(p.value),cash=BigInt(record.amount),lose=BigInt(loss),gain=BigInt(win);
  if(lose<0n||gain<0n||lose>BigInt(info.maxLoss)||cash!==BigInt(info.cash))throw Error('카지노 손실액/담보 검증 실패');
  const deficit=lose>cash?lose-cash:0n;
  let liquidation=null;
  if(deficit){
   const u=readUser.get(userId);
   if(Number(u.rank_level)!==Number(info.rankLevel))throw Error('담보로 잡은 신분이 변경되어 정산을 보호했어.');
   liquidation=jBank.forceCasinoSale(userId,deficit);
   if(BigInt(liquidation.available)<deficit)throw Error('카지노 담보 매각액이 부족해. 지급은 보류됐어.');
   credit(userId,-deficit,'casino_rank_claim','카지노 신분 매각대금에서 패배액 차감');
  }
  const refund=cash-min(lose,cash);
  credit(userId,refund+gain,'casino_settlement','카지노 정산 · 손실 '+lose+' G · 수익 '+gain+' G');
  drop.run(roomId,userId);del.run(pledgeKey(roomId,userId));
  return {net:String(gain-lose),loss:String(lose),win:String(gain),cashRefund:String(refund),liquidation};
 }
 return {available,rankValue,reserve,settle};
}
module.exports={createCasinoCollateral};
