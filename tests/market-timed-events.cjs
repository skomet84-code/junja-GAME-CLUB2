'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const {createMarketControl}=require('../market-operator');
const {createJStocks,STOCKS,MARKET_KEY:STOCK_KEY,sessionHour:stockHour}=require('../j-stock-core');
const {createJCoins,STOCKS:COINS,MARKET_KEY:COIN_KEY,sessionHour:coinHour}=require('../j-coin-core');
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL);CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,is_disabled INTEGER DEFAULT 0,balance INTEGER DEFAULT 100000000,balance_exact TEXT,balance_base TEXT);CREATE TABLE ledger(id INTEGER PRIMARY KEY,user_id INTEGER,amount INTEGER,type TEXT);INSERT INTO users(id,nickname) VALUES(1,'준자'),(2,'햅피');INSERT INTO ledger VALUES(1,1,0,'older');");
let clock=Date.UTC(2026,10,5,0,0);
const now=()=>clock;
function write(k,v){db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(k,JSON.stringify(v),clock);}
function read(k){return JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?').get(k).value);}
write(STOCK_KEY,{hour:stockHour(clock),cadenceHours:6,catalogVersion:3,stocks:Object.fromEntries(STOCKS.map(s=>[s.id,{price:String(s.base),changeBp:0,history:[s.base],event:null}]))});
write(COIN_KEY,{hour:coinHour(clock),cadenceHours:0.25,catalogVersion:1,stocks:Object.fromEntries(COINS.map(s=>[s.id,{price:String(s.base),changeBp:0,history:[s.base],event:null}]))});
let manager=createMarketControl({db,now});
function stockCore(){
 return createJStocks({db,exactWallet,now,randomInt:(a)=>a,
  scheduledProtected:()=>manager.scheduledProtected('stock'),
  scheduledDue:()=>manager.scheduledDue('stock'),
  progressScheduled:m=>manager.progressScheduled('stock',m)});
}
function coinCore(){
 return createJCoins({db,exactWallet,now,randomInt:(a)=>a,
  scheduledProtected:()=>manager.scheduledProtected('coin'),
  scheduledDue:()=>manager.scheduledDue('coin'),
  progressScheduled:m=>manager.progressScheduled('coin',m)});
}
let stocks=stockCore(),coins=coinCore();
const stockId='timed_stock_event_0000001';
const stockStart=manager.apply({actorId:1,type:'stock',symbol:'A',mode:'schedule',deltaPercent:'+30',
 expectedPrice:'100000',durationMinutes:30,requestId:stockId});
assert.equal(stockStart.schedule.status,'RUNNING');
assert.equal(stockStart.schedule.targetPrice,'130000');
assert.equal(manager.list().schedules.stock.A.step,0);
assert.equal(stocks.status(1).stocks.find(x=>x.id==='A').price,'100000');
clock+=4*60000;
assert.equal(stocks.status(1).stocks.find(x=>x.id==='A').price,'100000','No early step');
clock+=60000;
assert.equal(stocks.status(1).stocks.find(x=>x.id==='A').price,'105000','First 5-min step');
assert.equal(manager.list().schedules.stock.A.step,1);
assert.equal(manager.apply({actorId:1,type:'stock',symbol:'A',mode:'schedule',deltaPercent:'+30',
 expectedPrice:'100000',durationMinutes:30,requestId:stockId}).duplicate,true);
assert.throws(()=>manager.apply({actorId:1,type:'stock',symbol:'A',mode:'price',
 deltaPercent:'5',expectedPrice:'105000',requestId:'timed_conflict_000001'}),/예약 시세 이벤트/);
assert.throws(()=>manager.apply({actorId:1,type:'stock',symbol:'A',mode:'schedule',
 deltaPercent:'5',expectedPrice:'105000',durationMinutes:30,requestId:'timed_conflict_000002'}),/예약 시세 이벤트/);
// A new process reconstructs the exact remaining steps from durable game_state.
manager=createMarketControl({db,now});stocks=stockCore();
clock+=10*60000;
assert.equal(stocks.status(1).stocks.find(x=>x.id==='A').price,'115000','Catch up to 15 minutes after restart');
assert.equal(manager.list().schedules.stock.A.step,3);
clock+=15*60000;
assert.equal(stocks.status(1).stocks.find(x=>x.id==='A').price,'130000','Target 130% after 30 minutes');
assert.equal(manager.list().schedules.stock.A.status,'COMPLETED');
assert.equal(manager.scheduledDue('stock'),false);
assert.equal(manager.scheduledProtected('stock').size,0);
// New run on same asset is permitted after completion; cancelling retains the already settled quote.
const second=manager.apply({actorId:1,type:'stock',symbol:'A',mode:'schedule',deltaPercent:'-10',
 expectedPrice:'130000',durationMinutes:60,requestId:'timed_stock_cancel_0001'});
clock+=5*60000;
assert.equal(stocks.status(1).stocks.find(x=>x.id==='A').price,'128917');
const cancelled=manager.apply({actorId:1,type:'stock',symbol:'A',mode:'cancel',targetEventId:second.schedule.id,requestId:'timed_cancel_action_0001'});
assert.equal(cancelled.schedule.status,'CANCELED');
assert.equal(manager.apply({actorId:1,type:'stock',symbol:'A',mode:'cancel',targetEventId:second.schedule.id,requestId:'timed_cancel_action_0001'}).duplicate,true);
clock+=120*60000;
assert.equal(stocks.status(1).stocks.find(x=>x.id==='A').price,'128917','Cancellation retains quote');
assert.throws(()=>manager.apply({actorId:1,type:'stock',symbol:'A',mode:'cancel',targetEventId:second.schedule.id,requestId:'timed_cancel_action_0002'}),/이미 종료/);
// Newly listed food and dairy are eligible for the same operator scheduled quote engine.
const newFoodStart=stocks.status(1).stocks.find(x=>x.id==='K').price;
const kEvent=manager.apply({actorId:1,type:'stock',symbol:'K',mode:'schedule',deltaPercent:'+10',
 expectedPrice:newFoodStart,durationMinutes:30,requestId:'ipo_cheomji_schedule_0001'});
clock+=30*60000;
assert.equal(stocks.status(1).stocks.find(x=>x.id==='K').price,kEvent.schedule.targetPrice);
assert.equal(manager.list().schedules.stock.K.status,'COMPLETED');
assert.equal(stocks.status(1).stocks.find(x=>x.id==='L').name,'동동 유업');
// Coin 60-minute 12-step drop, regular 15-minute market ticks may not overlap this asset.
const coinCurrent=coins.status(1).stocks.find(x=>x.id==='MOON').price;
const drop=manager.apply({actorId:1,type:'coin',symbol:'MOON',mode:'schedule',deltaPercent:'-57',
 expectedPrice:coinCurrent,durationMinutes:60,requestId:'timed_coin_moon_00001'});
const target=(BigInt(coinCurrent)*4300n+5000n)/10000n;
assert.equal(drop.schedule.targetPrice,String(target));
const oldMoon=BigInt(coinCurrent);
clock+=15*60000;
const mid=coins.status(1).stocks.find(x=>x.id==='MOON');
const expected=(oldMoon*9n+target*3n+6n)/12n;
assert.equal(mid.price,String(expected),'Coin 15-min regular tick must NOT double-affect a scheduled asset');
assert.equal(manager.list().schedules.coin.MOON.step,3);
clock+=45*60000;
assert.equal(coins.status(1).stocks.find(x=>x.id==='MOON').price,String(target));
assert.equal(manager.list().schedules.coin.MOON.status,'COMPLETED');
// 120-minute target can catch up in one read; exact BigInt arithmetic and persisted evidence.
const coinBefore=coins.status(1).stocks.find(x=>x.id==='ROY').price;
const huge=manager.apply({actorId:1,type:'coin',symbol:'ROY',mode:'schedule',deltaPercent:'+132',
 expectedPrice:coinBefore,durationMinutes:120,requestId:'timed_coin_royal_001'});
assert.equal(huge.schedule.totalSteps,24);
clock+=120*60000;
const end=coins.status(1).stocks.find(x=>x.id==='ROY');
assert.equal(end.price,huge.schedule.targetPrice);
assert.equal(manager.list().schedules.coin.ROY.status,'COMPLETED');
assert.equal(manager.list().schedules.coin.ROY.step,24);
assert.throws(()=>manager.apply({actorId:1,type:'coin',symbol:'DOGJ',mode:'schedule',deltaPercent:'+3',
 expectedPrice:coins.status(1).stocks.find(x=>x.id==='DOGJ').price,durationMinutes:45,requestId:'timed_bad_duration_001'}),/30분/);
const before=db.prepare("SELECT balance FROM users WHERE id=1").get().balance;
assert.equal(before,100000000);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ledger').get().n,1);
assert(manager.list().history.filter(x=>x.mode==='schedule').length>=4);
db.close();
console.log('MARKET_TIMED_EVENTS_OK: 30/60/120 min, 5-min steps, coin +132/-57, persistent progress, cancellation, no double tick, replay, no wallet/ledger changes');
