'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),server=fs.readFileSync(path.join(root,'server.js'),'utf8'),app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER);CREATE TABLE stats(user_id INTEGER PRIMARY KEY,roulette_plays INTEGER DEFAULT 0,roulette_wins INTEGER DEFAULT 0,roulette_profit INTEGER DEFAULT 0);CREATE TABLE ledger(user_id INTEGER,amount INTEGER,balance_after INTEGER,type TEXT,memo TEXT,created_at INTEGER);INSERT INTO users VALUES(1,0);INSERT INTO stats(user_id) VALUES(1);`);
let pocket=1;
const ctx=vm.createContext({db,crypto:{randomInt:n=>pocket%n},now:()=>1,formatMoney:String,pushRefresh:()=>{}});
vm.runInContext(server.slice(server.indexOf('const ROULETTE_WHEEL='),server.indexOf('// ---------- Big Wheel & Sic Bo')),ctx);
const large=29020401790482531n;
function reset(balance=large){db.prepare('UPDATE users SET balance=? WHERE id=1').run(balance);db.exec('DELETE FROM ledger;UPDATE stats SET roulette_plays=0,roulette_wins=0,roulette_profit=0');}
function balance(){return BigInt(db.prepare('SELECT CAST(balance AS TEXT) AS b FROM users').get().b)}
function spin(bets){return ctx.rouletteSpin({id:1,balance:'0'},bets)}
for(const [kind,target,number,mult] of [['red',null,1,2n],['red',null,2,0n],['straight',0,0,36n]]){
 reset();pocket=number;const r=spin([{kind,target,amount:String(large)}]);
 assert.equal(r.totalBet,String(large));assert.equal(r.payout,String(large*mult));assert.equal(balance(),large*mult);assert.equal(r.profit,String(large*(mult-1n)));JSON.stringify(r);
 const debit=db.prepare("SELECT CAST(amount AS TEXT) AS a,CAST(balance_after AS TEXT) AS b FROM ledger WHERE type='roulette_bet'").get();assert.equal(debit.a,String(-large));assert.equal(debit.b,'0');
}
reset();pocket=1;const r=spin([{kind:'black',amount:'1000'},{kind:'red',amount:String(large-1000n)}]);assert.equal(r.totalBet,String(large));assert.equal(balance(),(large-1000n)*2n);
for(const amount of ['999','-1000','1.5','NaN','1e18',String(large+1n),Number(large)]){
 reset();assert.throws(()=>spin([{kind:'red',amount}]));assert.equal(balance(),large);assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n,0);
}
reset(9000000000000000000n);assert.throws(()=>spin([{kind:'red',amount:'9000000000000000000'}]),/저장 한도/);assert.equal(balance(),9000000000000000000n);
reset();pocket=1;db.exec("CREATE TRIGGER reject_win BEFORE INSERT ON ledger WHEN NEW.type='roulette_win' BEGIN SELECT RAISE(ABORT,'test payout failure'); END");assert.throws(()=>spin([{kind:'red',amount:String(large)}]),/test payout failure/);assert.equal(balance(),large);assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n,0);db.exec('DROP TRIGGER reject_win');
// Browser arithmetic must preserve the final digit and serialize JSON safely.
const ui=vm.createContext({me:{balance:String(large)},rouletteChip:'max',rouletteBets:[],rouletteSpinning:false,fx:()=>{},renderRouletteBets:()=>{},renderRouletteBoard:()=>{},toast:m=>{throw Error(m)}});
vm.runInContext(app.slice(app.indexOf('function rouletteExact('),app.indexOf('function rouletteSelectNumber(')),ui);
ui.addRouletteBet('red',null);assert.equal(ui.rouletteBets[0].amount,String(large));assert.equal(ui.rouletteTotal(),large);assert.equal(JSON.parse(JSON.stringify({bets:ui.rouletteBets})).bets[0].amount,String(large));
ui.rouletteBets=[];ui.rouletteChip=1000;ui.addRouletteBet('red',null);ui.rouletteChip='max';ui.addRouletteBet('red',null);assert.equal(ui.rouletteBets[0].amount,String(large));assert.equal(ui.rouletteAmount(),0n);assert.ok(ui.rouletteMoney(String(large)).includes('29,020,401,790,482,531'));
db.close();console.log('ROULETTE_EXACT_ALLIN_WIN_LOSS_36X_SPLIT_VALIDATION_ROLLBACK_CLIENT_OK');
