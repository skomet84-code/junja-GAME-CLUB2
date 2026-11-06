'use strict';
/* JUNJA PRIVATE OBJECT ART V10
   Source of every product shot: the six installed original cinematic showrooms.
   Each catalogue ID receives an intentional, repeatable art crop; no outside
   photo URLs, no change to database IDs, purchase checks or balances. */
(()=>{
 const scenes=Object.freeze({
  car:'car',watch:'watch',yacht:'yacht',jet:'jet',estate:'estate',bag:'bag',
  title:'jewelry',costume:'jewelry',pet:'jewelry',frame:'jewelry',jewel:'jewelry',vault:'jewelry',art:'jewelry'
 });
 // Museum hall artwork focal points (0..1 source image coordinates).
 const focus=Object.freeze({
  car:[[.205,.655],[.50,.68],[.835,.675],[.22,.395],[.535,.397],[.825,.41]],
  watch:[[.103,.53],[.272,.53],[.43,.53],[.595,.53],[.75,.53],[.91,.53]],
  yacht:[[.195,.53],[.535,.50],[.765,.49],[.85,.63],[.345,.41],[.67,.36]],
  jet:[[.50,.675],[.188,.525],[.84,.52],[.30,.325],[.77,.33],[.52,.64]],
  estate:[[.26,.39],[.73,.39],[.255,.705],[.75,.71]],
  jewelry:[[.49,.43],[.31,.44],[.68,.44],[.22,.71],[.50,.70],[.77,.69],[.19,.57],[.82,.55]]
 });
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const room=item=>scenes[String(item?.category||'')]||'jewelry';
 const hash=value=>{let h=2166136261;for(const c of String(value||'')){h=Math.imul(h^c.charCodeAt(0),16777619)}return h>>>0};
 function index(item,r){
  const id=(String(item?.id||'')+' '+String(item?.name||'')).toLowerCase();
  if(r==='car'){
   if(/ferrari|페라리/.test(id))return 0;
   if(/lamborghini|람보르기니|황금 제왕|emperor/.test(id))return 1;
   if(/mclaren|맥라렌|이클립스/.test(id))return 2;
   if(/rolls|롤스로이스|팬텀|limousine/.test(id))return 3;
   if(/bentley|벤틀리|골드 gt/.test(id))return 4;
   if(/aston|애스턴|네뷸라/.test(id))return 5;
  }
  if(r==='watch'){
   if(/patek|파텍/.test(id))return 0;
   if(/richard|리차드/.test(id))return 1;
   if(/audemars|오데마/.test(id))return 2;
   if(/rolex|롤렉스/.test(id))return 3;
   if(/vacheron|바쉐론|오로라/.test(id))return 4;
   if(/jacob|제이콥|인피니티/.test(id))return 5;
  }
  if(r==='yacht')return /소버린|sovereign|mega/.test(id)?1:0;
  if(r==='jet')return /noir|느와르|블랙/.test(id)?1:0;
  if(r==='estate')return /island|아일랜드|섬/.test(id)?1:0;
  return hash(item?.id)%focus[r].length;
 }
 function shot(item){
  if(item?.category==='bag'){
   const slug=String(item?.id||'').replace(/^bag_royalboutique_/,'').replaceAll('_','-');
   // Individual, approved-style gallery illustration is served as its own
   // file, not an unrelated jewelry/cars sprite-sheet crop.
   if(!/^(hermes-(birkin|kelly|constance)|chanel-(classic|255|boy))$/.test(slug))
    return {src:'/art/royal/handbags/hermes-birkin.svg',x:50,y:55,zoom:140,room:'bag'};
   return {src:'/art/royal/handbags/'+slug+'.svg',x:50,y:55,zoom:145,room:'bag'};
  }
  const r=room(item),pt=focus[r][index(item,r)],zoom={car:3.35,watch:4.85,yacht:3.00,jet:3.05,estate:2.55,jewelry:3.95}[r];
  const pct=(p)=>Math.max(0,Math.min(100,Math.round(((zoom*p-.5)/(zoom-1))*100)));
  return {src:'/art/royal/cinematic/'+r+'-showroom.webp',x:pct(pt[0]),y:pct(pt[1]),zoom:Math.round(zoom*100),room:r};
 }
 function render(item,alt='명품 소장품'){
  const s=shot(item);
  return '<span class="jrp-product-art jrp-product-'+s.room+'" role="img" aria-label="'+esc(alt)+'" data-art-item="'+esc(item?.id||'')+'" style="--jrp-art-source:url(&quot;'+s.src+'&quot;);--jrp-art-zoom:'+s.zoom+'%;--jrp-art-x:'+s.x+'%;--jrp-art-y:'+s.y+'%"><span class="jrp-product-art-glint" aria-hidden="true"></span></span>';
 }
 window.JunjaRoyalObjects=Object.freeze({shot,render});
})();