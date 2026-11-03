'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),wallet=require('../exact-wallet');
const {createJCoins,STOCKS,FEE_BP,sessionHour,buyCost,maxAffordableQty,formatQty}=require('../j-coin-core');
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,is_disabled INTEGER DEFAULT 0,balance INTEGER,balance_exact TEXT,balance_base TEXT);CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);');
const db={exec:q=>sql.exec(q),prepare:q=>{const s=sql.prepare(q);s.setReadBigInts(true);return s;}};
const starting=10000000n;
db.prepare('INSERT INTO users(id,nickname,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)').run(1,'코인테스터',wallet.mirror(starting),String(starting),String(wallet.mirror(starting)));
let now=Date.parse('2026-10-31T12:00:00+09:00');
const coin=createJCoins({db,exactWallet:wallet,now:()=>now,randomInt:(a,b)=>a});
assert.equal(STOCKS.length,8);assert.equal(FEE_BP,20n);
assert.equal(sessionHour(now)*3600000,now);
assert.equal(coin.status(1).stocks.length,8);
const bought=coin.trade(1,'buy','JJC','0.1250','coin-buy-request-0001');
assert.equal(bought.receipt.gross,'125000');assert.equal(bought.receipt.fee,'250');
assert.equal(bought.status.holdings[0].quantity,'0.1250');
assert.equal(bought.status.marketValue,'125000');
assert.equal(bought.status.cost,'125250');
assert.equal(bought.status.unrealized,'-250');
assert.equal(db.prepare('SELECT type FROM ledger ORDER BY id DESC LIMIT 1').get().type,'jcoin_buy');
assert.equal(bought.status.wallet,'9874750');
assert.equal(coin.trade(1,'buy','JJC','0.1250','coin-buy-request-0001').duplicate,true);
assert.throws(()=>coin.trade(1,'buy','JJC','0.00001','coin-bad-fraction1'),/수량/);
assert.throws(()=>coin.trade(1,'buy','DOGJ','0.0001','coin-zero-gross-1'),/최소 거래금액/);
assert.throws(()=>coin.trade(1,'sell','JJC','0.1251','coin-too-many-01'),/보유/);
const sold=coin.trade(1,'sell','JJC','0.1250','coin-sell-request-01');
assert.equal(sold.status.holdings[0].quantity,'0.0000');
assert.equal(sold.status.wallet,'9999500');
assert.equal(coin.status(1).changed,false);
now+=15*60000;
assert.equal(coin.status(1).changed,true);
assert.equal(coin.status(1).nextTickAt,now+15*60000);

// MAX buys must use the exact G balance and fee, not an arbitrary low
// coin-count cap. Both UI quotes and submitted MAX orders are server-side.
for(const price of [100n,1000n,1000000n,100000000n]){
 for(const balance of [0n,1n,2n,5n,100n,1000000n,10n**20n]){
  const qty=maxAffordableQty(balance,price);
  assert.ok(qty>=0n);
  if(qty){
   assert.ok(price*qty/10000n>=1n,'Minimum order is at least 1G');
   assert.ok(buyCost(price,qty)<=balance,'MAX must include the fee');
   assert.ok(buyCost(price,qty+1n)>balance,'MAX must not leave an affordable increment');
  }
 }
}
const whale=10n**21n+12345678n;
db.prepare('INSERT INTO users(id,nickname,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)')
 .run(2,'큰잔액테스터',wallet.mirror(whale),String(whale),String(wallet.mirror(whale)));
const before=coin.status(2),quote=before.stocks.find(s=>s.id==='JJC');
const maximum=quote.maxBuy,maxUnits=BigInt(maximum.replace('.',''));
assert.ok(maxUnits>1000000000000000n,'Old hard cap should no longer apply');
assert.equal(maximum,formatQty(maxAffordableQty(whale,BigInt(quote.price))));
const maxBought=coin.trade(2,'buy','JJC','MAX','jcoin-whale-max-purchase-01');
assert.equal(maxBought.receipt.quantity,maximum);
assert.equal(maxBought.receipt.requestQuantity,'MAX');
assert.equal(BigInt(maxBought.status.wallet),whale-buyCost(BigInt(quote.price),maxUnits));
assert.ok(BigInt(maxBought.status.wallet)>=0n);
assert.equal(maxBought.status.stocks.find(s=>s.id==='JJC').maxBuy,'0.0000');
assert.equal(coin.trade(2,'buy','JJC','MAX','jcoin-whale-max-purchase-01').duplicate,true);
assert.throws(()=>coin.trade(2,'buy','JJC','1.0000','jcoin-whale-max-purchase-01'),/이미 다른 거래/);
assert.throws(()=>coin.trade(2,'buy','JJC','MAX','jcoin-whale-no-money-01'),/잔액으로 매수/);
// The exact MAX order also works when the quote changes at a 15-minute tick.
const another=10n**19n;
db.prepare('INSERT INTO users(id,nickname,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)')
 .run(3,'시세변동테스터',wallet.mirror(another),String(another),String(wallet.mirror(another)));
