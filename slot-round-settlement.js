'use strict';
// One authoritative transaction for a complete slot round. Drawn outcome is
// supplied by the caller; balances, free ticket, statistics, history and pool
// either commit together or none of them do.
function settleSlotRound({db,exactWallet,userId,bet,multiplier,sevenJackpot,eventTriggered,
 consumeFree,readPool,writePool,basePool,isEventActive,disableEvent,recordJackpot,now}){
 const wager=BigInt(bet),regular=BigInt(multiplier)*wager;
 db.exec('BEGIN IMMEDIATE');
 try{
  const freePlay=consumeFree(),charged=freePlay.free?0n:wager;
  const row=db.prepare('SELECT balance,balance_exact,balance_base FROM users WHERE id=?').get(userId);
  if(!row)throw Error('사용자를 찾을 수 없습니다.');
  const before=exactWallet.read(row);
  if(before<charged)throw Error('게임머니가 부족합니다.');
  const jackpotAward=sevenJackpot?BigInt(readPool()):0n;
  const payout=regular+jackpotAward,finalBalance=before-charged+payout;
  const mirror=exactWallet.mirror;
  db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?')
   .run(mirror(finalBalance),String(finalBalance),String(mirror(finalBalance)),userId);
  const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
  const stamp=now();
  function log(delta,amountAfter,type,memo){
   ledger.run(userId,mirror(delta),mirror(amountAfter),String(delta),String(amountAfter),type,memo,stamp);
  }
  if(charged)log(-charged,before-charged,'slot_bet','슬롯 베팅 '+wager+'G');
  if(regular)log(regular,before-charged+regular,'slot_win','슬롯 당첨 x'+multiplier);
  if(jackpotAward)log(jackpotAward,finalBalance,'slot_jackpot_pool','777 누적 JACKPOT '+jackpotAward+'G');
  let pool,history=null,contribution=0n;
  if(sevenJackpot){
   history=recordJackpot({jackpotAward,regularPayout:Number(regular),bet:Number(wager)});
   pool=writePool(basePool);
   if(isEventActive())disableEvent();
  }else{
   const loss=charged>regular?charged-regular:0n;
   contribution=loss*13n/100n;
   pool=contribution>0n?writePool(BigInt(readPool())+contribution):readPool();
  }
  const net=payout-charged;
  db.prepare('UPDATE stats SET slot_spins=slot_spins+1,slot_wins=slot_wins+?,slot_profit=slot_profit+? WHERE user_id=?')
   .run(payout>charged?1:0,mirror(net),userId);
  db.exec('COMMIT');
  return {freePlay,regularPayout:exactWallet.output(regular),payout:exactWallet.output(payout),
   profit:exactWallet.output(net),jackpotAward:exactWallet.output(jackpotAward),contribution:exactWallet.output(contribution),pool:exactWallet.output(BigInt(pool)),history};
 }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
}
module.exports={settleSlotRound};
