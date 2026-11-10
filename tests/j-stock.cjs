'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite'),wallet=require('../exact-wallet');
const {createJStocks,STOCKS,FEE_BP,MARKET_CADENCE_HOURS,sessionHour,MARKET_KEY,STOCK_CATALOG_VERSION}=require('../j-stock-core');
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
assert.deepEqual(ids,['A','B','C','D','E','F','G','H','I','J','K','L']);
assert.equal(STOCK_CATALOG_VERSION,3);
assert.deepEqual(STOCKS.slice(5,10).map(s=>s.name),['준자오션','준자제약','준자항공','준자로보틱스','준자방산']);
assert.deepEqual(STOCKS.slice(10).map(s=>s.name),['첨지 식품','동동 유업']);
assert.deepEqual(STOCKS.slice(10).map(s=>s.sector),['식품·가공식품','유제품·식음료']);
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
assert.equal(first.stocks.length,12);assert.deepEqual(first.stocks.map(x=>x.price),same.stocks.map(x=>x.price));
assert.deepEqual(first.stocks.slice(5).map(x=>x.price),['68000','42000','86000','112000','76000','34000','27000']);
assert.deepEqual(first.holdings.slice(5).map(x=>x.quantity),['0','0','0','0','0','0','0']);
assert.equal(first.wallet,'2000000');assert.equal(first.nextTickAt,clock+5*60000,'IPO opening discovery occurs once after five minutes');
assert(first.stocks.find(x=>x.id==='L').ipoDiscoveryAt===clock+5*60000);
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
const opened=stock.status(1);
assert.equal(opened.changed,true,'first K/L opening discovery occurs once, without moving old A-J');
assert.equal(opened.stocks[0].price,'100000','A-J must hold their six-hour quote');
for(const id of ['K','L']){
 const quote=opened.stocks.find(x=>x.id===id);
 assert.equal(quote.history.length,2,'IPO shows an actual new point for '+id);
 assert.notEqual(quote.changeBp,0,'first quoted stock must not appear frozen: '+id);
 assert(quote.event.includes('신규상장 첫 가격발견'));
 assert.equal(quote.ipoDiscoveryAt,null,'IPO no longer needs another opening tick');
}
assert.equal(stock.status(2).changed,false,'IPO opening event is idempotent across users');
assert.equal(opened.nextTickAt,Date.parse('2026-10-29T06:00:00+09:00'));
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
assert.throws(()=>stock.trade(2,'buy','M','1','request_bad_stock_0001'),/상장/);
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
// Simulate the real production v1 state: five live listings and existing users' balances.
const oldMarket=JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(MARKET_KEY).value);
const oldPrices=Object.fromEntries(ids.slice(0,5).map(id=>[id,oldMarket.stocks[id].price]));
const oldHistories=Object.fromEntries(ids.slice(0,5).map(id=>[id,oldMarket.stocks[id].history.slice()]));
const oldPortfolio=JSON.parse(db.prepare("SELECT value FROM game_state WHERE key='jstock:portfolio:1'").get().value);
const oldWallet1=balance(1),oldWallet2=balance(2),oldLedger=db.prepare('SELECT COUNT(*) AS c FROM ledger').get().c;
for(const id of ids.slice(5))delete oldMarket.stocks[id];
delete oldMarket.catalogVersion;
db.prepare('UPDATE game_state SET value=? WHERE key=?').run(JSON.stringify(oldMarket),MARKET_KEY);
const expanded=stock.status(1);
assert.equal(expanded.changed,true,'live five-stock schema upgrades in-place');
assert.equal(expanded.stocks.length,12,'all twelve listings become visible');
assert.deepEqual(expanded.stocks.slice(0,5).map(s=>s.price),ids.slice(0,5).map(id=>oldPrices[id]),'old five prices unchanged');
assert.deepEqual(expanded.stocks.slice(0,5).map(s=>s.history),ids.slice(0,5).map(id=>oldHistories[id]),'old five price charts unchanged');
for(const s of expanded.stocks.slice(5)){
 assert.equal(s.price,String(STOCKS.find(x=>x.id===s.id).base),'new shares debut at base without backdated changes');
 assert.deepEqual(s.history,[Number(s.price)],'new listing has one price point at launch');
}
assert.equal(expanded.holdings[0].quantity,investedQty,'old shareholder retains all shares');
assert.deepEqual(JSON.parse(db.prepare("SELECT value FROM game_state WHERE key='jstock:portfolio:1'").get().value),oldPortfolio,'existing portfolio record untouched');
assert.equal(balance(1),oldWallet1,'no wallet mutation on stock listing');
assert.equal(balance(2),oldWallet2,'no mutation of other investors');
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM ledger').get().c,oldLedger,'no artificial ledger activity');
assert.equal(stock.status(2).changed,false,'all users see same upgraded quote');
assert.equal(mk().status(1).stocks.length,12,'expanded market survives restart');
// Simulate the real production v2 snapshot (ten listed A-J shares) and ensure
// a v3 deploy only seeds the two new IPOs without altering any previous quotes.
const v2Snapshot=JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(MARKET_KEY).value);
const v2Quotes=Object.fromEntries(ids.slice(0,10).map(id=>[id,JSON.stringify(v2Snapshot.stocks[id])]));
v2Snapshot.catalogVersion=2;
delete v2Snapshot.stocks.K;delete v2Snapshot.stocks.L;
const v2Portfolio=JSON.parse(db.prepare("SELECT value FROM game_state WHERE key='jstock:portfolio:1'").get().value);
const v2Wallet=balance(1),v2Ledger=db.prepare('SELECT COUNT(*) AS c FROM ledger').get().c;
db.prepare('UPDATE game_state SET value=? WHERE key=?').run(JSON.stringify(v2Snapshot),MARKET_KEY);
const v3Result=stock.status(1);
assert.equal(v3Result.changed,true,'v2 stock catalog must migrate without throwing');
assert.equal(v3Result.stocks.length,12);
for(const id of ids.slice(0,10))assert.equal(JSON.stringify(JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(MARKET_KEY).value).stocks[id]),v2Quotes[id],'old quotes and chart unchanged: '+id);
assert.equal(v3Result.stocks.find(x=>x.id==='K').price,'34000');
assert.equal(v3Result.stocks.find(x=>x.id==='L').price,'27000');
assert.deepEqual(v3Result.stocks.find(x=>x.id==='K').history,[34000]);
assert.deepEqual(v3Result.stocks.find(x=>x.id==='L').history,[27000]);
assert.equal(stock.status(2).changed,false,'other members see shared migrated market');
assert.deepEqual(JSON.parse(db.prepare("SELECT value FROM game_state WHERE key='jstock:portfolio:1'").get().value),v2Portfolio);
assert.equal(balance(1),v2Wallet);
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM ledger').get().c,v2Ledger);
assert.equal(mk().status(1).stocks.length,12,'the new catalog must survive server restart');
const newlyBought=stock.trade(2,'buy','F','3','request_ocean_buy_0001');
assert.equal(newlyBought.receipt.price,'68000');
assert.equal(newlyBought.status.holdings[5].quantity,'3');
assert.equal(newlyBought.status.holdings[5].cost,'205020');
assert.equal(newlyBought.status.stocks[6].name,'준자제약');
assert.equal(stock.trade(2,'buy','F','3','request_ocean_buy_0001').duplicate,true,'new ticker idempotent');
const pharma=stock.trade(2,'buy','G','2','request_pharma_buy_001');
assert.equal(pharma.status.holdings[6].quantity,'2','pharma listed and purchasable');
const soldNew=stock.trade(2,'sell','F','1','request_ocean_sell_0001');
assert.equal(soldNew.receipt.price,'68000');
assert.equal(soldNew.status.holdings[5].quantity,'2');
assert.equal(soldNew.status.holdings[5].cost,'136680','new shares cost basis handled like old shares');
assert.equal(stock.status(1).holdings[5].quantity,'0','positions are user specific');
assert.equal(stock.status(1).stocks[5].price,stock.status(2).stocks[5].price,'new IPO shares have shared quotes');

