'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const style=fs.readFileSync('public/yut-royal-v1.css','utf8');
const start=app.indexOf('const YUT_NODE_POS={'),end=app.indexOf('function yutRouteDialog(',start);
assert.ok(start>=0&&end>start,'Yut view helpers remain present');
const root={};
const ctx={
 me:{id:1,avatar:0,nickname:'TEST'},
 html:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 avatarImg:()=>'<span class="avatar"></span>',
 botFace:()=>'<span class="bot"></span>',
 $:(q)=>root[q]||null,$$:(q)=>root[q]||[],
};
vm.createContext(ctx);
vm.runInContext(app.slice(start,end)+'\nthis.yutView={yutFlowBanner,yutBoardHtml,enableYutBoardTokens,wireYutQuickThrow,yutPieceButtons};',ctx);
const {yutFlowBanner,yutBoardHtml,enableYutBoardTokens,wireYutQuickThrow,yutPieceButtons}=ctx.yutView;
assert.match(yutFlowBanner({phase:'waiting'}),/READY/);
assert.match(yutFlowBanner({phase:'playing',mine:true,awaitingThrow:true}),/바로 던지기/);
assert.match(yutFlowBanner({phase:'playing',mine:true,pending:[{name:'도'}]}),/말 선택/);
assert.match(yutFlowBanner({phase:'playing',mine:false},'<script>'),/&lt;script&gt;/);
assert.match(yutFlowBanner({phase:'complete'}),/FINISH/);
const y={sides:[
 {id:'a',label:'나',color:'#ffdd88',playerIds:[1],pieces:[{node:'O5'},{node:'READY'},{node:'FINISH'},{node:'READY'}]},
 {id:'b',label:'봇',color:'#88ddff',playerIds:[2],pieces:[{node:'O8'},{node:'READY'},{node:'FINISH'},{node:'READY'}]}
]};
const board=yutBoardHtml({players:[]},y);
assert.match(board,/ROYAL YUT ARENA/,'new royal header');
assert.match(board,/yut-board-legend/,'legend shown');
assert.match(board,/data-yut-side="a"/,'own side encoded');
assert.match(board,/data-yut-index="0"/,'stable index used');
assert.match(board,/aria-label="윷놀이 게임판"/);
assert.match(yutPieceButtons(y.sides[0],{move:2},'data-piece'),/data-piece="0"/);
const ownToken={dataset:{yutSide:'a',yutIndex:'0'},classList:{add(k){this[k]=true}},setAttribute(k,v){this[k]=v}};
const opponentToken={dataset:{yutSide:'b',yutIndex:'0'},classList:{add(k){this[k]=true}},setAttribute(k,v){this[k]=v}};
let moved=0;const target={disabled:false,click(){moved++}};
root['.true-yut-board .yut-stack[data-yut-side]']=[ownToken,opponentToken];
root['[data-piece="0"]']=target;
enableYutBoardTokens(root,y.sides[0],'data-piece',{name:'도',move:1});
assert.equal(ownToken.classList['can-pick'],true,'own piece selectable from board');
assert.equal(opponentToken.classList['can-pick'],undefined,'opponent cannot be selected');
ownToken.onclick();assert.equal(moved,1,'board piece triggers existing safe move action');
ownToken.onkeydown({key:'Enter',preventDefault(){}});assert.equal(moved,2,'keyboard access');
const blocked={dataset:{yutSide:'a',yutIndex:'1'},classList:{add(){this.active=true}},setAttribute(){}};
root['.true-yut-board .yut-stack[data-yut-side]']=[blocked];
root['[data-piece="1"]']={disabled:false};
enableYutBoardTokens(root,y.sides[0],'data-piece',{name:'빽도',backdo:true});
assert.equal(blocked.classList.active,undefined,'reserve cannot be moved on back-do');
let throws=0;const quick={disabled:false},main={disabled:false,click(){throws++}};
root['[data-yut-quick-throw]']=quick;root['.yut-throw']=main;
wireYutQuickThrow(root);
quick.onclick();quick.onclick();assert.equal(throws,1,'quick throw forwards only once');
assert.equal(quick.disabled,true);
assert.match(html,/yut-royal-v1\.css\?v=/,'premium stylesheet loaded');
assert.match(style,/prefers-reduced-motion/,'accessible reduced motion');
assert.match(style,/\.yut-flow/,'turn guidance styled');
assert.match(style,/\.yut-stack\.can-pick/,'board token affordance styled');
console.log('ROYAL_YUT_UI_OK: flow, scoreboard, board tokens, back-do safeguards, quick throw, responsive stylesheet');
