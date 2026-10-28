'use strict';
// J-STOCK: fictional, game-money-only shares. All prices/holdings are authoritative on the server.
// Integer G prices and BigInt wallet math avoid losing large JUNJA LAND balances.
const crypto=require('node:crypto');
const STOCKS=Object.freeze([
 {id:'A',name:'준자반도체',sector:'반도체·AI',base:100000,vol:750,icon:'💻'},
 {id:'B',name:'준자물산',sector:'유통·건설',base:75000,vol:450,icon:'🏢'},
 {id:'C',name:'준자엔터',sector:'문화·엔터',base:35000,vol:1150,icon:'🎤'},
 {id:'D',name:'준자바이오',sector:'신약·바이오',base:58000,vol:1450,icon:'🧬'},
 {id:'E',name:'준자에너지',sector:'친환경·에너지',base:45000,vol:850,icon:'⚡'}
]);
const MARKET_KEY='jstock:market:v1',FEE_BP=50n,MAX_SHARES=1000000000000000n,MAX_PRICE=100000000n,MIN_PRICE=100n;
// KST = UTC+09:00. Stock sessions open at 00:00, 06:00, 12:00 and 18:00 KST.
const MARKET_CADENCE_HOURS=6;
const hourOf=t=>Math.floor(t/3600000);
const sessionHour=t=>Math.floor((hourOf(t)+9)/MARKET_CADENCE_HOURS)*MARKET_CADENCE_HOURS-9;
function amount(value){if(typeof value!=='string'||!/^[1-9][0-9]{0,15}$/.test(value))throw Error('수량은 1주 이상의 정수로 입력해 주세요.');const n=BigInt(value);if(n>MAX_SHARES)throw Error('1회 거래 한도를 초과했습니다.');return n;}
function createJStocks({db,exactWallet,now=Date.now,randomInt=crypto.randomInt}){
 const stateKey=id=>'jstock:portfolio:'+id;
 function read(key){const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);return row?JSON.parse(row.value):null;}
 function write(key,value){db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,JSON.stringify(value),now());}
 function initial(h){return {hour:h,cadenceHours:MARKET_CADENCE_HOURS,stocks:Object.fromEntries(STOCKS.map(s=>[s.id,{price:String(s.base),changeBp:0,history:[s.base],event:null}]))};}
 function advance(m,h){
  // Catch up server-side on KST 00:00/06:00/12:00/18:00 boundaries only.
  // The same persisted market is shared by all users. Never derive prices in the browser.
  const skipped=Math.max(0,Math.floor((h-m.hour)/MARKET_CADENCE_HOURS)),steps=Math.min(skipped,56);
  for(let i=0;i<steps;i++)for(const s of STOCKS){
   const p=m.stocks[s.id],old=BigInt(p.price);
   let bp=randomInt(-s.vol,s.vol+1),event=null;
   if(randomInt(0,100)<3){
    const shock=randomInt(400,1101)*(randomInt(0,2)?1:-1);
    bp=Math.max(-2000,Math.min(2000,bp+shock));
    event=bp>=0?'호재 발표':'악재 발생';
   }
   let next=(old*BigInt(10000+bp)+5000n)/10000n;
   if(next<MIN_PRICE)next=MIN_PRICE;
   if(next>MAX_PRICE)next=MAX_PRICE;
   p.price=String(next);
   p.changeBp=old===0n?0:Number((next-old)*10000n/old);
   p.event=event;
   p.history=(Array.isArray(p.history)?p.history:[]).concat([Number(next)]).slice(-49);
  }
  m.hour=h;
  return m;
 }
 function insideMarket(){
  const h=sessionHour(now());let m=read(MARKET_KEY),changed=false;
  if(!m){m=initial(h);changed=true;}
  else if(!Number.isSafeInteger(m.hour)||!m.stocks||STOCKS.some(s=>!m.stocks[s.id]))throw Error('주식시장 저장 정보가 손상되었습니다. 관리자 확인이 필요합니다.');
  else if(m.cadenceHours!==MARKET_CADENCE_HOURS){
   // Upgrade existing hourly markets in place. Re-anchor the CURRENT quoted price
   // to this KST six-hour session without replaying missed hourly ticks.
   // Never touch jstock:portfolio:* holdings, users' wallets, or trading history.
   m.hour=h;m.cadenceHours=MARKET_CADENCE_HOURS;changed=true;
  }
  else if(h>m.hour){m=advance(m,h);changed=true;}
  if(changed)write(MARKET_KEY,m);
  return {market:m,changed};
 }
 function currentMarket(){
  const h=sessionHour(now()),cached=read(MARKET_KEY);
  if(cached&&cached.cadenceHours===MARKET_CADENCE_HOURS&&cached.hour>=h)return {market:cached,changed:false};
  db.exec('BEGIN IMMEDIATE');
  try{const r=insideMarket();db.exec('COMMIT');return r;}
  catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }
 function empty(){return {holdings:{},realized:'0',invested:'0',returned:'0',trades:[]};}
 function portfolio(id){return {...empty(),...(read(stateKey(id))||{})};}
 function user(id){id=Number(id);if(!Number.isSafeInteger(id)||id<1)throw Error('잘못된 계정입니다.');
  const u=db.prepare('SELECT id,nickname,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?').get(id);
  if(!u||u.is_disabled)throw Error('거래 가능한 계정이 아닙니다.');return u;}
 function valuation(p,m){
  let value=0n,cost=0n;
  const holdings=STOCKS.map(s=>{
   const h=p.holdings[s.id]||{},qty=BigInt(h.qty||'0'),spent=BigInt(h.cost||'0'),current=qty*BigInt(m.stocks[s.id].price);
   value+=current;cost+=spent;
   return {id:s.id,quantity:String(qty),cost:String(spent),value:String(current),unrealized:String(current-spent)};
  });
  return {holdings,marketValue:String(value),cost:String(cost),unrealized:String(value-cost),realized:String(p.realized||'0')};
 }
 function ranking(m){
  const rows=db.prepare("SELECT u.nickname,g.value FROM game_state g JOIN users u ON g.key=('jstock:portfolio:' || u.id) WHERE g.key LIKE 'jstock:portfolio:%' AND COALESCE(u.is_disabled,0)=0").all();
  return rows.map(row=>{
   try{const p=JSON.parse(row.value),v=valuation(p,m);return {nickname:row.nickname,profit:String(BigInt(v.unrealized)+BigInt(v.realized))};}catch{return null;}
  }).filter(Boolean).sort((a,b)=>{const x=BigInt(a.profit),y=BigInt(b.profit);return x===y?0:x>y?-1:1;}).slice(0,10);
 }
 function status(id){
  const u=user(id),r=currentMarket(),m=r.market,p=portfolio(id),v=valuation(p,m);
  return {ok:true,changed:r.changed,serverNow:now(),nextTickAt:(m.hour+MARKET_CADENCE_HOURS)*3600000,feeBp:Number(FEE_BP),wallet:String(exactWallet.read(u)),
   stocks:STOCKS.map(s=>({...s,price:m.stocks[s.id].price,changeBp:m.stocks[s.id].changeBp,history:m.stocks[s.id].history,event:m.stocks[s.id].event})),
   ...v,trades:p.trades.slice(0,12),ranking:ranking(m)};
 }
 function trade(id,side,stockId,rawQty,requestId){
  if(side!=='buy'&&side!=='sell')throw Error('매수 또는 매도를 선택해 주세요.');
  const s=STOCKS.find(x=>x.id===stockId);
  if(!s)throw Error('상장 종목을 선택해 주세요.');
  const qty=amount(rawQty);
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(requestId))throw Error('거래 요청번호가 올바르지 않습니다.');
  const uId=Number(id);user(uId);
  const receiptKey='jstock:receipt:'+uId+':'+requestId;
  db.exec('BEGIN IMMEDIATE');
  try{
   const previous=read(receiptKey);
   if(previous){
    if(previous.side!==side||previous.stockId!==stockId||previous.quantity!==String(qty))throw Error('이미 다른 거래에 사용된 요청번호입니다.');
    db.exec('COMMIT');
    return {ok:true,duplicate:true,receipt:previous,status:status(uId)};
   }
   const u=user(uId),m=insideMarket().market,p=portfolio(uId),price=BigInt(m.stocks[stockId].price),gross=price*qty,fee=(gross*FEE_BP+9999n)/10000n;
   const balance=exactWallet.read(u),h=p.holdings[stockId]||{qty:'0',cost:'0'},owned=BigInt(h.qty),oldCost=BigInt(h.cost);
   let delta,realized=0n;
   if(side==='buy'){
    delta=-(gross+fee);
    if(balance+delta<0n)throw Error('매수 가능한 게임머니가 부족합니다.');
    h.qty=String(owned+qty);h.cost=String(oldCost+gross+fee);
    p.invested=String(BigInt(p.invested)+gross+fee);
   }else{
    if(qty>owned)throw Error('보유 주식보다 많이 매도할 수 없습니다.');
    delta=gross-fee;
    const basis=oldCost*qty/owned;
    realized=delta-basis;
    h.qty=String(owned-qty);h.cost=String(oldCost-basis);
    if(owned===qty)h.cost='0';
    p.realized=String(BigInt(p.realized)+realized);
    p.returned=String(BigInt(p.returned)+delta);
   }
   p.holdings[stockId]=h;
   const t=now(),newBalance=balance+delta,mirror=exactWallet.mirror(newBalance);
   db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?').run(mirror,String(newBalance),String(mirror),uId);
   write(stateKey(uId),{...p,trades:[{at:t,side,stockId,quantity:String(qty),price:String(price),gross:String(gross),fee:String(fee),net:String(delta),realized:String(realized)},...(p.trades||[])].slice(0,30)});
   db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(uId,exactWallet.mirror(delta),mirror,String(delta),String(newBalance),side==='buy'?'jstock_buy':'jstock_sell','J-STOCK '+s.name+' '+(side==='buy'?'매수':'매도')+' '+qty+'주 · 수수료 '+fee+' G',t);
   const receipt={side,stockId,quantity:String(qty),price:String(price),gross:String(gross),fee:String(fee),net:String(delta),realized:String(realized),at:t};
   write(receiptKey,receipt);
   db.exec('COMMIT');
   return {ok:true,duplicate:false,receipt,status:status(uId)};
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }
 return {status,trade};
}
module.exports={createJStocks,STOCKS,MARKET_KEY,FEE_BP,MARKET_CADENCE_HOURS,sessionHour};