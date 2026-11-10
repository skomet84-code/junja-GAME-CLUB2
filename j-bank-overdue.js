'use strict';
// Automatic J-BANK game-money collections. All changes to wallet, collateral,
// portfolios, and bank debt commit as one SQLite transaction. No live orders.
const DAY=86400000,GRANT=100000000000n;
function createOverdue({db,exactWallet,now,kstDate,levels,read,project,store,empty,installment,purchasedRankBasis,creditOwed=()=>0n}){
 const selectUser=db.prepare('SELECT id,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?');
 const getKey=db.prepare('SELECT value FROM game_state WHERE key=?');
 const putKey=db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
 const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
 const changeBalance=db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?');
 const updateRank=db.prepare('UPDATE users SET rank_level=? WHERE id=?');
 const hasEscrow=db.prepare('SELECT 1 FROM room_escrow WHERE user_id=? LIMIT 1');
 const readJson=key=>{const r=getKey.get(key);return r?JSON.parse(r.value):null};
 const writeJson=(key,value)=>putKey.run(key,JSON.stringify(value),now());
 const debtOf=a=>BigInt(a.principal||'0')+BigInt(a.interest||'0');
 function creditRecord(id,delta,balance,type,memo){
   if(delta===0n)return balance;
   const next=balance+delta,mirror=exactWallet.mirror(next);
   if(next<0n)throw Error('은행 자동 회수 잔액 오류');
   ledger.run(id,exactWallet.mirror(delta),mirror,String(delta),String(next),type,memo,now());
   return next;
 }
 function repay(a,amount){
   const debt=debtOf(a),p=amount<debt?amount:debt;
   if(p<=0n)return 0n;
   const interest=p<BigInt(a.interest)?p:BigInt(a.interest);
   a.interest=String(BigInt(a.interest)-interest);
   a.principal=String(BigInt(a.principal)-(p-interest));
   a.totalRepaid=String(BigInt(a.totalRepaid||'0')+p);
   if(debtOf(a)===0n)a.closedAt=now();
   return p;
 }
 function dueInfo(id){
   const a=read(id),owed=debtOf(project(a,kstDate()));
   const dueAt=Number(a.openedAt||0)+7*DAY,number=Number(a.number||0);
   return {dueAt,owed,number,overdue:owed>0n&&Number(a.openedAt)>0&&now()>dueAt};
 }
 function enforce(id){
   id=Number(id);if(!Number.isSafeInteger(id)||id<1)return {processed:false};
   const info=dueInfo(id),receipt='jbank:overdue:v1:'+id+':'+info.number;
   if(!info.overdue||readJson(receipt))return {processed:false};
   if(hasEscrow.get(id))return {processed:false,deferred:'active_game'};
   db.exec('BEGIN IMMEDIATE');
   try{
     if(readJson(receipt)){db.exec('COMMIT');return {processed:false}}
     const u=selectUser.get(id);if(!u)throw Error('회원 정보가 없습니다.');
     const a=project(read(id,kstDate()),kstDate());
     if(debtOf(a)<=0n||now()<=Number(a.openedAt||0)+7*DAY){db.exec('COMMIT');return {processed:false}};
     let wallet=exactWallet.read(u),rank=Number(u.rank_level||0);
     const sales=[],startDebt=debtOf(a),time=now();
     const collect=(amount,reason)=>{
       const applied=repay(a,amount<wallet?amount:wallet);
       if(applied>0n){wallet=creditRecord(id,-applied,wallet,'jbank_overdue_repay','7일 연체 자동 상환 · '+reason);}
       return applied;
     };
     collect(wallet,'보유머니');
     const addAsset=(amount,type,description)=>{
       if(amount<=0n)return;
       wallet=creditRecord(id,amount,wallet,type,description);
       sales.push({type,amount:String(amount)});
       collect(amount,description);
     };
     if(debtOf(a)>0n){
       const savings=BigInt(a.savingsPrincipal||'0')+BigInt(a.savingsInterest||'0');
       if(savings>0n){
         a.savingsPrincipal='0';a.savingsInterest='0';a.savingsRemainder='0';a.savingsLockedUntil=0;
         addAsset(savings,'jbank_overdue_savings','자유저축 강제 출금');
       }
     }
     if(debtOf(a)>0n&&a.installment){
       const v=installment.view(a.installment,time),value=BigInt(v.principal)+BigInt(v.accruedInterest);
       a.lastInstallment={...v,closedAt:time,forced:true,paidInterest:String(v.accruedInterest)};
       a.installment=null;
       addAsset(value,'jbank_overdue_installment','적금 강제 해지');
     }
     // Trade against the shared, latest persisted game-market quotes.
     // No arbitrary numeric fallback: if a held instrument has no valid quote,
     // roll back instead of destroying its quantity.
     const assetSale=(kind,scale,feeBp)=>{
       if(debtOf(a)<=0n)return;
       const key=kind+':portfolio:'+id,p=readJson(key);
       if(!p||!p.holdings)return;
       const market=readJson(kind+':market:v1');
       const positions=Object.entries(p.holdings);
       for(const [stockId,h] of positions){
         if(debtOf(a)<=0n)break;
         const qty=BigInt(h.qty||'0');if(qty<=0n)continue;
         const rawPrice=market?.stocks?.[stockId]?.price;
         if(rawPrice==null||BigInt(rawPrice)<=0n)throw Error(kind+' 강제 매각 시장가격 확인 실패: '+stockId);
         const price=BigInt(rawPrice),gross=qty*price/scale;
         const fee=(gross*feeBp+9999n)/10000n,net=gross-fee;
         if(net<=0n)throw Error(kind+' 강제 매각 순매도가 오류');
         p.holdings[stockId]={...h,qty:'0',cost:'0'};
         p.returned=String(BigInt(p.returned||'0')+net);
         p.realized=String(BigInt(p.realized||'0')+net-BigInt(h.cost||'0'));
         addAsset(net,'jbank_overdue_'+kind,kind+' '+stockId+' 보유 전량 강제 매각');
       }
       writeJson(key,p);
     };
     assetSale('jstock',1n,50n);
     assetSale('jcoin',10000n,20n);
     while(debtOf(a)>0n&&rank>0){
       const value=purchasedRankBasis(id,rank)*9900n/10000n;
       const label=levels[rank].name+' → '+levels[rank-1].name;
       rank--;
       if(value>0n)addAsset(value,'jbank_overdue_rank',label+' 신분 99% 강제 매각');
     }
     const mir=exactWallet.mirror(wallet);
     changeBalance.run(mir,String(wallet),String(mir),id);updateRank.run(rank,id);
     store(id,a);
     const event={at:time,from:String(startDebt),remaining:String(debtOf(a)),sales,rankBefore:Number(u.rank_level||0),rankAfter:rank};
     writeJson(receipt,event);
     db.exec('COMMIT');return {processed:true,...event};
   }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 function activeAuction(id){
  return db.prepare("SELECT value FROM game_state WHERE key LIKE 'royal:auction:lot:%'").all().some(row=>{
   const lot=JSON.parse(row.value);
   return lot?.status==='OPEN'&&(Number(lot.sellerId)===id||Number(lot.bidderId)===id);
  });
 }
 function rehabilitation(id,confirmation,requestId){
   id=Number(id);
   if(confirmation!=='개인회생'||!Number.isSafeInteger(id)||id<1)throw Error('개인회생 확인 문구가 필요합니다.');
   if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(requestId))throw Error('개인회생 요청번호 오류');
   if(hasEscrow.get(id))throw Error('진행 중인 게임을 종료한 뒤 신청하세요.');
   db.exec('BEGIN IMMEDIATE');
   try{
     const receipt='jbank:rehabilitation:once:'+id;
     if(readJson(receipt))throw Error('개인회생은 계정당 1회만 가능합니다.');
     if(activeAuction(id))throw Error('경매·입찰 정산을 마친 뒤 신청하세요.');
     const u=selectUser.get(id),a=project(read(id,kstDate()),kstDate());
     const rankDebt=debtOf(a),creditDebt=creditOwed(id),debt=rankDebt+creditDebt;
     if(!u||debt<=0n)throw Error('탕감 대상인 미상환 채무가 없습니다.');
     const prior=exactWallet.read(u),at=now();
     // Pending virtual football bets are forfeited too; no post-rehabilitation jackpot.
     for(const row of db.prepare("SELECT key,value FROM game_state WHERE key LIKE ?").all('jpl:v1:ticket:%:'+id+':%')){
      const ticket=JSON.parse(row.value);
      if(ticket.status==='OPEN'&&Number(ticket.userId)===id){
       ticket.status='FORFEITED';ticket.paid='0';ticket.settledAt=at;ticket.forfeitureReason='개인회생';
       writeJson(row.key,ticket);
      }
     }
     db.prepare("DELETE FROM game_state WHERE key IN (?,?)").run('jstock:portfolio:'+id,'jcoin:portfolio:'+id);
     const creditKey='jcredit:account:'+id,credit=readJson(creditKey);
     if(credit)writeJson(creditKey,{...credit,principal:'0',interest:'0',asOf:kstDate(),closedAt:at,rehabilitationAt:at});
     // Owned inventory and certificates are forfeited atomically with loan forgiveness.
     for(const row of db.prepare('SELECT key,value FROM game_state WHERE key LIKE ?').all('royal:certificate:holder:'+id+':%')){
      const serial=JSON.parse(row.value),serialKey='royal:certificate:serial:'+serial,cert=readJson(serialKey);
      if(cert&&Number(cert.currentOwnerId)===id){
       cert.status='BANK_REDEEMED';cert.currentOwnerId=null;cert.currentOwner='J-BANK';
       cert.history=[...(Array.isArray(cert.history)?cert.history:[]),{type:'REHABILITATION',at,fromUserId:id}];
       writeJson(serialKey,cert);
      }
     }
     db.prepare('DELETE FROM game_state WHERE key LIKE ? OR key LIKE ? OR key=?')
      .run('royal:certificate:holder:'+id+':%','royal:inscription:'+id+':%','royal:showcase:'+id);
     if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_inventory'").get())
      db.prepare('DELETE FROM user_inventory WHERE user_id=?').run(id);
     if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_loadout'").get())
      db.prepare('DELETE FROM user_loadout WHERE user_id=?').run(id);
     const clean=empty(kstDate());
     clean.number=Number(a.number||0);clean.totalBorrowed=a.totalBorrowed;clean.totalRepaid=a.totalRepaid;
     clean.rehabilitation={at,forgiven:String(debt),rankDebtForgiven:String(rankDebt),creditDebtForgiven:String(creditDebt),previousRank:Number(u.rank_level||0)};
     store(id,clean);
     updateRank.run(0,id);
     const mirror=exactWallet.mirror(GRANT);
     changeBalance.run(mirror,String(GRANT),String(mirror),id);
     ledger.run(id,exactWallet.mirror(GRANT-prior),mirror,String(GRANT-prior),String(GRANT),'jbank_rehabilitation','즉시 개인회생 · 모든 대출 및 자산 초기화 · 재출발 1000억 G',at);
     const result={at,forgiven:String(debt),rankDebtForgiven:String(rankDebt),creditDebtForgiven:String(creditDebt),previousWallet:String(prior),newWallet:String(GRANT)};
     writeJson(receipt,result);
     db.exec('COMMIT');return result;
   }catch(e){try{db.exec('ROLLBACK')}catch{}throw e}
 }
 return {dueInfo,enforce,rehabilitation};
}
module.exports={createOverdue,DAY,GRANT};
