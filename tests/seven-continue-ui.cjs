'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');
const elements={},timers=new Map(),storage={seven_auto:'1'};let timerId=0;
const element=()=>({innerHTML:'',classList:{add(){},remove(){}},querySelectorAll:()=>[]});
const ctx=vm.createContext({
 $:s=>elements[s]??=element(),$$:()=>[],me:{nickname:'fixture'},html:String,money:String,signedMoney:String,
 avatarImg:()=>'',botFace:()=>'',cardHtml:c=>c,storageGet:k=>storage[k],storageSet:(k,v)=>storage[k]=v,
 sevenAutoTimer:null,currentView:'sevenpoker',document:{hidden:false},updateHeader:()=>{},toast:()=>{},
 setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)
});
vm.runInContext(source.slice(source.indexOf('const SEVEN_STREET_NAME='),source.indexOf('function sevenMultiActions(')),ctx);
const done={handNo:1,complete:true,street:7,stack:{user:'240704577661633',bot:'1000000000000'},buyIn:'238321364021400',pot:'4766427280428',cards:{user:['7S','5H','AS','JS','8H','KD','JD'],bot:['KH','5C','QS','2S','5S','TH','3D']},result:{winner:'user',text:'승리'}};
const playing={...done,handNo:2,complete:false,result:null,street:3,turn:'user',currentBet:0,minRaise:1000};
const nextCount=()=> (elements['#sevenPokerTable'].innerHTML.match(/class="primary seven-next"/g)||[]).length;
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 ctx.renderSevenPoker(done);ctx.renderSevenPoker(done);
 assert.equal(nextCount(),2,'completed hand has top and bottom next buttons');
 assert.equal(timers.size,1,'rerender retains auto-next timer');
 let release;ctx.api=()=>new Promise(r=>release=r);const old=ctx.loadSevenPoker();ctx.renderSevenPoker(done);release({game:playing});await old;
 assert.equal(nextCount(),2,'late GET cannot remove completed controls');
 let posts=0;ctx.api=async()=>{posts++;return {game:playing}};[...timers.values()][0]();await flush();
 assert.equal(posts,1,'auto-next still executes after repeated render');assert.equal(nextCount(),0);
 ctx.renderSevenPoker(done);ctx.api=async url=>{if(url.endsWith('/next'))throw Error('response lost');return {game:playing}};
 await ctx.nextSevenPoker();assert.equal(nextCount(),0,'lost response recovers state without replaying POST');
 ctx.renderSevenPoker(done);let reads=0;ctx.api=()=>{reads++;return new Promise(r=>release=r)};
 const next=ctx.nextSevenPoker();await ctx.loadSevenPoker();assert.equal(reads,1,'GET skipped while action is pending');
 await ctx.nextSevenPoker();assert.equal(reads,1,'double next cannot charge two antes');release({game:playing});await next;
 const replies=[];ctx.api=()=>new Promise(r=>replies.push(r));const first=ctx.loadSevenPoker(),last=ctx.loadSevenPoker();
 replies[1]({game:done});await last;replies[0]({game:playing});await first;assert.equal(nextCount(),2,'out-of-order reads preserve latest state');
 console.log('SEVEN_CONTINUE_STALE_GET_AUTO_TIMER_RECOVERY_AND_DUPLICATE_NEXT_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
