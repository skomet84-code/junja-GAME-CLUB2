'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/royalcards/cards.js','utf8');
const html=fs.readFileSync('public/royalcards/index.html','utf8');
const elements=new Map();
function el(id){
 if(elements.has(id))return elements.get(id);
 const flags=new Set();
 const v={id,innerHTML:'',textContent:'',outerHTML:'',dataset:{},disabled:false,
  classList:{
   add:x=>flags.add(x),remove:x=>flags.delete(x),
   contains:x=>flags.has(x),
   toggle:(x,b)=>{const show=b===undefined?!flags.has(x):b;if(show)flags.add(x);else flags.delete(x);return show}
  }};
 elements.set(id,v);return v;
}
const dyn=['takeStock','stopBtn','meldBtn','discardBtn','drawBtn','playBtn','callBtn','thankNow','shareRoom'];
const document={
 body:{dataset:{}},visibilityState:'visible',
 querySelector(q){
  if(dyn.includes(q.slice(1))){
   const a=el('#actions').innerHTML+el('#roomCode').innerHTML;
   if(!a.includes('id="'+q.slice(1)+'"'))return null;
  }
  return el(q);
 },
 querySelectorAll(q){
  const map={'[data-suggest]':['#handHints','suggest'],'[data-card]':['#hand','card'],'[data-attach]':['#melds','attach']};
  const pair=map[q];if(!pair)return [];
  const re=new RegExp('data-'+pair[1]+'="([^"]+)"','g');
  return [...el(pair[0]).innerHTML.matchAll(re)].map(m=>({dataset:{[pair[1]]:m[1]}}));
 }
};
let room={id:'RC00000000000001',name:'테스트 훌라',game:'hula',mode:'ai',round:1,phase:'playing',version:1,selfId:1,hostId:1,
 players:[{id:1,name:'USER',cardCount:7},{id:'ai:1',name:'BOT',bot:true,cardCount:7}],
 turnId:1,deadline:Date.now()+50000,serverNow:Date.now(),hand:['S3','S5','H7','H8','H9','C4','D6'],
 deckCount:36,discard:'C5',drew:false,legal:[],allowedMelds:[],allowedAttachments:[],melds:[],events:[]};
const posts=[];
async function fetch(url,opts){
 if(opts&&opts.method==='POST'){
  posts.push({url,body:JSON.parse(opts.body)});
  if(url.endsWith('/take')){
   assert.equal(posts[posts.length-1].body.source,'stock');
   room={...room,version:room.version+1,drew:true,deckCount:room.deckCount-1,
    hand:[...room.hand,'S7'],allowedMelds:[['H7'],['H7','H8','H9'],['S7']],events:[{text:'카드 받음'}]};
  }
 }
 return {ok:true,json:async()=>({room,stats:{wins:0,games:0,streak:0,bestStreak:0}})};
}
const sandbox={console,document,location:{search:'?game=hula',origin:'https://example.invalid'},
 URLSearchParams,fetch,navigator:{},Date,Math,
 setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const run=s=>vm.runInContext(s,sandbox);
async function settle(){for(let i=0;i<12;i++)await Promise.resolve()}
(async()=>{
 await settle();
 assert.equal(typeof el('#takeStock').onclick,'function','Hula action draw button must work');
 assert.equal(typeof el('#drawPile').onclick,'function','deck draw button must work');
 assert.equal(typeof el('#quickTake').onclick,'function','quick receive button must work');
 assert.equal(el('#quickTake').disabled,false);
 assert.equal(el('#quickTake').classList.contains('hidden'),false);
 el('#quickTake').onclick();await settle();
 assert.equal(posts.length,1,'exactly one stock receive call');
 assert.ok(posts[0].url.endsWith('/take'));
 assert.equal(run('room.hand.length'),8);
 assert.equal(run('room.drew'),true);
 assert.equal(el('#quickTake').classList.contains('hidden'),true);
 assert.equal(el('#drawPile').disabled,true);
 assert.match(el('#handHints').innerHTML,/등록 가능한 조합/);
 assert.equal(typeof el('#meldBtn').onclick,'function');
 assert.equal(typeof el('#discardBtn').onclick,'function');
 assert.ok(html.includes('premium-table.css'));
 console.log('ROYAL_CARDS_UI_OK: stock draw buttons and legal Hula selection UI');
})().catch(e=>{console.error(e);process.exitCode=1});
