'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite'),wallet=require('../exact-wallet');
const {createJStocks,STOCKS,FEE_BP,MARKET_CADENCE_HOURS,sessionHour,MARKET_KEY}=require('../j-stock-core');
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,is_disabled INTEGER DEFAULT 0,balance INTEGER,balance_exact TEXT,balance_base TEXT);CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);');
const db={exec:q=>sql.exec(q),prepare:q=>{const s=sql.prepare(q);s.setReadBigInts(true);return s;}};
function add(id,name,money){db.prepare('INSERT INTO users(id,nickname,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)').run(id,name,wallet.mirror(money),String(money),String(wallet.mirror(money)));}
function balance(id){return wallet.read(db.prepare('SELECT balance,balance_exact,balance_base FROM users WHERE id=?').get(id));}
add(1,'첫번째',2000000n);add(2,'두번째',3000000n);add(3,'대주주',1000000000000000000n);
let clock=Date.parse('2026-10-29T00:00:00+09:00');
const rng=(min,max)=>max-1;
const mk=()=>createJStocks({db,exactWallet:wallet,now:()=>clock,randomInt:rng});
const stock=mk(),ids=STOCKS.map(s=>s.id);
assert.deepEqual(ids,['A','B','C','D','E']);
assert.equal(FEE_BP,50n);
assert.equal(MARKET_CADENCE_HOURS,6);
for(const [time,session] of [
 ['2026-10-29T00:00:00+09:00','2026-10-29T00:00:00+09:00'],
 ['2026-10-29T05:59:59+09:00','2026-10-29T00:00:00+09:00'],
 ['2026-10-29T06:00:00+09:00','2026-10-29T06:00:00+09:00'],
 ['2026-10-29T11:59:59+09:00','2026-10-29T06:00:00+09:00'],
 ['2026-10-29T12:00:00+09:00','2026-10-29T12:00:00+09:00'],
 ['2026-10-29T18:00:00+09:00','2026-10-29T18:00:00+09:00'],
 ['2026-10-30T00:00:00+09:00','2026-10-30T00:00:00+09:00']
])assert.equal(sessionHour(Date.parse(time))*3600000,Date.parse(session),'KST 4-session alignment: '+time);
const first=stock.status(1),same=stock.status(2);
assert.equal(first.changed,true);assert.equal(same.changed,false);
assert.equal(first.stocks.length,5);assert.deepEqual(first.stocks.map(x=>x.price),same.stocks.map(x=>x.price));
assert.equal(first.wallet,'2000000');assert.equal(first.nextTickAt,clock+6*3600000);
assert.ok(fs.readFileSync('server.js','utf8').includes("'/api/jstock/trade'"),'server trade route');
assert.ok(fs.readFileSync('public/index.html','utf8').includes('/j-stock.js?v='),'UI asset linked');
assert.ok(fs.readFileSync('public/j-bank.js','utf8').includes('id=\\\"jbankMarketOpen\\\"')||fs.readFileSync('public/j-bank.js','utf8').includes('jbankMarketOpen'),'bank open control');
const id='request_stocks_buy_0001';
const bought=stock.trade(1,'buy','A','5',id);
assert.equal(bought.receipt.gross,'500000');assert.equal(bought.receipt.fee,'2500');
assert.equal(balance(1),1497500n);assert.equal(bought.status.holdings[0].quantity,'5');
assert.equal(bought.status.holdings[0].cost,'502500');
assert.equal(bought.status.marketValue,'500000');
assert.equal(bought.status.unrealized,'-2500');
assert.equal(bought.status.ranking[0].nickname,'첫번째');
assert.equal(stock.trade(1,'buy','A','5',id).duplicate,true,'retry cannot credit or debit twice');
assert.equal(balance(1),1497500n);
assert.throws(()=>stock.trade(1,'buy','A','1',id),/요청번호/);
assert.throws(()=>stock.trade(1,'sell','A','6','request_sell_too_many'),/보유 주식/);
assert.throws(()=>stock.trade(1,'buy','A','500','request_insufficient'),/게임머니/);
assert.equal(balance(1),1497500n);
const sold=stock.trade(1,'sell','A','2','request_stocks_sell_0001');
assert.equal(sold.receipt.gross,'200000');
assert.equal(sold.receipt.fee,'1000');
assert.equal(sold.receipt.realized,'-2000','selling cost basis includes paid buy fee');
assert.equal(sold.status.holdings[0].quantity,'3');
assert.equal(sold.status.holdings[0].cost,'301500');
assert.equal(sold.status.realized,'-2000');
assert.equal(balance(1),1696500n);
assert.equal(stock.trade(1,'sell','A','2','request_stocks_sell_0001').duplicate,true);
clock+=3600000;
assert.equal(stock.status(1).changed,false,'one-hour boundary does not move market');
assert.equal(stock.status(1).stocks[0].price,'100000','the six-hour session holds the price');
clock=Date.parse('2026-10-29T05:59:59+09:00');
assert.equal(stock.status(1).changed,false,'one second before 06:00 is not a new session');
clock+=1000;
const second=stock.status(1);
assert.equal(second.changed,true);
assert.equal(second.nextTickAt,Date.parse('2026-10-29T12:00:00+09:00'));
assert.equal(second.stocks[0].price,'107500');
assert.equal(stock.status(2).stocks[0].price,'107500','all users receive identical quotes');
assert.equal(second.stocks[0].changeBp,750);
assert.equal(second.holdings[0].value,'322500');
assert.equal(second.unrealized,'21000');
assert.equal(mk().status(1).stocks[0].price,'107500','market and positions survive process restart');
assert.equal(mk().status(1).holdings[0].quantity,'3');
assert.throws(()=>stock.trade(2,'buy','F','1','request_bad_stock_0001'),/상장/);
assert.throws(()=>stock.trade(2,'buy','A','0','request_zero_stocks'),/수량/);
const large=stock.trade(3,'buy','B','100000000000','request_large_stocks_01');
assert.equal(large.status.holdings[1].quantity,'100000000000');
assert.equal(BigInt(large.status.wallet),balance(3),'large balance exact');
assert.equal(BigInt(large.receipt.gross),75000n*100000000000n*10450n/10000n,'second quote appreciates correctly');
assert.equal(db.prepare("SELECT COUNT(*) AS c FROM ledger WHERE type LIKE 'jstock_%'").get().c,3n,'replays and errors make no entries');
// All four daily KST sessions share one persisted quote; trading/holdings never reset.
const investedQty=stock.status(1).holdings[0].quantity,walletBefore=balance(1);
const openAt=iso=>{clock=Date.parse(iso);return stock.status(1);};
assert.equal(openAt('2026-10-29T11:59:59+09:00').changed,false);
const noon=openAt('2026-10-29T12:00:00+09:00');
assert.equal(noon.changed,true,'12:00 KST opens one session');
assert.equal(noon.nextTickAt,Date.parse('2026-10-29T18:00:00+09:00'));
assert.equal(openAt('2026-10-29T17:59:59+09:00').stocks[0].price,noon.stocks[0].price);
const evening=openAt('2026-10-29T18:00:00+09:00');
assert.equal(evening.changed,true,'18:00 KST opens one session');
assert.equal(evening.nextTickAt,Date.parse('2026-10-30T00:00:00+09:00'));
const midnight=openAt('2026-10-30T00:00:00+09:00');
assert.equal(midnight.changed,true,'00:00 KST opens next-day session');
assert.equal(midnight.nextTickAt,Date.parse('2026-10-30T06:00:00+09:00'));
assert.equal(midnight.stocks[0].history.length,5,'four daily ticks plus initial price');
assert.equal(midnight.holdings[0].quantity,investedQty,'positions survive all session changes');
assert.equal(balance(1),walletBefore,'price changes alone never debit or credit wallet');

