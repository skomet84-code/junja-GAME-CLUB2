(function(root){
 'use strict';
 const formatter=new Intl.NumberFormat('ko-KR');
 const UNITS=['','만','억','조','경','해','자','양','구','간','정','재','극','항하사','아승기','나유타','불가사의','무량대수'];
 function integer(n){
  if(typeof n==='bigint')return n;
  if(typeof n==='number'){
   if(!Number.isFinite(n))return 0n;
   if(!Number.isSafeInteger(n))return BigInt(String(Math.trunc(n)));
   return BigInt(Math.trunc(n));
  }
  const text=String(n??'0').trim().replace(/,/g,'');
  return /^-?\d+$/.test(text)?BigInt(text):0n;
 }
 function exact(n){return formatter.format(integer(n));}
 function compact(n){
  const v=integer(n),abs=v<0n?-v:v;
  if(abs<1000000000000n)return exact(v);
  let scale=1n,index=0;
  while(abs>=scale*10000n&&index<UNITS.length-1){scale*=10000n;index++;}
  const high=abs/scale,lowScale=scale/10000n,low=lowScale>0n?(abs%scale)/lowScale:0n;
  const remainder=lowScale>0n?abs%lowScale:0n;
  return (v<0n?'-':'')+(remainder?'약 ':'')+exact(high)+UNITS[index]+(low?' '+exact(low)+UNITS[index-1]:'');
 }
 function parseInput(text){
  const clean=String(text??'').trim().replace(/[,\s]/g,'');
  if(!/^\d+$/.test(clean))throw new Error('금액은 1G 이상 정수로 입력해주세요.');
  const value=BigInt(clean);if(value<1n)throw new Error('금액은 1G 이상으로 입력해주세요.');
  return value.toString();
 }
 const api={compact,exact,parseInput,toBigInt:integer,units:UNITS.slice()};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.JunjaMoney=api;
})(typeof window==='object'?window:globalThis);
