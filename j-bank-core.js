'use strict';
const installment=require('./j-bank-installment');
const {createOverdue}=require('./j-bank-overdue');
// J-BANK uses existing persisted game_state, exact-wallet and atomic SQLite transactions.
const LIMITS=Object.freeze([
 '5000000','30000000','100000000','500000000','1000000000',
 '3000000000','10000000000','50000000000','100000000000',
 '1000000000000','10000000000000','5000000000000000',
 '100000000000000000','300000000000000000'
]); // THE ABSOLUTE = 10경 G; GOD JUNJA = 30경 G.
const RATE_BP=10n,MIN_LOAN=1000000n,SELL_RATE_BP=9900n; // 99% of the rank purchase price // 0.1% simple interest per KST day.
function dayNumber(s){const n=Date.parse(String(s)+'T00:00:00Z');if(!Number.isFinite(n))throw Error('이자 계산 날짜 오류');return Math.floor(n/86400000);}
function positive(raw){if(typeof raw!=='string'||!/^[1-9][0-9]{0,79}$/.test(raw))throw Error('금액은 1G 이상의 정수여야 합니다.');return BigInt(raw);}
function createJBank({db,exactWallet,levels,legacyRankCosts=null,now,kstDate}){
 let creditBank=null;
 const accountKey=id=>'jbank:account:'+Number(id);
 function empty(day){return {principal:'0',interest:'0',asOf:day,openedAt:0,closedAt:0,number:0,totalBorrowed:'0',totalRepaid:'0',lastRankSale:null,saleCount:0,savingsPrincipal:'0',savingsInterest:'0',savingsEarned:'0',savingsRemainder:'0',savingsAt:now(),savingsLockedUntil:0,installment:null,lastInstallment:null};}
 function read(id,day=kstDate()){const r=db.prepare('SELECT value FROM game_state WHERE key=?').get(accountKey(id));return r?{...empty(day),...JSON.parse(r.value)}:empty(day);}
 function project(record,day=kstDate()){
  const r={...record},elapsed=Math.max(0,dayNumber(day)-dayNumber(r.asOf)),principal=BigInt(r.principal);
  // Charge only on outstanding principal; interest does not compound.
  if(elapsed&&principal>0n)r.interest=String(BigInt(r.interest)+(principal*RATE_BP*BigInt(elapsed)+9999n)/10000n);
  r.asOf=day;
  const at=now(),lockUntil=Number(r.savingsLockedUntil||0),lastAt=Number(r.savingsAt??at);
  // Credit the full first day only after the 24-hour hold has actually elapsed.
  // Do not advance savingsAt while locked or the first day's interest is lost.
  const elapsedMs=at>=lockUntil?Math.max(0,at-lastAt):0,denom=10000n*86400000n;
  const numerator=BigInt(r.savingsPrincipal||'0')*5n*BigInt(Math.floor(elapsedMs))+BigInt(r.savingsRemainder||'0');
  const earned=numerator/denom;
  r.savingsInterest=String(BigInt(r.savingsInterest||'0')+earned);
  r.savingsEarned=String(BigInt(r.savingsEarned||'0')+earned);
  r.savingsRemainder=String(numerator%denom);r.savingsAt=at>=lockUntil?Math.max(at,lastAt):lastAt;
  return r;
 }
 function baseOwed(id,day=kstDate()){const x=project(read(id,day),day);return BigInt(x.principal)+BigInt(x.interest);}
 function owed(id,day=kstDate()){return baseOwed(id,day)+(creditBank?creditBank.owed(id):0n);}
 function store(id,record){db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(accountKey(id),JSON.stringify(record),now());}
 // Selling an existing rank must not retroactively multiply its collateral value.
 // Read the last actual promotion payment; for pre-change/granted ranks use the
 // pre-increase price as a conservative legacy basis. All amounts remain exact BigInts.
 const purchasedRankBasis=(id,level)=>{
  if(level<=0||level>=levels.length)return 0n;
  const row=db.prepare("SELECT amount_exact,amount FROM ledger WHERE user_id=? AND type='rank_promotion' AND memo=? ORDER BY created_at DESC,rowid DESC LIMIT 1")
   .get(id,'신분 상승 · '+levels[level].name);
  if(row){
   const paid=BigInt(String(row.amount_exact??row.amount));
   if(paid<0n)return -paid;
  }
  return BigInt(String(legacyRankCosts?.[level]??levels[level].cost));
 };
 const overdue=createOverdue({db,exactWallet,now,kstDate,levels,read,project,store,empty,installment,purchasedRankBasis});
 function status(id,day=kstDate()){
  const u=db.prepare('SELECT id,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
  if(!u)throw Error('은행 회원을 찾을 수 없습니다.');
  const level=Math.max(0,Math.min(levels.length-1,Number(u.rank_level||0))),r=project(read(id,day),day);
  const debt=BigInt(r.principal)+BigInt(r.interest),creditDebt=creditBank?creditBank.owed(id):0n,limit=LIMITS[level];
  const price=level>0?purchasedRankBasis(id,level)*SELL_RATE_BP/10000n:0n;
  const pay=price<debt?price:debt;
  const rankSale=debt>0n&&level>0?{fromLevel:level,fromName:levels[level].name,toLevel:level-1,toName:levels[level-1].name,
   salePrice:String(price),repayAmount:String(pay),remainingDebt:String(debt-pay),cashBack:String(price-pay),saleRatePct:99}:null;
  const savingsTotal=BigInt(r.savingsPrincipal)+BigInt(r.savingsInterest);
  const savings={principal:r.savingsPrincipal,interest:r.savingsInterest,total:String(savingsTotal),totalEarned:r.savingsEarned,dailyInterestPct:'0.05',withdrawAvailableAt:0,canWithdraw:savingsTotal>0n,canDeposit:debt===0n};
  return {installment:installment.view(r.installment,now()),installmentProducts:installment.PRODUCTS,lastInstallment:r.lastInstallment,savings,name:'J-BANK',rank:{level,name:levels[level].name},loanLimit:limit,minLoan:String(MIN_LOAN),
   credit:creditBank?creditBank.status(id):null,creditOutstanding:String(creditDebt),
   dailyInterestPct:'0.1',interestMethod:'simple',principal:r.principal,interest:r.interest,
   outstanding:String(debt),canBorrow:debt===0n&&creditDebt===0n&&!r.installment,canPromote:debt===0n&&creditDebt===0n,available:debt===0n&&creditDebt===0n&&!r.installment?limit:'0',
   borrowBlockedReason:debt>0n?'기존 신분 대출을 먼저 완납해야 합니다.':creditDebt>0n?'자산 신용대출을 완납한 뒤 신청할 수 있습니다.':r.installment?'적금이 진행 중입니다. 적금 만기 수령 또는 중도해지 후 신분 대출을 신청하세요. 자산 신용대출은 별도로 이용할 수 있습니다.':'',
   wallet:exactWallet.output(exactWallet.read(u)),openedAt:r.openedAt,closedAt:r.closedAt,
   totalBorrowed:r.totalBorrowed,totalRepaid:r.totalRepaid,canSellRank:!!rankSale,rankSale,lastRankSale:r.lastRankSale,saleCount:r.saleCount||0,
   dueAt:r.openedAt?Number(r.openedAt)+7*86400000:null,overdue:debt>0n&&r.openedAt>0&&now()>Number(r.openedAt)+7*86400000,
   canRehabilitate:debt>0n&&!!db.prepare('SELECT 1 FROM game_state WHERE key=?').get('jbank:overdue:v1:'+id+':'+Number(r.number||0))&&!db.prepare('SELECT 1 FROM game_state WHERE key=?').get('jbank:rehabilitation:once:'+id),
   lastRehabilitation:r.rehabilitation||null};
 }
 function change(id,kind,raw,requestId){
  id=Number(id);
  if(!Number.isSafeInteger(id)||id<1)throw Error('잘못된 계정입니다.');
  if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId))throw Error('은행 요청 번호 오류');
  const text=kind.startsWith('installment')?installment.requestText(kind,raw):['repay','withdraw'].includes(kind)&&raw==='all'?'all':String(positive(raw));
  db.exec('BEGIN IMMEDIATE');
  try{
   const receiptKey='jbank:receipt:'+id+':'+kind+':'+requestId;
   const prev=db.prepare('SELECT value FROM game_state WHERE key=?').get(receiptKey);
   if(prev){
    if(JSON.parse(prev.value).amount!==text)throw Error('이미 사용한 요청 번호입니다.');
    db.exec('COMMIT');return {ok:true,duplicate:true,status:status(id)};
   }
   const day=kstDate(),u=db.prepare('SELECT id,is_disabled,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
   if(!u||u.is_disabled)throw Error('현재 계정은 은행을 이용할 수 없습니다.');
   const a=project(read(id,day),day),debt=BigInt(a.principal)+BigInt(a.interest),before=exactWallet.read(u);
   let delta=0n,type='',memo='';
   if(kind.startsWith('installment')){
    ({delta,type,memo}=installment.transact(a,kind,text,requestId,now(),debt,before));
   }else if(kind==='deposit'){
    const amount=BigInt(text);
    if(debt>0n)throw Error('대출을 완납해야 저축할 수 있습니다.');
    if(amount>before)throw Error('게임머니 잔액이 부족합니다.');
    a.savingsPrincipal=String(BigInt(a.savingsPrincipal)+amount);
    // The first day's interest requires 24 hours, but principal is withdrawable immediately.
    a.savingsLockedUntil=now()+86400000;
    a.savingsAt=now(); // Preserve fractional interest already accrued before this top-up.
    delta=-amount;type='jbank_deposit';memo='J-BANK 자유저축 입금';
   }else if(kind==='withdraw'){
    const total=BigInt(a.savingsPrincipal)+BigInt(a.savingsInterest),amount=text==='all'?total:BigInt(text);
    if(amount<=0n||amount>total)throw Error('출금 가능한 저축 잔액을 확인하세요.');
    const paidInterest=amount<BigInt(a.savingsInterest)?amount:BigInt(a.savingsInterest);
    a.savingsInterest=String(BigInt(a.savingsInterest)-paidInterest);
    a.savingsPrincipal=String(BigInt(a.savingsPrincipal)-(amount-paidInterest));
    delta=amount;type='jbank_withdraw';memo='J-BANK 저축 출금 · 이자 '+paidInterest+' G';
   }else if(kind==='borrow'){
    if(creditBank&&creditBank.owed(id)>0n)throw Error('자산 신용대출을 완납한 뒤 신분 대출을 이용할 수 있습니다.');
    if(a.installment)throw Error('적금 만기 수령 또는 해지 후 대출할 수 있습니다.');
    const amount=BigInt(text),level=Math.max(0,Math.min(levels.length-1,Number(u.rank_level||0)));
    if(db.prepare("SELECT 1 FROM room_escrow WHERE user_id=? AND game LIKE 'casino_%' LIMIT 1").get(id))throw Error('카지노 담보가 묶여 있는 동안 추가 대출은 불가능합니다.');
     if(debt>0n)throw Error('진행 중인 대출을 전액 상환해야 추가 대출이 가능합니다.');
    if(amount<MIN_LOAN)throw Error('최소 대출금은 100만 G입니다.');
    if(amount>BigInt(LIMITS[level]))throw Error('현재 신분의 대출 한도를 초과했습니다.');
    a.principal=String(amount);a.interest='0';a.openedAt=now();a.closedAt=0;a.number=Number(a.number||0)+1;
    a.totalBorrowed=String(BigInt(a.totalBorrowed)+amount);
    delta=amount;type='jbank_borrow';memo='J-BANK 대출 · '+levels[level].name;
   }else if(kind==='repay'){
    if(debt<=0n)throw Error('상환할 대출이 없습니다.');
    const payment=text==='all'?debt:BigInt(text);
    if(payment>debt)throw Error('남은 상환금보다 큽니다.');
    if(payment>before)throw Error('게임머니 잔액이 부족합니다.');
    const interestPaid=payment<BigInt(a.interest)?payment:BigInt(a.interest);
    a.interest=String(BigInt(a.interest)-interestPaid);
    a.principal=String(BigInt(a.principal)-(payment-interestPaid));
    a.totalRepaid=String(BigInt(a.totalRepaid)+payment);
    if(BigInt(a.principal)+BigInt(a.interest)===0n)a.closedAt=now();
    delta=-payment;type='jbank_repay';memo='J-BANK 상환 · 이자 '+interestPaid+' G';
   }else throw Error('알 수 없는 은행 거래입니다.');
   const balance=before+delta,mirror=exactWallet.mirror(balance),t=now();
   if(balance<0n)throw Error('잔액이 부족합니다.');
   db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(mirror,String(balance),String(mirror),id);
   store(id,a);
   db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,exactWallet.mirror(delta),mirror,String(delta),String(balance),type,memo,t);
   db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(receiptKey,JSON.stringify({amount:text,type,at:t}),t);
   db.exec('COMMIT');return {ok:true,duplicate:false,status:status(id)};
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }

 // Called ONLY by casino settlement inside its own BEGIN IMMEDIATE transaction.
// Rank sale pays accrued J-BANK debt first, then adds the free proceeds to wallet.
// No newly minted winnings are committed unless the entire casino round settles.
 function forceCasinoSale(id,minimum){
  const need=BigInt(minimum);
  if(need<=0n)return {available:'0',sales:[]};
  const u=db.prepare('SELECT id,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
  if(!u)throw Error('카지노 신분 담보 계정을 찾을 수 없어.');
  let level=Number(u.rank_level||0);
  let balance=exactWallet.read(u),a=project(read(id,kstDate()),kstDate()),debt=BigInt(a.principal)+BigInt(a.interest);
  let available=0n;
  const sales=[],at=now();
  const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
  while(available<need&&level>0){
   const price=purchasedRankBasis(id,level)*SELL_RATE_BP/10000n;
   const applied=price<debt?price:debt,net=price-applied;
   const paidInterest=applied<BigInt(a.interest)?applied:BigInt(a.interest);
   a.interest=String(BigInt(a.interest)-paidInterest);
   a.principal=String(BigInt(a.principal)-(applied-paidInterest));
   a.totalRepaid=String(BigInt(a.totalRepaid)+applied);
   if(applied===debt&&debt>0n)a.closedAt=at;
   const from=levels[level].name,to=levels[level-1].name;
   const grossBalance=balance+price;balance=grossBalance-applied;
   ledger.run(id,exactWallet.mirror(price),exactWallet.mirror(grossBalance),String(price),String(grossBalance),'casino_rank_sale',from+' → '+to+' 신분 강제 매각 99%',at);
   if(applied>0n)ledger.run(id,exactWallet.mirror(-applied),exactWallet.mirror(balance),String(-applied),String(balance),'casino_rank_bank_repay','카지노 매각대금으로 J-BANK 선순위 채무 상환',at);
   sales.push({from,to,price:String(price),bankRepay:String(applied),net:String(net)});
   available+=net;debt-=applied;level--;
   a.saleCount=Number(a.saleCount||0)+1;
   a.lastRankSale={fromLevel:level+1,toLevel:level,fromName:from,toName:to,salePrice:String(price),repaid:String(applied),remainingDebt:String(debt),cashBack:String(net),at,forcedBy:'casino'};
  }
  if(available<need)throw Error('매각 가능한 신분가치로 카지노 손실을 지급할 수 없어.');
  const mirror=exactWallet.mirror(balance);
  db.prepare('UPDATE users SET rank_level=?,balance=?,balance_exact=?,balance_base=? WHERE id=?').run(level,mirror,String(balance),String(mirror),id);
  store(id,a);
  return {available:String(available),sales};
 }

 // Voluntary one-tier downgrade. A failed repayment never triggers an involuntary sale.
 function sellRank(userId,confirmation,requestId){
  const id=Number(userId);
  if(!Number.isSafeInteger(id)||id<1)throw Error('잘못된 계정입니다.');
  if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId))throw Error('은행 요청 번호 오류');
  if(!confirmation||typeof confirmation!=='object')throw Error('신분 매각 확인 정보가 필요합니다.');
  const expectedLevel=Number(confirmation.level),expectedDebt=String(confirmation.debt??''),expectedPrice=String(confirmation.price??'');
  if(!Number.isSafeInteger(expectedLevel)||!/^[1-9][0-9]*$/.test(expectedDebt)||!/^[1-9][0-9]*$/.test(expectedPrice))
   throw Error('신분 매각 확인 정보가 올바르지 않습니다.');
  db.exec('BEGIN IMMEDIATE');
  try{
   const receiptKey='jbank:receipt:'+id+':sellRank:'+requestId;
   const previousRow=db.prepare('SELECT value FROM game_state WHERE key=?').get(receiptKey);
   if(previousRow){
    const prev=JSON.parse(previousRow.value);
    if(prev.level!==expectedLevel||prev.debt!==expectedDebt||prev.price!==expectedPrice)throw Error('이미 다른 조건으로 처리된 매각 요청입니다.');
    db.exec('COMMIT');return {ok:true,duplicate:true,sale:prev.sale,status:status(id)};
   }
   if(db.prepare("SELECT 1 FROM room_escrow WHERE user_id=? AND game LIKE 'casino_%' LIMIT 1").get(id))throw Error('카지노 대국 중에는 담보 신분을 직접 매각할 수 없습니다.');
   const u=db.prepare('SELECT id,is_disabled,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
   if(!u||u.is_disabled)throw Error('현재 계정은 은행 매각을 이용할 수 없습니다.');
   const level=Number(u.rank_level||0);
   if(level<=0||level>=levels.length)throw Error('매각 가능한 신분이 없습니다.');
   const a=project(read(id,kstDate()),kstDate()),debt=BigInt(a.principal)+BigInt(a.interest);
   if(debt<=0n)throw Error('신분 매각은 상환할 대출이 있을 때만 가능합니다.');
   const proceeds=purchasedRankBasis(id,level)*SELL_RATE_BP/10000n;
   if(proceeds<=0n)throw Error('매각할 신분 가치가 없습니다.');
   if(expectedLevel!==level||expectedDebt!==String(debt)||expectedPrice!==String(proceeds))
    throw Error('신분 매각 조건이 변경됐습니다. 은행을 새로 열고 다시 확인하세요.');
   const applied=proceeds<debt?proceeds:debt;
   const paidInterest=applied<BigInt(a.interest)?applied:BigInt(a.interest);
   a.interest=String(BigInt(a.interest)-paidInterest);
   a.principal=String(BigInt(a.principal)-(applied-paidInterest));
   a.totalRepaid=String(BigInt(a.totalRepaid)+applied);
   if(debt===applied)a.closedAt=now();
   const before=exactWallet.read(u),creditBalance=before+proceeds,finalBalance=creditBalance-applied,mirror=exactWallet.mirror(finalBalance),at=now();
   const sale={fromLevel:level,toLevel:level-1,fromName:levels[level].name,toName:levels[level-1].name,
     salePrice:String(proceeds),repaid:String(applied),remainingDebt:String(debt-applied),cashBack:String(proceeds-applied),at};
   a.lastRankSale=sale;a.saleCount=Number(a.saleCount||0)+1;
   db.prepare('UPDATE users SET rank_level=?,balance=?,balance_exact=?,balance_base=? WHERE id=?').run(level-1,mirror,String(finalBalance),String(mirror),id);
   store(id,a);
   const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
   ledger.run(id,exactWallet.mirror(proceeds),exactWallet.mirror(creditBalance),String(proceeds),String(creditBalance),'jbank_rank_sale',
     'J-BANK 신분 매각 '+sale.fromName+' → '+sale.toName+' · 승급비의 99%',at);
   ledger.run(id,exactWallet.mirror(-applied),mirror,String(-applied),String(finalBalance),'jbank_rank_sale_repay',
     'J-BANK 신분 매각대금 자동 상환 · 이자 '+paidInterest+' G',at);
   db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(receiptKey,JSON.stringify({level:expectedLevel,debt:expectedDebt,price:expectedPrice,sale}),at);
   db.exec('COMMIT');return {ok:true,duplicate:false,sale,status:status(id)};
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }

 // Loan-financed purchases run inside the caller's BEGIN IMMEDIATE transaction.
 // The loan and item transfer must commit or roll back together; never leave an
 // involuntary loan when an item is sold out or the purchase fails.
 function purchaseQuote(id,rawPrice){
  const price=BigInt(String(rawPrice)),u=db.prepare('SELECT id,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
  if(!u||u.is_disabled)throw Error('계정 상태를 확인할 수 없습니다.');
  const balance=exactWallet.read(u),shortage=price>balance?price-balance:0n;
  const statusNow=status(id);
  const minimum=shortage>MIN_LOAN?shortage:MIN_LOAN;
  const activeCollateral=!!db.prepare("SELECT 1 FROM room_escrow WHERE user_id=? AND game LIKE 'casino_%' LIMIT 1").get(id);
  const eligible=shortage>0n&&statusNow.canBorrow&&!activeCollateral&&minimum<=BigInt(statusNow.available);
  return {eligible,shortage:String(shortage),loanAmount:String(eligible?minimum:0n),
   available:String(statusNow.available),minLoan:String(MIN_LOAN),outstanding:String(statusNow.outstanding),
   wallet:String(balance),dailyInterestPct:statusNow.dailyInterestPct,dueDays:7,blockedByCollateral:activeCollateral};
 }
 function borrowForPurchase(id,rawPrice,itemName){
  // Must only be called inside an existing transaction after ownership/rank checks.
  const q=purchaseQuote(id,rawPrice);
  if(!q.eligible)throw Error('현재 J-BANK 대출 한도로는 구매할 수 없어. 기존 대출·적금·담보 상태를 확인해줘.');
  const amount=BigInt(q.loanAmount),u=db.prepare('SELECT id,balance,balance_exact,balance_base,rank_level FROM users WHERE id=?').get(id);
  const record=project(read(id,kstDate()),kstDate()),level=Math.max(0,Math.min(levels.length-1,Number(u.rank_level||0)));
  if(BigInt(record.principal)+BigInt(record.interest)>0n||record.installment||amount>BigInt(LIMITS[level]))throw Error('은행 대출 조건이 변경됐어. 다시 확인해줘.');
  record.principal=String(amount);record.interest='0';record.openedAt=now();record.closedAt=0;
  record.number=Number(record.number||0)+1;record.totalBorrowed=String(BigInt(record.totalBorrowed)+amount);
  const after=exactWallet.read(u)+amount,mirror=exactWallet.mirror(after),at=now();
  db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(mirror,String(after),String(mirror),id);
  store(id,record);
  db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
   .run(id,exactWallet.mirror(amount),mirror,String(amount),String(after),'jbank_purchase_loan',
    'J-BANK 아이템 대출구매 · '+String(itemName||'명품 구매').slice(0,55),at);
  return {loanAmount:String(amount),afterLoanBalance:String(after)};
 }
  return {status,owed,baseOwed,setCredit:(credit)=>{creditBank=credit;},
   enforceOverdue:(id)=>{const base=overdue.enforce(id),asset=creditBank?creditBank.enforce(id):{processed:false};return {...base,processed:!!(base.processed||asset.processed),base,asset};},
   purchaseQuote,borrowForPurchase,rankResaleBasis:purchasedRankBasis,limits:LIMITS,...Object.fromEntries(['installmentOpen','installmentPay','installmentClaim','installmentCancel'].map(kind=>[kind,(id,raw,key)=>change(id,kind,raw,key)])),deposit:(id,amount,key)=>change(id,'deposit',amount,key),withdraw:(id,amount,key)=>change(id,'withdraw',amount,key),borrow:(id,amount,key)=>change(id,'borrow',amount,key),repay:(id,amount,key)=>change(id,'repay',amount,key),sellRank,forceCasinoSale,rehabilitation:overdue.rehabilitation};
}
module.exports={createJBank,LIMITS,RATE_BP,SELL_RATE_BP};