const quoteBefore=coin.status(3).stocks.find(s=>s.id==='DOGJ').price;
now+=15*60000;
const maxAfterTick=coin.trade(3,'buy','DOGJ','MAX','jcoin-moving-max-buy-001');
assert.ok(BigInt(maxAfterTick.status.wallet)>=0n);
assert.ok(buyCost(BigInt(maxAfterTick.receipt.price),BigInt(maxAfterTick.receipt.quantity.replace('.','')))<=another);
assert.ok(maxAfterTick.receipt.price!==quoteBefore,'Tick price was updated server-side');
assert.equal(maxAfterTick.status.stocks.find(s=>s.id==='DOGJ').maxBuy,'0.0000');
// Sell the entire high-volume holding without the old order-size cap.
const sellHuge=coin.trade(3,'sell','DOGJ',maxAfterTick.receipt.quantity,'jcoin-moving-full-sell-001');
assert.equal(sellHuge.status.holdings.find(h=>h.id==='DOGJ').quantity,'0.0000');
console.log('J-COIN MAX balance, large quantity, fee, quote rollover, duplicate and full sell OK');


// Browser-side countdown/price-chart smoke test, using the real UI source.
// Server quote history and nextTickAt are used directly (no fabricated values).
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/j-coin.js','utf8');
assert.match(source,/jcoin-market-clock/);
assert.match(source,/jcoin-price-svg/);
assert.match(source,/setInterval\(clock,1000\)/);
const instrumented=source.replace(/\}\)\(\);\s*$/,'window.__jcoinTest={historyPoints,spark,priceChart,clock,render,setSnapshot:d=>{snapshot=d;serverOffset=Number(d.serverNow)-Date.now();}};})();');
assert.notEqual(instrumented,source,'test can expose UI functions without rewriting production code');
const uiElements=new Map();
uiElements.set('#jcoinModal',{});
uiElements.set('#jcoinClock',{textContent:''});
uiElements.set('#jcoinContent',{innerHTML:'',contains:()=>false,querySelector:()=>null});
uiElements.set('#jcoinNotice',{textContent:''});
const fakeDocument={head:{appendChild(){}},createElement:()=>({textContent:''}),addEventListener(){},querySelector:key=>uiElements.get(key)||null};
const context={document:fakeDocument,window:{},Date,Math,BigInt,Number,String,Intl,setInterval:()=>0,clearInterval:()=>{}};
vm.runInNewContext(instrumented,context);
const ui=context.window.__jcoinTest;
const realHistory=coin.status(1).stocks.find(x=>x.id==='JJC').history;
const measured=ui.historyPoints(realHistory,600,170);
assert.equal(measured.values.length,realHistory.length);
assert.ok(measured.points.every(p=>p.every(Number.isFinite)),'server quote history creates valid chart points');
assert.match(ui.spark([100,110,105]),/<svg/);
const timestamp=Date.now();
ui.setSnapshot({serverNow:timestamp,nextTickAt:timestamp+75000,wallet:'1000',marketValue:'0',cost:'0',unrealized:'0',stocks:[{id:'JJC',name:'준자코인',icon:'👑',price:'105',maxBuy:'1.0000',changeBp:250,history:[100,110,105]}],holdings:[],ranking:[],trades:[]});
ui.render();
assert.match(uiElements.get('#jcoinContent').innerHTML,/jcoin-price-svg/,'selected coin historical chart visible');
assert.match(uiElements.get('#jcoinContent').innerHTML,/jcoin-spark/,'coin list sparkline visible');
assert.match(uiElements.get('#jcoinContent').innerHTML,/jcoinClock/,'countdown located above holdings');
assert.match(uiElements.get('#jcoinClock').textContent,/01:1[45] 남음/,'server-synchronized 75-second countdown');
assert.equal(ui.historyPoints([100,100,100],600,170).points.length,3,'flat price history supported');
console.log('JCOIN_UI_CHART_TIMER_OK: synchronized countdown, 15-minute quote series, mobile sparklines');

// Production one-time price adjustment: each target is relative to its price when launched.
const campaignBase=coin.status(1).stocks;
const baseMoon=BigInt(campaignBase.find(x=>x.id==='MOON').price);
const baseJunja=BigInt(campaignBase.find(x=>x.id==='JJC').price);
const campaign=coin.startAdjustment();
assert.equal(campaign.step,0);
assert.deepEqual(campaign.targetPct,{MOON:-57,JJC:132});
assert.equal(coin.startAdjustment().startedAt,campaign.startedAt,'a restart may not repeat the 2-hour event');
now+=60*60000;
let special=coin.status(1);
assert.equal(BigInt(special.stocks.find(x=>x.id==='MOON').price),baseMoon*7150n/10000n,'one hour MOON -28.5%');
assert.equal(BigInt(special.stocks.find(x=>x.id==='JJC').price),baseJunja*16600n/10000n,'one hour JJC +66%');
assert.equal(special.temporaryAdjustment.step,4);
now+=60*60000;
special=coin.status(1);
assert.equal(BigInt(special.stocks.find(x=>x.id==='MOON').price),baseMoon*4300n/10000n,'two hour MOON -57%');
assert.equal(BigInt(special.stocks.find(x=>x.id==='JJC').price),baseJunja*23200n/10000n,'two hour JJC +132%');
assert.equal(special.temporaryAdjustment.step,8);
assert.equal(special.temporaryAdjustment.complete,true);
assert.equal(coin.startAdjustment().startedAt,campaign.startedAt,'one-time event cannot restart after completion');
assert.equal(special.stocks.find(x=>x.id==='MOON').history.length<=49,true);
console.log('JCOIN_TWO_HOUR_ADJUSTMENT_OK: -57% MOON, +132% JJC, exact staged ticks and idempotent restart');
console.log('J-COIN 15-minute tick, fractional orders, fees and idempotency OK');
