'use strict';
// J-BANK uses existing persisted game_state, exact-wallet and atomic SQLite transactions.
const LIMITS=Object.freeze([
 '5000000','30000000','100000000','500000000','1000000000',
 '3000000000','10000000000','50000000000','100000000000',
 '1000000000000','10000000000000','1000000000000000',
 '100000000000000000','300000000000000000'
]); // THE ABSOLUTE = 10경 G; GOD JUNJA = 30경 G.
const RATE_BP=10n,MIN_LOAN=1000000n; // 0.1% simple interest per KST day.
function dayNumber(s){const n=Date.parse(String(s)+'T00:00:00Z');if(!Number.isFinite(n))throw Error('이자 계산 날짜 오류');return Math.floor(n/86400000);}
function positive(raw){if(typeof raw!=='string'||!/^[1-9][0-9]{0,79}$/.test(raw))throw Error('금액은 1G 이상의 정수여야 합니다.');return BigInt(raw);}
function createJBank({db,exactWallet,levels,now,kstDate}){
 const accountKey=id=>'jbank:account:'+Number(id);
 function empty(day){return {principal:'0',interest:'0',asOf:day,openedAt:0,closedAt:0,number:0,totalBorrowed:'0',totalRepaid:'0'};}
 function read(id,day=kstDate()){const r=db.prepare('SELECT value FROM game_state WHERE key=?').get(accountKey(id));return r?{...empty(day),...JSON.parse(r.value)}:empty(day);}
 function project(record,day=kstDate()){
  const r={...record},elapsed=Math.max(0,dayNumber(day)-dayNumber(r.asOf)),principal=BigInt(r.principal);
  // Charge only on outstanding principal; interest does not compound.
  if(elapsed&&principal>0n)r.interest=String(BigInt(r.interest)+(principal*RATE_BP*BigInt(elapsed)+9999n)/10000n);
  r.asOf=day;return r;
 }
 function owed(id,day=kstDate()){const x=project(read(id,day),day);return BigInt(x.principal)+BigInt(x.interest);}
 function store(id,record){db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(accountKey(id),JSON.stringify(record),now());}
 function status(id,day=kstDate()){
  const u=db.prepare('SELECT id,rank_level,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
  if(!u)throw Error('은행 회원을 찾을 수 없습니다.');
  const level=Math.max(0,Math.min(levels.length-1,Number(u.rank_level||0))),r=project(read(id,day),day);
  const debt=BigInt(r.principal)+BigInt(r.interest),limit=LIMITS[level];
  return {name:'J-BANK',rank:{level,name:levels[level].name},loanLimit:limit,minLoan:String(MIN_LOAN),
   dailyInterestPct:'0.1',interestMethod:'simple',principal:r.principal,interest:r.interest,
   outstanding:String(debt),canBorrow:debt===0n,canPromote:debt===0n,available:debt===0n?limit:'0',
   wallet:exactWallet.output(exactWallet.read(u)),openedAt:r.openedAt,closedAt:r.closedAt,
   totalBorrowed:r.totalBorrowed,totalRepaid:r.totalRepaid};
 }
 function change(id,kind,raw,requestId){
  id=Number(id);
  if(!Number.isSafeInteger(id)||id<1)throw Error('잘못된 계정입니다.');
  if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId))throw Error('은행 요청 번호 오류');
  const text=kind==='repay'&&raw==='all'?'all':String(positive(raw));
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
   if(kind==='borrow'){
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
 return {status,owed,limits:LIMITS,borrow:(id,amount,key)=>change(id,'borrow',amount,key),repay:(id,amount,key)=>change(id,'repay',amount,key)};
}
module.exports={createJBank,LIMITS,RATE_BP};
