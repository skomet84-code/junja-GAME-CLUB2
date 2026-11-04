'use strict';
// Atomic payout / jackpot / free ticket / high balance tests for the actual server big-wheel function.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const casinoReceipts=require('../casino-round-receipts');
const server=fs.readFileSync('server.js','utf8');
const source=server.slice(server.indexOf('const BIG_WHEEL_DEFS ='),server.indexOf('const SICBO_TOTAL_GROSS='));
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,is_disabled INTEGER NOT NULL DEFAULT 0,balance INTEGER NOT NULL,balance_exact TEXT,balance_base TEXT,rank_free_wheel_used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER);
CREATE TABLE stats(user_id INTEGER PRIMARY KEY,bigwheel_plays INTEGER NOT NULL DEFAULT 0,bigwheel_wins INTEGER NOT NULL DEFAULT 0,bigwheel_profit INTEGER NOT NULL DEFAULT 0);
INSERT INTO users(id,balance) VALUES(1,0);INSERT INTO stats(user_id) VALUES(1);`);
let index=0;
const consumeRankFreePlay=(id,kind,useFree)=>{
 if(!useFree)return {free:false,used:0,limit:1,left:1};
 db.prepare('UPDATE users SET rank_free_wheel_used=rank_free_wheel_used+1 WHERE id=?').run(id);
 return {free:true,used:1,limit:1,left:0};
};
const ctx=vm.createContext({
 db,exactWallet,casinoReceipts,now:()=>1234,formatMoney:String,
 crypto:{randomInt:n=>{assert.equal(n,77);return index;}},
 gameWager:(b,min,max,step)=>{const n=Number(b);if(!Number.isSafeInteger(n)||n<min||n>max||n%step)throw Error('invalid bet');return n;},
 socialRankPerksForUser:()=>({freeSlotBet:10000000}),consumeRankFreePlay
});
vm.runInContext(source+'\nthis.spin=bigWheelSpin;this.keys=BIG_WHEEL_KEYS;this.defs=BIG_WHEEL_DEFS;',ctx);
assert.deepEqual(Array.from(ctx.keys.flatMap((key,i)=>key==='junja'?[i]:[])),[0,38]);
const wallet=()=>exactWallet.read(db.prepare('SELECT CAST(balance AS TEXT) AS balance,balance_exact,balance_base FROM users WHERE id=1').get());
const ledger=()=>db.prepare('SELECT amount_exact,balance_after_exact,type,memo FROM ledger ORDER BY id').all();
function reset(value=1000000000n){
 const mirror=exactWallet.mirror(value);
 db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=?,rank_free_wheel_used=0 WHERE id=1').run(mirror,String(value),String(mirror));
 db.exec('DELETE FROM ledger;UPDATE stats SET bigwheel_plays=0,bigwheel_wins=0,bigwheel_profit=0');
}
let cases=0;
for(const free of [false,true])for(index=0;index<77;index++)for(const key of Object.keys(ctx.defs)){
 reset();const bet=free?10000000n:10000n,landed=ctx.keys[index],won=landed==='junja'||landed===key;
 const payout=won?bet*BigInt(ctx.defs[landed].mult):0n;
 const out=ctx.spin(1,10000,key,free);
 assert.equal(out.payout,Number(payout));assert.equal(out.won,won);assert.equal(out.jackpot,landed==='junja');
 assert.equal(wallet(),1000000000n-(free?0n:bet)+payout);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE type='bigwheel_win'").get().n,won?1:0);
 const stats=db.prepare('SELECT bigwheel_plays,bigwheel_wins,bigwheel_profit FROM stats WHERE user_id=1').get();
 assert.equal(stats.bigwheel_plays,1);assert.equal(stats.bigwheel_wins,won?1:0);assert.equal(BigInt(stats.bigwheel_profit),payout-(free?0n:bet));
 assert.equal(db.prepare('SELECT rank_free_wheel_used AS n FROM users WHERE id=1').get().n,free?1:0);
 if(landed==='junja')assert.match(ledger().at(-1).memo,/JUNJA 잭팟 x100/);
 cases++;
}
// Exact-G payout at and above JavaScript's maximum safe integer.
index=0;reset(100000000000000000000n);
const high=ctx.spin(1,1000000000000,'x2',false);
assert.equal(high.payout,100000000000000);
assert.equal(wallet(),100000000000000000000n-1000000000000n+100000000000000n);
assert.equal(ledger().length,2);assert.equal(ledger()[0].amount_exact,'-1000000000000');
reset();assert.throws(()=>ctx.spin(1,1000000000001,'x2',false),/invalid bet/);
assert.equal(wallet(),1000000000n);
// If the win ledger cannot be written, the debit and free-play must roll back.
index=0;reset();
db.exec("CREATE TRIGGER reject_win BEFORE INSERT ON ledger WHEN NEW.type='bigwheel_win' BEGIN SELECT RAISE(ABORT,'simulated payout failure'); END");
assert.throws(()=>ctx.spin(1,10000,'x2',true),/simulated payout failure/);
assert.equal(wallet(),1000000000n);assert.equal(ledger().length,0);
assert.equal(db.prepare('SELECT rank_free_wheel_used AS n FROM users WHERE id=1').get().n,0);
db.exec('DROP TRIGGER reject_win');
// If stats update fails, no wager, jackpot payout or free play may be committed.
reset();db.exec("CREATE TRIGGER reject_stats BEFORE UPDATE ON stats BEGIN SELECT RAISE(ABORT,'simulated stats failure'); END");
assert.throws(()=>ctx.spin(1,10000,'x2',false),/simulated stats failure/);
assert.equal(wallet(),1000000000n);assert.equal(ledger().length,0);
db.exec('DROP TRIGGER reject_stats');
// Existing roulette-style wheel animation remains fully aligned at 77 segments.
const app=fs.readFileSync('public/app.js','utf8');
const match=app.match(/target=(.*?),start=performance.now/);assert(match,'Missing bigwheel motion formula');
const expression=match[1],tau=2*Math.PI,step=tau/77;
for(let round=0,angle=0;round<154;round++){
 const idx=round%77,current=angle%tau,desired=-(idx*step+step/2),turns=8;
 const target=vm.runInNewContext(expression,{bigWheelAngle:angle,current,desired,turns,Math});
 assert(target>angle);const pocket=Math.floor(((-target%tau+tau)%tau)/step);
 assert.equal(pocket,idx);angle=target;
}
db.close();
console.log('BIGWHEEL_ATOMIC_EXACT_OK: '+cases+' verified spins, 1T wagers, exact huge-wallet G, free-ticket rollback, payout/stat failure safety');