const afterUpgrade=JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(MARKET_KEY).value);
assert.equal(afterUpgrade.catalogVersion,STOCK_CATALOG_VERSION);
delete afterUpgrade.stocks.G; // Version-3 market corruption must NOT silently re-IPO a held stock.
db.prepare('UPDATE game_state SET value=? WHERE key=?').run(JSON.stringify(afterUpgrade),MARKET_KEY);
assert.throws(()=>stock.status(2),/손상/,'missing already-listed stock must not silently reset');
afterUpgrade.stocks.G=initialQuoteTest(STOCKS.find(s=>s.id==='G')); // restore valid snapshot
db.prepare('UPDATE game_state SET value=? WHERE key=?').run(JSON.stringify(afterUpgrade),MARKET_KEY);
assert.equal(stock.status(2).holdings[6].quantity,'2','portfolio remains after failed corrupt market read');
function initialQuoteTest(s){return {price:String(s.base),changeBp:0,history:[s.base],event:null};}
// Newly listed K/L must participate in real stock trading, not only display.
const newFood=stock.trade(2,'buy','K','2','request_food_buy_00000001');
assert.equal(newFood.receipt.price,'34000');
assert.equal(newFood.status.holdings[10].quantity,'2');
const newDairy=stock.trade(2,'buy','L','3','request_dairy_buy_0000001');
assert.equal(newDairy.receipt.price,'27000');
assert.equal(newDairy.status.holdings[11].quantity,'3');
assert.equal(stock.trade(2,'buy','L','3','request_dairy_buy_0000001').duplicate,true);
const sellFood=stock.trade(2,'sell','K','1','request_food_sell_000001');
assert.equal(sellFood.status.holdings[10].quantity,'1');
assert.equal(sellFood.receipt.price,'34000');
assert.equal(stock.status(1).holdings[10].quantity,'0');
console.log('JSTOCK_OK: twelve listings including 첨지 식품 K and 동동 유업 L; safe v2->v3 migration, real buy/sell, unchanged old quotes, wallet and restart');