// Historical hourly-market records are migrated IN PLACE; don't replay all old hourly ticks.
clock=Date.parse('2026-10-30T01:29:00+09:00');
const legacy=JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(MARKET_KEY).value);
const priceBeforeMigration=legacy.stocks.A.price,historyBeforeMigration=legacy.stocks.A.history.length;
delete legacy.cadenceHours;legacy.hour=Math.floor(clock/3600000); // saved by old hourly engine
db.prepare('UPDATE game_state SET value=? WHERE key=?').run(JSON.stringify(legacy),MARKET_KEY);
const migrated=stock.status(1);
assert.equal(migrated.changed,true,'existing hourly market migrated to four sessions');
assert.equal(migrated.stocks[0].price,priceBeforeMigration,'migration cannot suddenly change live price');
assert.equal(migrated.stocks[0].history.length,historyBeforeMigration,'history remains intact');
assert.equal(migrated.nextTickAt,Date.parse('2026-10-30T06:00:00+09:00'));
assert.equal(migrated.holdings[0].quantity,investedQty,'no shareholder balance reset');
assert.equal(balance(1),walletBefore,'no wallet changes on schedule migration');
assert.equal(JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(MARKET_KEY).value).cadenceHours,6);
assert.equal(stock.status(2).changed,false,'second user must observe same migrated market');
const afterMigration=openAt('2026-10-30T06:00:00+09:00');
assert.equal(afterMigration.changed,true,'first next full six-hour session moves price once');
assert.equal(afterMigration.nextTickAt,Date.parse('2026-10-30T12:00:00+09:00'));
console.log('JSTOCK_OK: KST 00/06/12/18 sessions, legacy hourly migration without repricing, wallets/holdings preserved, atomic buy/sell, fee and idempotency');
