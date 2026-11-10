'use strict';
// J-CREDIT: additional, non-rank asset-backed credit. Values are exact BigInts.
// Full current cash + savings principal + installments principal + quoted shares/
// coins + 75%-buyback-value unlisted royal collectibles form the collateral base.
// Rank titles and already pledged auction lots are deliberately excluded.
const {addTradingFee}=require('./slot-jackpot-pool');
const DAY=86400000,MIN_LOAN=1000000n,RATE_BP=20n,LOAN_BP=5000n;
const STOCK_FEE_BP=50n,COIN_FEE_BP=20n;
const STOCK_SCALE=1n,COIN_SCALE=10000n;
const VALID_REQUEST=/^[A-Za-z0-9_-]{12,80}$/;
function dayNumber(date){
 const n=Date.parse(String(date)+'T00:00:00Z');
 if(!Number.isFinite(n))throw Error('신용대출 이자 계산 날짜가 유효하지 않습니다.');
 return Math.floor(n/DAY);
}
const ceil=(a,b)=>(a+b-1n)/b;
function createJCredit({db,exactWallet,now,kstDate,items,royalMarket}){
 const catalog=new Map(items.map(x=>[x.id,x]));
 const getKey=db.prepare('SELECT value FROM game_state WHERE key=?');
 const putKey=db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
 const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
 const selectUser=db.prepare('SELECT id,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?');
 const updateBalance=db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?');
 const inEscrow=db.prepare('SELECT 1 FROM room_escrow WHERE user_id=? LIMIT 1');
 const inventory=db.prepare('SELECT item_id FROM user_inventory WHERE user_id=?');
 const auctions=db.prepare("SELECT value FROM game_state WHERE key LIKE 'royal:auction:lot:%'");
 const key=id=>'jcredit:account:'+Number(id);
 const safeParse=(value,def=null)=>{try{return value==null?def:JSON.parse(value)}catch{return def}};
 const get=(k,def=null)=>safeParse(getKey.get(k)?.value,def);
 const put=(k,v)=>putKey.run(k,JSON.stringify(v),now());
 const empty=()=>({number:0,principal:'0',interest:'0',asOf:kstDate(),openedAt:0,closedAt:0,totalBorrowed:'0',totalRepaid:'0',lastCollectionAt:0,collections:0});
 const read=id=>({...empty(),...(get(key(id))||{})});
 const due=a=>BigInt(a.principal||'0')+BigInt(a.interest||'0');
 function project(record){
  const a={...record},days=Math.max(0,dayNumber(kstDate())-dayNumber(a.asOf||kstDate()));
  if(days&&BigInt(a.principal||'0')>0n)
   a.interest=String(BigInt(a.interest||'0')+ceil(BigInt(a.principal)*RATE_BP*BigInt(days),10000n));
  a.asOf=kstDate();
  return a;
 }
 function owner(id){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1)throw Error('회원 계정번호가 올바르지 않습니다.');
  const u=selectUser.get(n);
  if(!u||u.is_disabled)throw Error('현재 계정은 신용대출을 이용할 수 없습니다.');
  return u;
 }
 function walletWrite(id,value,delta,type,memo){
  if(value<0n)throw Error('신용대출 정산 중 잔액 부족');
  const mirror=exactWallet.mirror(value);
  updateBalance.run(mirror,String(value),String(mirror),id);
  if(delta!==0n)ledger.run(id,exactWallet.mirror(delta),mirror,String(delta),String(value),type,memo,now());
 }
 function marketTotal(id,kind,scale){
  const p=get(kind+':portfolio:'+id);
  if(!p||!p.holdings)return 0n;
  const quote=get(kind+':market:v1');
  let sum=0n;
  for(const [asset,h] of Object.entries(p.holdings)){
   const qty=BigInt(h.qty||'0');if(qty<=0n)continue;
   const price=quote?.stocks?.[asset]?.price;
   if(price==null||BigInt(price)<=0n)throw Error('보유 '+(kind==='jstock'?'주식':'코인')+' 시세를 확인할 수 없어 신용대출 한도를 계산하지 못했습니다.');
   sum+=qty*BigInt(price)/scale;
  }
  return sum;
 }
 function assetValues(id){
  const u=owner(id),cash=exactWallet.read(u),bank=get('jbank:account:'+id,{});
  const savings=BigInt(bank.savingsPrincipal||'0')+BigInt(bank.savingsInterest||'0');
  const installment=bank.installment?BigInt(bank.installment.amount||'0')*BigInt(bank.installment.payments?.length||0):0n;
  const stocks=marketTotal(id,'jstock',STOCK_SCALE),coins=marketTotal(id,'jcoin',COIN_SCALE);
  const listed=new Set(auctions.all().map(row=>safeParse(row.value)).filter(x=>x?.sellerId===Number(id)&&x.status==='OPEN').map(x=>x.itemId));
  let luxury=0n;const owned=[];
  for(const row of inventory.all(id)){
   const item=catalog.get(row.item_id);
   if(!item||listed.has(item.id))continue;
   const value=BigInt(item.price)*75n/100n;
   if(value<=0n)continue;
   luxury+=value;
   owned.push({id:item.id,name:item.name,bankValue:String(value)});
  }
  const gross=cash+savings+installment+stocks+coins+luxury;
  return {cash,savings,installment,stocks,coins,luxury,gross,owned};
 }
 function owed(id){return due(project(read(id)));}
 function status(id){
  const u=owner(id),a=project(read(id)),assets=assetValues(id);
  const debt=due(a),bank=get('jbank:account:'+id,{});
  const rankDebt=BigInt(bank.principal||'0')+BigInt(bank.interest||'0');
  const netAssets=assets.gross>debt+rankDebt?assets.gross-debt-rankDebt:0n;
  const limit=netAssets*LOAN_BP/10000n,locked=!!inEscrow.get(id);
  const canBorrow=debt===0n&&rankDebt===0n&&!locked&&limit>=MIN_LOAN;
  const reason=debt>0n?'기존 신용대출을 완납해야 다시 신청할 수 있습니다.':
   rankDebt>0n?'신분 대출 원금·이자를 완납한 뒤 신청할 수 있습니다.':
   locked?'진행 중인 게임의 예치금이 있어 게임 종료 후 신청할 수 있습니다.':
   limit<MIN_LOAN?'평가자산이 부족해 최소 100만 G를 대출할 수 없습니다.':'';
  return {dailyInterestPct:'0.2',termDays:7,assetRatioPct:50,
   valuationBasis:'보유머니+자유저축+적금원금+주식시가+코인시가+명품 은행매입가(75%)',
   assets:{cash:String(assets.cash),savings:String(assets.savings),installment:String(assets.installment),
    stocks:String(assets.stocks),coins:String(assets.coins),luxury:String(assets.luxury),gross:String(assets.gross),net:String(netAssets)},
   creditLimit:String(limit),available:String(canBorrow?limit:0n),minLoan:String(MIN_LOAN),
   principal:a.principal,interest:a.interest,outstanding:String(debt),
   canBorrow,blockedReason:reason,openedAt:a.openedAt,
   dueAt:debt>0n&&a.openedAt?Number(a.openedAt)+7*DAY:null,
   overdue:debt>0n&&a.openedAt>0&&now()>Number(a.openedAt)+7*DAY,
   collections:Number(a.collections||0),lastCollectionAt:a.lastCollectionAt||0};
 }
 function change(id,kind,raw,requestId){
  id=Number(id);owner(id);
  if(typeof requestId!=='string'||!VALID_REQUEST.test(requestId))throw Error('신용대출 거래 요청 번호가 잘못됐습니다.');
  const text=kind==='repay'&&raw==='all'?'all':String(raw??'');
  if(text!=='all'&&!/^[1-9][0-9]{0,79}$/.test(text))throw Error('금액은 1G 이상의 정수로 입력해 주세요.');
  if(kind==='borrow'&&text==='all')throw Error('대출 금액을 입력해 주세요.');
  const receipt='jcredit:receipt:'+id+':'+kind+':'+requestId;
  db.exec('BEGIN IMMEDIATE');
  try{
   const previous=get(receipt);
   if(previous){
    if(previous.amount!==text)throw Error('이미 사용한 요청 번호입니다.');
    db.exec('COMMIT');return {ok:true,duplicate:true,status:null};
   }
   const a=project(read(id)),old=exactWallet.read(owner(id)),debt=due(a);
   let delta=0n,type,memo;
   if(kind==='borrow'){
    const q=status(id),amount=BigInt(text);
    if(!q.canBorrow)throw Error(q.blockedReason||'현재 신용대출을 신청할 수 없습니다.');
    if(amount<MIN_LOAN||amount>BigInt(q.available))throw Error('신용대출은 최소 100만 G부터 총자산의 50% 이내에서 신청할 수 있습니다.');
    a.principal=String(amount);a.interest='0';a.asOf=kstDate();
    a.openedAt=now();a.closedAt=0;a.number=Number(a.number||0)+1;
    a.lastCollectionAt=0;a.collections=0;
    a.totalBorrowed=String(BigInt(a.totalBorrowed||0)+amount);
    delta=amount;type='jcredit_borrow';memo='자산 신용대출 · 평가자산의 50% · 일 0.2%';
   }else if(kind==='repay'){
    if(debt<=0n)throw Error('상환할 신용대출이 없습니다.');
    const amount=text==='all'?debt:BigInt(text);
    if(amount>debt)throw Error('남은 신용대출 상환액을 초과했습니다.');
    if(amount>old)throw Error('보유 게임머니가 부족합니다.');
    const interest=amount<BigInt(a.interest)?amount:BigInt(a.interest);
    a.interest=String(BigInt(a.interest)-interest);
    a.principal=String(BigInt(a.principal)-(amount-interest));
    a.totalRepaid=String(BigInt(a.totalRepaid||0)+amount);
    if(due(a)===0n)a.closedAt=now();
    delta=-amount;type='jcredit_repay';memo='자산 신용대출 상환 · 이자 '+interest+' G';
   }else throw Error('알 수 없는 신용대출 거래입니다.');
   walletWrite(id,old+delta,delta,type,memo);
   put(key(id),a);
   put(receipt,{amount:text,type,at:now()});
   db.exec('COMMIT');
   return {ok:true,duplicate:false,status:status(id)};
  }catch(e){try{db.exec('ROLLBACK')}catch{}throw e}
 }
 function repayDebt(a,amount){
  const payment=amount<due(a)?amount:due(a);
  if(payment<=0n)return 0n;
  const interest=payment<BigInt(a.interest)?payment:BigInt(a.interest);
  a.interest=String(BigInt(a.interest)-interest);
  a.principal=String(BigInt(a.principal)-(payment-interest));
  a.totalRepaid=String(BigInt(a.totalRepaid||0)+payment);
  if(due(a)===0n)a.closedAt=now();
  return payment;
 }
 function saleNet(qty,price,scale,feeBP){
  const gross=qty*price/scale;
  const fee=ceil(gross*feeBP,10000n);
  return {gross,fee,net:gross-fee};
 }
 // The smallest quantity whose after-fee proceeds cover the remaining debt.
 // If the full position is insufficient we sell it; never sell 0 units.
 function saleQuantity(total,price,scale,feeBP,amount){
  if(saleNet(total,price,scale,feeBP).net<=amount)return total;
  let lo=1n,hi=total;
  while(lo<hi){const mid=(lo+hi)/2n;
   if(saleNet(mid,price,scale,feeBP).net>=amount)hi=mid;
   else lo=mid+1n;
  }
  return lo;
 }
 function enforce(id){
  id=Number(id);if(!Number.isSafeInteger(id)||id<1)return {processed:false};
  const before=project(read(id));
  if(due(before)===0n||!before.openedAt||now()<=Number(before.openedAt)+7*DAY)return {processed:false};
  if(now()-Number(before.lastCollectionAt||0)<3600000)return {processed:false};
  if(inEscrow.get(id))return {processed:false,deferred:'active_game'};
  db.exec('BEGIN IMMEDIATE');
  try{
   const a=project(read(id));
   if(due(a)<=0n||now()<=Number(a.openedAt)+7*DAY){db.exec('COMMIT');return {processed:false}}
   const u=owner(id),startDebt=due(a),sales=[];
   let cash=exactWallet.read(u);
   const pay=reason=>{
    const amount=repayDebt(a,cash);
    if(amount>0n){
     cash-=amount;
     walletWrite(id,cash,-amount,'jcredit_overdue_repay','자산 신용대출 7일 연체 회수 · '+reason);
    }
   };
   const add=(amount,type,reason)=>{
    if(amount<=0n)return;
    cash+=amount;walletWrite(id,cash,amount,type,reason);
    sales.push({type,amount:String(amount)});
    pay(reason);
   };
   pay('보유머니');
   const baseKey='jbank:account:'+id,b=get(baseKey,{});
   if(due(a)>0n){
    const savings=BigInt(b.savingsPrincipal||0)+BigInt(b.savingsInterest||0);
    if(savings>0n){
     b.savingsPrincipal='0';b.savingsInterest='0';b.savingsRemainder='0';b.savingsLockedUntil=0;
     add(savings,'jcredit_sale_savings','자유저축 강제 회수');
    }
   }
   if(due(a)>0n&&b.installment){
    const inst=b.installment,principal=BigInt(inst.amount||0)*BigInt(inst.payments?.length||0);
    if(principal>0n){
     b.lastInstallment={id:inst.id,forced:true,closedAt:now(),principal:String(principal),paidInterest:'0'};
     b.installment=null;
     add(principal,'jcredit_sale_installment','적금 원금 강제 회수 (이자 미지급)');
    }
   }
   if(b.savingsPrincipal!==undefined||b.installment!==undefined)put(baseKey,b);
   const liquidation=(kind,scale,feeBP)=>{
    if(due(a)<=0n)return;
    const p=get(kind+':portfolio:'+id);
    if(!p?.holdings)return;
    const market=get(kind+':market:v1'),positions=Object.entries(p.holdings);
    let changed=false;
    for(const [asset,h] of positions){
     if(due(a)<=0n)break;
     const total=BigInt(h.qty||0);if(total<=0n)continue;
     const raw=market?.stocks?.[asset]?.price;
     if(raw==null||BigInt(raw)<=0n)throw Error('강제매각 '+kind+' '+asset+' 시장가 확인 실패');
     const price=BigInt(raw),full=saleNet(total,price,scale,feeBP);
     if(full.net<=0n)continue;
     const qty=saleQuantity(total,price,scale,feeBP,due(a));
     const receipt=saleNet(qty,price,scale,feeBP);
     if(receipt.net<=0n)continue;
     const oldCost=BigInt(h.cost||0),basis=oldCost*qty/total;
     h.qty=String(total-qty);h.cost=String(oldCost-basis);
     p.realized=String(BigInt(p.realized||0)+receipt.net-basis);
     p.returned=String(BigInt(p.returned||0)+receipt.net);
     p.trades=[{at:now(),side:'forced_sell',stockId:asset,quantity:String(qty),
       price:String(price),gross:String(receipt.gross),fee:String(receipt.fee),net:String(receipt.net),
       realized:String(receipt.net-basis)},...(p.trades||[])].slice(0,30);
     addTradingFee(db,receipt.fee,now());
     add(receipt.net,'jcredit_sale_'+kind,asset+' · 7일 연체 강제매각');
     changed=true;
    }
    if(changed)put(kind+':portfolio:'+id,p);
   };
   liquidation('jstock',STOCK_SCALE,STOCK_FEE_BP);
   liquidation('jcoin',COIN_SCALE,COIN_FEE_BP);
   if(due(a)>0n){
    for(const row of inventory.all(id)){
     if(due(a)<=0n)break;
     const item=catalog.get(row.item_id);
     if(!item||royalMarket.activeFor(id,item.id))continue;
     // Reuse the ordinary 75% bank redemption: ownership, certificate and
     // collection display all change atomically with this debt repayment.
     const redeemed=royalMarket.bankSellInTransaction(id,item.id);
     const amount=BigInt(redeemed.received);
     cash=exactWallet.read(owner(id));
     sales.push({type:'jcredit_sale_luxury',itemId:item.id,amount:String(amount)});
     pay('명품 '+item.name+' · 은행 매입');
    }
   }
   a.lastCollectionAt=now();a.collections=Number(a.collections||0)+1;
   put(key(id),a);
   db.exec('COMMIT');
   return {processed:true,from:String(startDebt),remaining:String(due(a)),sales,
    at:a.lastCollectionAt};
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 return {status,owed,borrow:(id,amount,key)=>change(id,'borrow',amount,key),
  repay:(id,amount,key)=>change(id,'repay',amount,key),enforce,
  constants:{rateBp:Number(RATE_BP),loanBp:Number(LOAN_BP),dueDays:7}};
}
module.exports={createJCredit,MIN_LOAN,RATE_BP,LOAN_BP,DAY};
