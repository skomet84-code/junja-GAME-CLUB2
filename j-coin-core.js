'use strict';
// J-COIN: fictional, game-money-only shares. All prices/holdings are authoritative on the server.
// Integer G prices and BigInt wallet math avoid losing large JUNJA LAND balances.
const crypto=require('node:crypto');
const STOCKS=Object.freeze([
 {id:'JJC',name:'준자코인',sector:'대표 코인',base:1000000,vol:600,icon:'👑'},
 {id:'ROY',name:'로얄코인',sector:'로열',base:500000,vol:800,icon:'💎'},
 {id:'MOON',name:'문코인',sector:'밈',base:10000,vol:1400,icon:'🚀'},
 {id:'DOGJ',name:'도지준자',sector:'밈',base:1000,vol:1450,icon:'🐶'},
 {id:'DRA',name:'드래곤코인',sector:'게임',base:100000,vol:1100,icon:'🐉'},
 {id:'OCN',name:'오션코인',sector:'해양',base:50000,vol:1000,icon:'🌊'},
 {id:'JAI',name:'AI코인',sector:'인공지능',base:200000,vol:1100,icon:'🤖'},
 {id:'JBK',name:'뱅크코인',sector:'금융',base:100000,vol:350,icon:'🏦'}
]);
const MARKET_KEY='jcoin:market:v1',FEE_BP=20n,MAX_SHARES=1000000000000000n,MAX_PRICE=100000000n,MIN_PRICE=100n;
const STOCK_CATALOG_VERSION=1;
const ORIGINAL_STOCK_IDS=Object.freeze(STOCKS.map(s=>s.id));
const initialQuote=s=>({price:String(s.base),changeBp:0,history:[s.base],event:null});
// KST = UTC+09:00. Stock sessions open at 00:00, 06:00, 12:00 and 18:00 KST.
const MARKET_CADENCE_HOURS=0.25;
const sessionHour=t=>Math.floor(t/900000)*0.25;
function amount(value){if(typeof value!=='string'||!/^(?:[1-9][0-9]{0,10}(?:\.[0-9]{1,4})?|0\.[0-9]{1,4})$/.test(value))throw Error('코인 수량은 소수점 4자리까지 입력하세요.');const [whole,fraction='']=value.split('.');const n=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));if(n>MAX_SHARES)throw Error('1회 거래 한도를 초과했습니다.');if(n<=0n)throw Error('수량은 0보다 커야 합니다.');return n;}
const formatQty=n=>(n/10000n).toString()+'.'+(n%10000n).toString().padStart(4,'0');
function createJCoins({db,exactWallet,now=Date.now,randomInt=crypto.randomInt}){
 const stateKey=id=>'jcoin:portfolio:'+id;
 function read(key){const row=db.prepare('SELECT value FROM game_state WHERE key=?').get(key);return row?JSON.parse(row.value):null;}
 function write(key,value){db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,JSON.stringify(value),now());}
 function initial(h){return {hour:h,cadenceHours:MARKET_CADENCE_HOURS,catalogVersion:STOCK_CATALOG_VERSION,stocks:Object.fromEntries(STOCKS.map(s=>[s.id,initialQuote(s)]))};}
 function advance(m,h,activeStocks=STOCKS){
  // Catch up server-side on KST 00:00/06:00/12:00/18:00 boundaries only.
  // The same persisted market is shared by all users. Never derive prices in the browser.
  const skipped=Math.max(0,Math.round((h-m.hour)/MARKET_CADENCE_HOURS)),steps=Math.min(skipped,96);
  for(let i=0;i<steps;i++)for(const s of activeStocks){
   const p=m.stocks[s.id],old=BigInt(p.price);
   let bp=randomInt(-s.vol,s.vol+1),event=null;
   if(randomInt(0,100)<3){
    const shock=randomInt(400,1101)*(randomInt(0,2)?1:-1);
    bp=Math.max(-1500,Math.min(1500,bp+shock));
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
  else {
   // Existing A-E remain authoritative. Never replace their current price,
   // history, owned quantities, wallet, or ledger during catalog expansion.
   if(!Number.isSafeInteger(m.hour)||!m.stocks||typeof m.stocks!=='object'||
      ORIGINAL_STOCK_IDS.some(id=>!m.stocks[id])||
      (m.catalogVersion!==undefined&&m.catalogVersion!==STOCK_CATALOG_VERSION)||
      (m.catalogVersion===STOCK_CATALOG_VERSION&&STOCKS.some(s=>!m.stocks[s.id])))
    throw Error('코인시장 저장 정보가 손상되었습니다. 관리자 확인이 필요합니다.');
   if(m.cadenceHours!==MARKET_CADENCE_HOURS){
    // Legacy hourly markets are re-anchored without extra interim ticks.
    m.hour=h;m.cadenceHours=MARKET_CADENCE_HOURS;changed=true;
   }else if(h>m.hour){
    // Apply missed sessions to previously listed stocks only. New listings
    // debut at their IPO base price, not an artificial historical price.
    m=advance(m,h,STOCKS.filter(s=>!!m.stocks[s.id]));changed=true;
   }
   if(m.catalogVersion!==STOCK_CATALOG_VERSION){
    for(const s of STOCKS)if(!m.stocks[s.id])m.stocks[s.id]=initialQuote(s);
    m.catalogVersion=STOCK_CATALOG_VERSION;changed=true;
   }
  }
  if(changed)write(MARKET_KEY,m);
  return {market:m,changed};
 }
 function currentMarket(){
  const h=sessionHour(now()),cached=read(MARKET_KEY);
  if(cached&&cached.cadenceHours===MARKET_CADENCE_HOURS&&cached.hour>=h&&cached.catalogVersion===STOCK_CATALOG_VERSION&&STOCKS.every(s=>cached.stocks?.[s.id]))return {market:cached,changed:false};
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
   return {id:s.id,quantity:formatQty(qty),cost:String(spent),value:String(current),unrealized:String(current-spent)};
  });
  return {holdings,marketValue:String(value),cost:String(cost),unrealized:String(value-cost),realized:String(p.realized||'0')};
 }
 function ranking(m){
  const rows=db.prepare("SELECT u.nickname,g.value FROM game_state g JOIN users u ON g.key=('jcoin:portfolio:' || u.id) WHERE g.key LIKE 'jcoin:portfolio:%' AND COALESCE(u.is_disabled,0)=0").all();
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
  if(side!=='buy'&&side!=='sell')throw Error('매수 또는 매도를 선택해 개세요.');
  const s=STOCKS.find(x=>x.id===stockId);
  if(!s)throw Error('상장 종목을 선택해 개세요.');
  const qty=amount(rawQty);
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(requestId))throw Error('거래 요청번호가 올바르지 않습니다.');
  const uId=Number(id);user(uId);
  const receiptKey='jcoin:receipt:'+uId+':'+requestId;
  db.exec('BEGIN IMMEDIATE');
  try{
   const previous=read(receiptKey);
   if(previous){
    if(previous.side!==side||previous.stockId!==stockId||previous.quantity!==formatQty(qty))throw Error('이미 다른 거래에 사용된 요청번호입니다.');
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
    if(qty>owned)throw Error('보유 코인보다 많이 매도할 수 없습니다.');
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
   write(stateKey(uId),{...p,trades:[{at:t,side,stockId,quantity:formatQty(qty),price:String(price),gross:String(gross),fee:String(fee),net:String(delta),realized:String(realized)},...(p.trades||[])].slice(0,30)});
   db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(uId,exactWallet.mirror(delta),mirror,String(delta),String(newBalance),side==='buy'?'jstock_buy':'jstock_sell','J-COIN '+s.name+' '+(side==='buy'?'매수':'매도')+' '+qty+'개 · 수수료 '+fee+' G',t);
   const receipt={side,stockId,quantity:formatQty(qty),price:String(price),gross:String(gross),fee:String(fee),net:String(delta),realized:String(realized),at:t};
   write(receiptKey,receipt);
   db.exec('COMMIT');
   return {ok:true,duplicate:false,receipt,status:status(uId)};
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }
 return {status,trade};
}
module.exports={createJCoins,STOCKS,MARKET_KEY,FEE_BP,MARKET_CADENCE_HOURS,sessionHour,STOCK_CATALOG_VERSION};