'use strict';
const installment=require('./j-bank-installment');
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
function createJBank({db,exactWallet,levels,now,kstDate}){
 const accountKey=id=>'jbank:account:'+Number(id);
 function empty(day){return {principal:'0',interest:'0',asOf:day,openedAt:0,closedAt:0,number:0,totalBorrowed:'0',totalRepaid:'0',lastRankSale:null,saleCount:0,savingsPrincipal:'0',savingsInterest:'0',savingsEarned:'0',savingsRemainder:'0',savingsAt:now(),savingsLockedUntil:0,installment:null,lastInstallment:null};}
 function read(id,day=kstDate()){const r=db.prepare('SELECT value FROM game_state WHERE key=?').get(accountKey(id));return r?{...empty(day),...JSON.parse(r.value)}:empty(day);}
 function project(record,day=kstDate()){
  const r={...record},elapsed=Math.max(0,dayNumber(day)-dayNumber(r.asOf)),principal=BigInt(r.principal);
  // Charge only on outstanding principal; interest does not compound.
  if(elapsed&&principal>0n)r.interest=String(BigInt(r.interest)+(principal*RATE_BP*BigInt(elapsed)+9999n)/10000n);
  r.asOf=day;
  const at=now(),elapsedMs=Math.max(0,at-Math.max(Number(r.savingsAt??at),Number(r.savingsLockedUntil||0))),denom=10000n*86400000n;
  const numerator=BigInt(r.savingsPrincipal||'0')*5n*BigInt(Math.floor(elapsedMs))+BigInt(r.savingsRemainder||'0');
  const earned=numerator/denom;
  r.savingsInterest=String(BigInt(r.savingsInterest||'0')+earned);
  r.savingsEarned=String(BigInt(r.savingsEarned||'0')+earned);
  r.savingsRemainder=String(numerator%denom);r.savingsAt=Math.max(at,Number(r.savingsAt??at));
  return r;
 }
 function owed(id,day=kstDate()){const x=project(read(id,day),day);return BigInt(x.principal)+BigInt(x.interest);}
 function store(id,record){db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(accountKey(id),JSON.stringify(record),now());}
 function status(id,day=kstDate()){
  const u=db.prepare('SELECT id,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
  if(!u)throw Error('은행 회원을 찾을 수 없습니다.');
  const level=Math.max(0,Math.min(levels.length-1,Number(u.rank_level||0))),r=project(read(id,day),day);
  const debt=BigInt(r.principal)+BigInt(r.interest),limit=LIMITS[level];
  const price=level>0?BigInt(String(levels[level].cost))*SELL_RATE_BP/10000n:0n;
  const pay=price<debt?price:debt;
  const rankSale=debt>0n&&level>0?{fromLevel:level,fromName:levels[level].name,toLevel:level-1,toName:levels[level-1].name,
   salePrice:String(price),repayAmount:String(pay),remainingDebt:String(debt-pay),cashBack:String(price-pay),saleRatePct:99}:null;
  const savings={principal:r.savingsPrincipal,interest:r.savingsInterest,total:String(BigInt(r.savingsPrincipal)+BigInt(r.savingsInterest)),totalEarned:r.savingsEarned,dailyInterestPct:'0.05',withdrawAvailableAt:Number(r.savingsLockedUntil||0),canWithdraw:now()>=Number(r.savingsLockedUntil||0),canDeposit:debt===0n};
  return {installment:installment.view(r.installment,now()),installmentProducts:installment.PRODUCTS,lastInstallment:r.lastInstallment,savings,name:'J-BANK',rank:{level,name:levels[level].name},loanLimit:limit,minLoan:String(MIN_LOAN),
   dailyInterestPct:'0.1',interestMethod:'simple',principal:r.principal,interest:r.interest,
   outstanding:String(debt),canBorrow:debt===0n&&!r.installment,canPromote:debt===0n,available:debt===0n&&!r.installment?limit:'0',
   wallet:exactWallet.output(exactWallet.read(u)),openedAt:r.openedAt,closedAt:r.closedAt,
   totalBorrowed:r.totalBorrowed,totalRepaid:r.totalRepaid,canSellRank:!!rankSale,rankSale,lastRankSale:r.lastRankSale,saleCount:r.saleCount||0};
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
    // Each new deposit begins a 24-hour no-interest/no-withdrawal hold.
    a.savingsLockedUntil=now()+86400000;
    a.savingsAt=now();a.savingsRemainder='0';
    delta=-amount;type='jbank_deposit';memo='J-BANK 자유저축 입금';
   }else if(kind==='withdraw'){
    if(now()<Number(a.savingsLockedUntil||0))throw Error('저축 입금 후 최소 24시간이 지나야 이자와 출금이 가능합니다.');
    const total=BigInt(a.savingsPrincipal)+BigInt(a.savingsInterest),amount=text==='all'?total:BigInt(text);
    if(amount<=0n||amount>total)throw Error('출금 가능한 저축 잔액을 확인하세요.');
    const paidInterest=amount<BigInt(a.savingsInterest)?amount:BigInt(a.savingsInterest);
    a.savingsInterest=String(BigInt(a.savingsInterest)-paidInterest);
    a.savingsPrincipal=String(BigInt(a.savingsPrincipal)-(amount-paidInterest));
    delta=amount;type='jbank_withdraw';memo='J-BANK 저축 출금 · 이자 '+paidInterest+' G';
   }else if(kind==='borrow'){
    if(a.installment)throw Error('적금 만기 수령 또는 해지 후 대출할 수 있습니다.');
    const amount=BigInt(text),level=Math.max(0,Math.min(levels.length-1,Number(u.rank_level||0)));
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
   const u=db.prepare('SELECT id,is_disabled,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
   if(!u||u.is_disabled)throw Error('현재 계정은 은행 매각을 이용할 수 없습니다.');
   const level=Number(u.rank_level||0);
   if(level<=0||level>=levels.length)throw Error('매각 가능한 신분이 없습니다.');
   const a=project(read(id,kstDate()),kstDate()),debt=BigInt(a.principal)+BigInt(a.interest);
   if(debt<=0n)throw Error('신분 매각은 상환할 대출이 있을 때만 가능합니다.');
   const proceeds=BigInt(String(levels[level].cost))*SELL_RATE_BP/10000n;
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

 return {status,owed,limits:LIMITS,...Object.fromEntries(['installmentOpen','installmentPay','installmentClaim','installmentCancel'].map(kind=>[kind,(id,raw,key)=>change(id,kind,raw,key)])),deposit:(id,amount,key)=>change(id,'deposit',amount,key),withdraw:(id,amount,key)=>change(id,'withdraw',amount,key),borrow:(id,amount,key)=>change(id,'borrow',amount,key),repay:(id,amount,key)=>change(id,'repay',amount,key),sellRank};
}
module.exports={createJBank,LIMITS,RATE_BP,SELL_RATE_BP};
