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
// Bottom edge must contain 15, 16, 17, 18, 19, 20 and HOME at equal distances.
// The previous O20=[82,90] squeezed 19/20 and 20/HOME into half-sized gaps.
const pos=vm.runInContext('YUT_NODE_POS',ctx);
const lower=['O15','O16','O17','O18','O19','O20','START'];
const dx=lower.slice(1).map((node,i)=>pos[node][0]-pos[lower[i]][0]);
assert.ok(dx.every(d=>Math.abs(d-80/6)<0.004), 'six equally spaced bottom intervals: '+dx);
assert.ok(lower.every(node=>pos[node][1]===90),'all bottom nodes share the same bottom path');
assert.ok(dx.every(d=>d>=13),'19, 20 and HOME have adequate separation on small screens');
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

// Final Yut cinematic and precise board-to-docks spacing regression.
const effectStart=app.indexOf("let yutSeenAction='';");
const effectEnd=app.indexOf('function renderYut(',effectStart);
assert.ok(effectStart>0&&effectEnd>effectStart,'effects helper region');
vm.runInContext(app.slice(effectStart,effectEnd)+'\nthis.yutEffects={yutHighlightKind,yutMomentData,yutVictoryHtml};',ctx);
const {yutHighlightKind,yutMomentData,yutVictoryHtml}=ctx.yutEffects;
assert.equal(yutHighlightKind({type:'throw',name:'윷'}),'bonus');
assert.equal(yutHighlightKind({type:'throw',name:'모'}),'bonus');
assert.equal(yutHighlightKind({type:'throw',name:'도'}),'');
assert.equal(yutHighlightKind({type:'throw',name:'빽도',backdo:true}),'backdo');
assert.equal(yutHighlightKind({type:'move',captured:[{}]}),'capture');
assert.equal(yutHighlightKind({type:'move',captured:[],message:'우리 말 2개가 업혔다!'}),'stack');
assert.equal(yutHighlightKind({type:'move',captured:[],stacked:2,message:'이미 업은 말 이동'}),'');
assert.equal(yutHighlightKind({type:'move',captured:[],backdo:true}),'backdo');
assert.equal(yutMomentData({type:'move',captured:[{}]}).title,'잡았다!');
assert.match(yutVictoryHtml('<winner>',true),/&lt;winner&gt;/,'winner escaped');
assert.doesNotMatch(yutVictoryHtml('<winner>',true),/<winner>/);
assert.match(yutVictoryHtml('J-BOT',false),/경기 종료/);
const finalCss=fs.readFileSync('public/yut-royal-v2.css','utf8');
assert.match(html,/yut-royal-v2\.css\?v=/,'second stylesheet active');
assert.ok(finalCss.includes('yut-reserve-strip{margin:0 auto 7px!important;'),'normalized space below board');
assert.match(finalCss,/prefers-reduced-motion/);
assert.match(finalCss,/yut-cinematic-capture/);
assert.match(finalCss,/yut-final-confetti/);
console.log('ROYAL_YUT_V2_OK: verified spectacular results, safety, ending, spacing and reduced motion');

console.log('ROYAL_YUT_UI_OK: flow, scoreboard, board tokens, back-do safeguards, quick throw, responsive stylesheet');
