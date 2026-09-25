(function(root){
 'use strict';
 const formatter=new Intl.NumberFormat('ko-KR');
 function integer(n){
  if(typeof n==='bigint')return n;
  if(typeof n==='number')return Number.isFinite(n)?BigInt(Math.trunc(n)):0n;
  const text=String(n??'0').trim().replace(/,/g,'');
  return /^-?\d+$/.test(text)?BigInt(text):0n;
 }
 function exact(n){return formatter.format(integer(n));}
 function compact(n){
  const v=integer(n),abs=v<0n?-v:v;
  if(abs<1000000000000n)return exact(v);
  const units=['','만','억','조','경','해','자','양','구','간','정'];
  let scale=1n,index=0;while(abs>=scale*10000n&&index<units.length-1){scale*=10000n;index++;}
  const high=abs/scale,lowScale=scale/10000n,low=(abs%scale)/lowScale;
  const remainder=abs%lowScale;
  return (v<0n?'-':'')+(remainder?'약 ':'')+exact(high)+units[index]+(low?' '+exact(low)+units[index-1]:'');
 }
 function parseInput(text){
  const clean=String(text??'').trim().replace(/[,\s]/g,'');
  if(!/^\d+$/.test(clean))throw new Error('금액은 1G 이상 정수로 입력해주세요.');
  const value=BigInt(clean);if(value<1n)throw new Error('금액은 1G 이상으로 입력해주세요.');
  return value.toString();
 }
 const api={compact,exact,parseInput};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.JunjaMoney=api;
})(typeof window==='object'?window:globalThis);
