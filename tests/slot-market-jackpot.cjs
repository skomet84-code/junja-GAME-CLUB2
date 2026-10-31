'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const {createJStocks}=require('../j-stock-core');
const {createJCoins}=require('../j-coin-core');
const pool=require('../slot-jackpot-pool');
const sql=new DatabaseSync(':memory:');
sql.exec(`
 CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,is_disabled INTEGER DEFAULT 0,balance INTEGER,balance_exact TEXT,balance_base TEXT);
 CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);
 CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);
`);
let failPoolWrite=false;
const db={
 exec:q=>sql.exec(q),
 prepare:q=>{
  if(failPoolWrite&&q.includes('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT'))throw Error('simulated pool storage write failure');
  const s=sql.prepare(q);s.setReadBigInts(true);return s;
 }
};
function insert(id,nickname,balance){
 db.prepare('INSERT INTO users(id,nickname,balance,balance_exact,balance_base) VALUES(?,?,?,?,?)')
 .run(id,nickname,exactWallet.mirror(balance),String(balance),String(exactWallet.mirror(balance)));
}
function funds(id){return exactWallet.read(db.prepare('SELECT balance,balance_exact,balance_base FROM users WHERE id=?').get(id));}
function ledgerCount(id){return Number(db.prepare('SELECT count(*) AS n FROM ledger WHERE user_id=?').get(id).n);}
const ts=Date.parse('2026-11-01T00:00:00+09:00');
insert(1,'시장수수료검증',10n**22n);
const stocks=createJStocks({db,exactWallet,now:()=>ts,randomInt:(a,b)=>a});
const coins=createJCoins({db,exactWallet,now:()=>ts,randomInt:(a,b)=>a});
assert.equal(pool.BASE,1000000000000n);
assert.equal(pool.readPool(db),pool.BASE,'New pool starts at 1T G');
pool.writePool(db,pool.BASE+123n,ts);
const baseline=pool.readPool(db);
const ss=stocks.trade(1,'buy','A','10','pool-test-stock-buy-0001');
assert.equal(pool.readPool(db),baseline+BigInt(ss.receipt.fee));
assert.equal(stocks.trade(1,'buy','A','10','pool-test-stock-buy-0001').duplicate,true);
assert.equal(pool.readPool(db),baseline+BigInt(ss.receipt.fee),'Replay must not count twice');
const cs=coins.trade(1,'buy','JJC','1.2345','pool-test-coin-buy-0001');
assert.equal(pool.readPool(db),baseline+BigInt(ss.receipt.fee)+BigInt(cs.receipt.fee));
const sx=stocks.trade(1,'sell','A','4','pool-test-stock-sell-0001');
const cx=coins.trade(1,'sell','JJC','0.2345','pool-test-coin-sell-0001');
const allFees=[ss,cs,sx,cx].reduce((n,t)=>n+BigInt(t.receipt.fee),0n);
assert.equal(pool.readPool(db),baseline+allFees,'Buy and sell fees both join same pool');
assert.equal(coins.trade(1,'sell','JJC','0.2345','pool-test-coin-sell-0001').duplicate,true);
assert.equal(pool.readPool(db),baseline+allFees,'Coin replay must not count twice');
assert.equal(ledgerCount(1),4);
const savedBalance=funds(1),savedLedger=ledgerCount(1),savedPool=pool.readPool(db);
failPoolWrite=true;
assert.throws(()=>stocks.trade(1,'buy','B','1','pool-test-stock-rollback-1'),/simulated pool storage write failure/);
failPoolWrite=false;
assert.equal(funds(1),savedBalance,'Pool write failure must rollback trade wallet');
assert.equal(ledgerCount(1),savedLedger,'Pool write failure must rollback trade ledger');
assert.equal(pool.readPool(db),savedPool,'Pool write failure must not mutate total');
db.exec('BEGIN IMMEDIATE');
try{pool.addTradingFee(db,10n**22n,ts);db.exec('ROLLBACK');}catch(e){db.exec('ROLLBACK');throw e;}
assert.equal(pool.readPool(db),savedPool,'Rollback must discard jackpot fee contribution');
// Preserve large pre-existing pools with exact decimal strings.
pool.writePool(db,10n**25n+789n,ts);
assert.equal(pool.readPool(db),10n**25n+789n);
assert.equal(pool.output(pool.readPool(db)),(10n**25n+789n).toString());
assert.throws(()=>pool.writePool(db,50000000n,ts),/기본/);
const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
assert.match(app,/function showSlotJackpot\(d\)\s*\{[\s\S]*?autoSpinStop=true;/);
assert.match(app,/async function runRankFreeSlotAuto\(\)[\s\S]*?if\(result\.jackpot\)\s*\{\s*autoSpinStop=true;[\s\S]*?break;/);
assert.doesNotMatch(app,/if\(result\.jackpot\)\s*\{await sleep\(900\);closeSlotJackpot\(\)\}/);
assert.match(app,/document\.body\.classList\.contains\('jackpot-open'\)\|\|slotSpinState/);
assert.ok(html.includes('1,000,000,000,000 G'));
assert.ok(html.includes('주식·코인 거래 수수료 100% 적립'));
assert.ok(server.includes('const SLOT_JACKPOT_BASE = Number(SLOT_POOL_BASE);'));
assert.ok(server.includes("if(gameStateGet('slot_jackpot_pool',null)==null)gameStateSet('slot_jackpot_pool',SLOT_JACKPOT_BASE);"),'one-shot slot odds wrapper compatibility');
console.log('SLOT_MARKET_FEES_JACKPOT_OK: 1T floor, buy+sell fees, retry isolation, exact huge pool, rollback, 777/JJJ auto pause');
