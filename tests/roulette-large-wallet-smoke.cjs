'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const root=path.join(__dirname,'..'),server=fs.readFileSync(path.join(root,'server.js'),'utf8'),app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER,balance_exact TEXT,balance_base TEXT);CREATE TABLE stats(user_id INTEGER PRIMARY KEY,roulette_plays INTEGER DEFAULT 0,roulette_wins INTEGER DEFAULT 0,roulette_profit INTEGER DEFAULT 0);CREATE TABLE ledger(user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);INSERT INTO users(id,balance) VALUES(1,0);INSERT INTO stats(user_id) VALUES(1);`);
let pocket=1;
const ctx=vm.createContext({db,crypto:{randomInt:n=>pocket%n},now:()=>1,formatMoney:String,pushRefresh:()=>{}});
vm.runInContext(server.slice(server.indexOf('const ROULETTE_WHEEL='),server.indexOf('// ---------- Big Wheel & Sic Bo')),ctx);
const large=29020401790482531n;
function reset(balance=large){const mirror=exactWallet.mirror(balance);db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=1').run(mirror,String(balance),String(mirror));db.exec('DELETE FROM ledger;UPDATE stats SET roulette_plays=0,roulette_wins=0,roulette_profit=0');}
function balance(){return exactWallet.read(db.prepare('SELECT CAST(balance AS TEXT) AS balance,balance_exact,balance_base FROM users').get())}
function spin(bets){return ctx.rouletteSpin({id:1,balance:'0'},bets)}
for(const [kind,target,number,mult] of [['red',null,1,2n],['red',null,2,0n],['black',null,26,2n],['black',null,1,0n],['straight',26,26,36n],['straight',0,0,36n]]){
 reset();pocket=number;const r=spin([{kind,target,amount:String(large)}]);
 assert.equal(r.totalBet,String(large));assert.equal(r.payout,String(large*mult));assert.equal(balance(),large*mult);assert.equal(r.profit,String(large*(mult-1n)));assert.equal(r.bets[0].won,mult>0n);assert.equal(r.bets[0].returned,String(large*mult));JSON.stringify(r);
 const debit=db.prepare("SELECT CAST(amount AS TEXT) AS a,CAST(balance_after AS TEXT) AS b FROM ledger WHERE type='roulette_bet'").get();assert.equal(debit.a,String(-large));assert.equal(debit.b,'0');if(kind==='black')assert.match(db.prepare("SELECT memo FROM ledger WHERE type='roulette_bet'").get().memo,/black:-:/);if(mult>0n)assert.equal(db.prepare("SELECT count(*) AS n FROM ledger WHERE type='roulette_win'").get().n,1);
}
reset();pocket=1;const r=spin([{kind:'black',amount:'1000'},{kind:'red',amount:String(large-1000n)}]);assert.equal(r.totalBet,String(large));assert.equal(balance(),(large-1000n)*2n);
for(const amount of ['999','-1000','1.5','NaN','1e18',String(large+1n),Number(large)]){
 reset();assert.throws(()=>spin([{kind:'red',amount}]));assert.equal(balance(),large);assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n,0);
}
reset(9000000000000000000n);pocket=1;const mirrorEdge=spin([{kind:'red',amount:'1000'}]);assert.equal(mirrorEdge.payout,'2000');assert.equal(balance(),9000000000000001000n);
reset();pocket=1;db.exec("CREATE TRIGGER reject_win BEFORE INSERT ON ledger WHEN NEW.type='roulette_win' BEGIN SELECT RAISE(ABORT,'test payout failure'); END");assert.throws(()=>spin([{kind:'red',amount:String(large)}]),/test payout failure/);assert.equal(balance(),large);assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n,0);db.exec('DROP TRIGGER reject_win');

// Cover exact wallets above the int64 compatibility mirror, including win/loss and zero.
const rich=100000000000000000000n;
for(const [n,color,shouldWin] of [[2,'black',true],[1,'black',false],[0,'black',false],[1,'red',true],[2,'red',false]]){
 reset(rich);pocket=n;const r=spin([{kind:color,amount:'1000'}]);
 const expected=shouldWin?2000n:0n;
 assert.equal(r.color,n===0?'green':n===1?'red':'black');
 assert.equal(r.payout,String(expected));
 assert.equal(balance(),rich-1000n+expected);
 const held=db.prepare('SELECT CAST(balance AS TEXT) AS balance,balance_exact,balance_base FROM users WHERE id=1').get();
 assert.equal(BigInt(held.balance_exact),rich-1000n+expected);
 assert.equal(BigInt(held.balance_base),exactWallet.mirror(rich-1000n+expected));
 const ledgerRows=db.prepare('SELECT type,amount_exact,balance_after_exact FROM ledger ORDER BY rowid').all();
 assert.equal(ledgerRows[0].amount_exact,'-1000');
 assert.equal(ledgerRows[0].balance_after_exact,String(rich-1000n));
 assert.equal(ledgerRows.length,shouldWin?2:1);
 if(shouldWin){assert.equal(ledgerRows[1].amount_exact,'2000');assert.equal(ledgerRows[1].balance_after_exact,String(rich+1000n));}
}

// Browser arithmetic must preserve the final digit and serialize JSON safely.
const ui=vm.createContext({me:{balance:String(large)},rouletteChip:'max',rouletteBets:[],rouletteSpinning:false,fx:()=>{},renderRouletteBets:()=>{},renderRouletteBoard:()=>{},toast:m=>{throw Error(m)}});
vm.runInContext(app.slice(app.indexOf('function rouletteExact('),app.indexOf('function rouletteSelectNumber(')),ui);
ui.addRouletteBet('red',null);assert.equal(ui.rouletteBets[0].amount,String(large));assert.equal(ui.rouletteTotal(),large);assert.equal(JSON.parse(JSON.stringify({bets:ui.rouletteBets})).bets[0].amount,String(large));
ui.rouletteBets=[];ui.rouletteChip=1000;ui.addRouletteBet('red',null);ui.rouletteChip='max';ui.addRouletteBet('red',null);assert.equal(ui.rouletteBets[0].amount,String(large));assert.equal(ui.rouletteAmount(),0n);assert.ok(ui.rouletteMoney(String(large)).includes('29,020,401,790,482,531'));
db.close();console.log('ROULETTE_EXACT_ALLIN_WIN_LOSS_36X_SPLIT_VALIDATION_ROLLBACK_CLIENT_OK');
