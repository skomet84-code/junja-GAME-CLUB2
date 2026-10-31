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

console.log('J-COIN 15-minute tick, fractional orders, fees and idempotency OK');