// Lobby unified stock+coin P/L: server-only exact BigInt, 2-API safety, and current-user refresh.
async function testLobbyProfit(){
 const vm=require('node:vm'),ui=fs.readFileSync('public/jstock-header.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),css=fs.readFileSync('public/j-stock.css','utf8');
 assert.ok(html.includes('📊 주식·코인 통합수익'),'unified header label');
 assert.ok(html.includes('/jstock-header.js?v='),'versioned controller');
 assert.ok(css.includes('.topbar .jstock-header-profit.up b{color:#ff7777;'),'gain is red');
 assert.ok(css.includes('.topbar .jstock-header-profit.down b{color:#84b5ff;'),'loss is blue');
 assert.ok(fs.readFileSync('public/j-coin.js','utf8').includes("new CustomEvent('jcoin:status'"),'coin trades sync directly');
 const profitClasses=new Set(['flat']),mainClasses=new Set();
 const classList=set=>({
  add:(...xs)=>xs.forEach(x=>set.add(x)),remove:(...xs)=>xs.forEach(x=>set.delete(x)),
  contains:x=>set.has(x),toggle:(x,yes)=>{if(yes)set.add(x);else set.delete(x);}
 });
 const pill={classList:classList(profitClasses),title:'',setAttribute(name,val){this[name]=val;}};
 const amount={textContent:'—'},main={classList:classList(mainClasses)};
 const elements={'#jstockHeaderProfit':pill,'#jstockHeaderProfitAmount':amount,'#mainApp':main};
 const listeners={};let observer,requests=0,boundaryTimers=0,coinError=false;
 let stock={unrealized:'12500',realized:'500',nextTickAt:Date.now()+3600000};
 let coin={unrealized:'-2000',realized:'50',nextTickAt:Date.now()+900000};
 const document={hidden:false,readyState:'complete',querySelector:s=>elements[s]||null,
  addEventListener:(type,fn)=>{(listeners[type]||=[]).push(fn);},
  dispatchEvent:event=>(listeners[event.type]||[]).forEach(fn=>fn(event))};
 const ctx={document,window:{addEventListener(){}},MutationObserver:class{constructor(fn){observer=fn;}observe(){}},
  fetch:async (path,opts)=>{
   assert.ok(path==='/api/jstock'||path==='/api/jcoin');assert.equal(opts.credentials,'same-origin');requests++;
   if(path==='/api/jcoin'&&coinError)return {ok:false,status:503};
   return {ok:true,status:200,json:async()=>path==='/api/jstock'?stock:coin};
  },setTimeout:()=>{boundaryTimers++;return boundaryTimers;},clearTimeout(){},setInterval(){return 1;},Date,Intl,BigInt};
 vm.runInNewContext(ui,ctx,{filename:'public/jstock-header.js'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(amount.textContent,'+1만 1,050 G','both realized and unrealized stock+coin P/L');
 assert.ok(pill['aria-label'].includes('주식 +1만 3,000 G'));
 assert.ok(pill['aria-label'].includes('코인 -1,950 G'));
 assert.ok(profitClasses.has('up'));
 assert.ok(boundaryTimers>=1,'refresh scheduled at earlier coin market tick');
 stock={unrealized:'-300000000',realized:'0',nextTickAt:Date.now()+3600000};
 coin={unrealized:'-200000000',realized:'0',nextTickAt:Date.now()+900000};
 await ctx.window.JStockHeader.refresh(true);
 assert.equal(amount.textContent,'-5억 G','both markets negative combined');
 assert.ok(profitClasses.has('down'));
 stock={unrealized:'0',realized:'0',nextTickAt:Date.now()+3600000};
 coin={unrealized:'0',realized:'0',nextTickAt:Date.now()+900000};
 await ctx.window.JStockHeader.refresh(true);
 assert.equal(amount.textContent,'0 G','zero profit neutral');
 document.dispatchEvent({type:'jstock:status',detail:{unrealized:'1000000000000000020',realized:'0',nextTickAt:Date.now()+3600000}});
 assert.equal(amount.textContent,'+100경 20 G','modal updates exact BigInt');
 document.dispatchEvent({type:'jcoin:status',detail:{unrealized:'-20',realized:'10',nextTickAt:Date.now()+900000}});
 assert.equal(amount.textContent,'+100경 10 G','coin modal immediately changes combined value');
 mainClasses.add('hidden');observer();
 assert.equal(amount.textContent,'—','logout removes stale P/L');
 const before=requests;
 await ctx.window.JStockHeader.refresh(true);
 assert.equal(requests,before,'logged-out client does not poll');
 coinError=true;stock={unrealized:'12500',realized:'0',nextTickAt:Date.now()+3600000};
 mainClasses.delete('hidden');observer();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(amount.textContent,'—','missing coin endpoint must never display stock-only profit');
 coinError=false;coin={unrealized:'-72000',realized:'0',nextTickAt:Date.now()+900000};
 await ctx.window.JStockHeader.refresh(true);
 assert.equal(amount.textContent,'-5만 9,500 G','new login reloads both user balances');
 console.log('JSTOCK_HEADER_OK: stock+coin realized/unrealized, signed exact BigInt, 15min coin tick, cache-safe');
}
testLobbyProfit().catch(error=>{console.error(error);process.exitCode=1;});
