'use strict';
const fs=require('node:fs'),path=require('node:path');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
if(!server.includes("royalSlotUnlimited=Number(u.rank?.level||0)>=9"))throw new Error('Server King+ slot rank gate missing');
if(!server.includes("royalSlotUnlimited?walletWager(b.bet,u.balance,1000,1000):gameWager(b.bet,1000,1000000000,1000)"))throw new Error('Server slot wager split missing');
if(!app.includes("function slotBetUnlimited(){return Number(me?.rank?.level||0)>=9}"))throw new Error('Client King+ slot rank gate missing');
if(!app.includes("왕 이상 · 보유 게임머니까지 자유 배팅"))throw new Error('Client unlimited slot label missing');
if(!html.includes('id="slotBetInput" type="number" min="1000" max="1000000000"'))throw new Error('Slot input baseline max missing');
console.log('SLOT_RANK_LIMIT_TESTS_OK');

/* SLOT_SELECTOR_REGRESSION */
const brokenSingleBetChip=/(?<!\\$)\\$\\('\\.bet-chip'\\)\\.forEach/g;
if([...app.matchAll(brokenSingleBetChip)].length)throw new Error('Broken single-selector slot bet chip forEach detected');
if(!app.includes("$$('.bet-chip').forEach"))throw new Error('Slot bet chip multi-selector binding missing');
if(!server.includes("bet=b.useRankFree?1000:(royalSlotUnlimited?walletWager"))throw new Error('Rank free spin must bypass wallet wager parsing before free bet override');
