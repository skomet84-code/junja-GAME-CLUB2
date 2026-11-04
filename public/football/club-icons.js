(()=>{'use strict';
// Original, per-club vector insignia. No copyrighted professional-club badges or photos.
const symbols={
 junja:'<path d="M12 21 18 43H46L52 21 40 31 32 17 24 31Z"/><path d="M18 45H46V50H18Z"/><circle cx="12" cy="18" r="3"/><circle cx="32" cy="13" r="3"/><circle cx="52" cy="18" r="3"/>',
 happy:'<path d="M13 15H51V49H13Z"/><path d="M25 16V48M39 16V48"/><path d="M12 32H52"/><path d="M19 24 24 29 31 21 36 29 44 24"/>',
 ara:'<path d="M8 33Q22 11 32 27Q44 10 56 33Q42 30 33 45L32 50 30 45Q21 30 8 33Z"/><path d="M24 28 32 23 40 28M30 47 32 33"/>',
 pig:'<path d="M12 29 17 17 27 22Q32 20 37 22L47 17 52 29V41Q41 52 32 52T12 41Z"/><ellipse cx="32" cy="38" rx="11" ry="8"/><circle cx="28" cy="38" r="2"/><circle cx="36" cy="38" r="2"/><path d="M21 30h2m18 0h2"/>',
 tuna:'<path d="M11 32Q29 12 49 32Q29 52 11 32Z"/><path d="M48 32 59 21V43Z"/><circle cx="21" cy="29" r="2"/><path d="M29 18 34 12 39 20M29 45 34 52 40 44"/>',
 haehyun:'<circle cx="32" cy="32" r="8"/><path d="M32 24Q13 10 23 32Q11 19 15 39Q24 42 32 40Q40 51 49 39Q53 21 41 32Q51 10 32 24Z"/><path d="M32 40V52"/>',
 ubi:'<path d="M32 9 37 23 53 23 40 33 45 49 32 40 19 49 24 33 11 23 27 23Z"/><path d="M32 19V43M20 32H44"/>',
 chacha:'<path d="M16 40Q21 19 37 16Q42 25 38 31L47 39Q32 53 16 40Z"/><path d="M31 25Q35 26 37 29M42 36L55 31M26 45 22 54M38 44 42 53"/>',
 wooni:'<path d="M13 20 23 27 32 22 41 27 51 20 47 42Q32 56 17 42Z"/><path d="M25 36H26M38 36H39M29 43H35L32 47Z"/>',
 dodo:'<path d="M32 14Q45 14 49 27L56 31 47 34Q43 49 31 52Q16 45 12 29Q23 32 27 22Z"/><circle cx="36" cy="27" r="2"/><path d="M17 37Q24 36 29 44M20 51 28 47"/>',
 bisha:'<path d="M32 12 38 21 51 20 47 30 54 39 42 45 37 52H27L22 45 10 39 17 30 13 20 26 21Z"/><path d="M24 32 29 35 32 30 35 35 40 32M26 43H38M32 42V47"/>',
 shasha:'<path d="M12 45H52M19 40 23 46M42 40 39 46"/><path d="M17 31 44 22 48 31 23 40Z"/><path d="M38 22 42 16M48 20 53 17M49 27H56"/><circle cx="22" cy="45" r="5"/><circle cx="43" cy="45" r="5"/>',
 dongdong:'<circle cx="32" cy="32" r="22"/><path d="M32 12V52M12 32H52M32 17 38 26 47 32 38 38 32 47 26 38 17 32 26 26Z"/>',
 bbobbo:'<path d="M32 49 11 30Q10 14 24 17Q30 18 32 25Q34 18 40 17Q54 14 53 30Z"/><path d="M19 28 27 34M45 28 37 34"/>',
 nada:'<path d="M12 50V23H19V15H26V23H38V15H45V23H52V50Z"/><path d="M22 50V34H42V50M28 34V27H36V34M17 28H22M42 28H47"/>',
 gogi:'<path d="M12 18Q15 30 25 29 32 25 39 29Q49 29 52 18Q53 38 42 46L32 53 22 46Q11 38 12 18Z"/><path d="M24 38H27M37 38H40M28 46H36"/>',
 haengju:'<path d="M17 12V54M17 14Q34 9 50 18L39 29 50 38Q32 34 17 40Z"/><path d="M11 54H26"/><path d="M26 23H39"/>',
 sugeon:'<path d="M16 16Q30 8 46 16V45Q31 54 16 45Z"/><path d="M20 25Q32 21 42 25M20 34Q32 30 42 34M20 43Q32 39 42 43"/>',
 mint:'<path d="M32 12 17 31H24L12 43H52L40 31H47Z"/><path d="M28 43V54H36V43M24 29H40"/>',
 hunt:'<path d="M11 26 25 14 32 24 39 14 53 26 43 46H21Z"/><path d="M25 14 32 46 39 14M11 26H53"/>',
 cherry:'<path d="M34 27Q27 16 38 11M34 27Q38 15 47 16"/><path d="M33 27 27 37M39 28 43 37"/><circle cx="23" cy="43" r="10"/><circle cx="45" cy="43" r="10"/><path d="M17 38Q19 34 24 35M40 38Q43 35 47 36"/>',
 hari:'<path d="M32 8 50 26 42 53H22L14 26Z"/><path d="M32 8V53M14 26H50M22 53 32 26 42 53"/>',
 dupal:'<path d="M13 38 19 17 25 25 32 16 39 25 45 17 51 38 43 50H21Z"/><path d="M19 36H45M27 36V49M37 36V49"/>',
 saram:'<circle cx="32" cy="17" r="8"/><path d="M17 35Q32 26 47 35V52H17Z"/><path d="M25 44 32 37 39 44M11 28 17 22M53 28 47 22"/>'
};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const color=s=>/^#[0-9a-fA-F]{6}$/.test(String(s))?s:'#977e55';
let drawn=0;
// Royal Heraldry v4. The logos are original to JPL, with no professional-club artwork.
// The face, metallic edge, inset jewel and contrast are all vector paths: sharp at any size.
const crestShape='M40 3 L72 11 L72 52 Q70 78 40 96 Q10 78 8 52 L8 11 Z';
const innerShape='M40 11 L64 17 L64 52 Q62 70 40 84 Q18 70 16 52 L16 17 Z';
const crests={
  junja:{type:'imperial',theme:'white'},
  happy:{type:'quarters',theme:'sapphire'},
  ara:{type:'wings'},pig:{type:'seal'},tuna:{type:'tides'},
  haehyun:{type:'moon'},ubi:{type:'cross'},chacha:{type:'spur'},
  wooni:{type:'royal'},dodo:{type:'flame'},bisha:{type:'lion'},
  shasha:{type:'cannon'},dongdong:{type:'wolf'},bbobbo:{type:'heart'},
  nada:{type:'castle'},gogi:{type:'bull'},haengju:{type:'flag'},
  sugeon:{type:'lightning'},mint:{type:'forest'},hunt:{type:'stag'},
  cherry:{type:'cherry'},hari:{type:'diamond',theme:'amethyst'},
  dupal:{type:'guard'},saram:{type:'star'}
};
const premiumSpecial={
  junja:
    '<path d="M17 47 13 25 24 34 32 17 40 34 51 25 47 47Z" fill="url(#METAL#)" stroke="#f9e4a8" stroke-width="2" stroke-linejoin="round"/>'+
    '<path d="M17 47H47L44 53H20Z" fill="#f9efd6" stroke="#8b652d" stroke-width="1.4"/>'+
    '<path d="M16 29 24 36 32 23 40 36 48 29" fill="none" stroke="#fff8e5" stroke-width="1.3" opacity=".8"/>'+
    '<circle cx="13" cy="25" r="3" fill="#ffedb9"/><circle cx="32" cy="17" r="3.2" fill="#ffedb9"/><circle cx="51" cy="25" r="3" fill="#ffedb9"/>'+
    '<path d="M27 40 32 35 37 40 32 45Z" fill="#a82f35" stroke="#ffefba" stroke-width="1"/>'+
    '<path d="M23 57H41" stroke="#f7dc9d" stroke-width="1.6"/><text x="32" y="68" fill="#fff7df" font-family="Georgia,serif" font-size="16" font-weight="bold" text-anchor="middle">J</text>',
  happy:
    '<path d="M14 20H50V52L32 64 14 52Z" fill="#0d204f" stroke="#ffe5a8" stroke-width="2"/>'+
    '<path d="M15 22H32V45H15Z" fill="#932845"/><path d="M33 22H49V45H33Z" fill="#234a9a"/>'+
    '<path d="M22 22V44M27 22V44M38 22V44M43 22V44" stroke="#d4a76a" stroke-width="2.1"/>'+
    '<path d="M15 46H49V51L32 62 15 51Z" fill="#5d173a"/>'+
    '<circle cx="32" cy="47" r="9" fill="#f3e2bc" stroke="#c49644" stroke-width="1.6"/>'+
    '<path d="M32 40 37 44 35 50 29 50 27 44Z" fill="#14203c"/>'+
    '<path d="M25 28H39" stroke="#fff7dc" stroke-width="2" opacity=".9"/>',
  hari:
    '<path d="M32 17 48 34 41 56 32 65 23 56 16 34Z" fill="#1f2858" stroke="#f6d49c" stroke-width="2"/>'+
    '<path d="M32 17 48 34 32 33 16 34Z" fill="#c76084"/>'+
    '<path d="M16 34 32 33 32 65 23 56Z" fill="#6f3e97"/>'+
    '<path d="M48 34 32 33 32 65 41 56Z" fill="#345bab"/>'+
    '<path d="M23 31 32 23 41 31 37 49 32 55 27 49Z" fill="url(#METAL#)" stroke="#fff0d3" stroke-width="1.3"/>'+
    '<path d="M23 31H41M32 23V55M27 49H37" fill="none" stroke="#643562" stroke-width="1.7"/>'+
    '<circle cx="32" cy="23" r="2.2" fill="#fff8ee"/>'
};
function star(cx,cy,r){
 let d='';
 for(let i=0;i<10;i++){
  const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.43:r;
  d+=(i?'L':'M')+(cx+Math.cos(a)*rr).toFixed(2)+' '+(cy+Math.sin(a)*rr).toFixed(2);
 }
 return '<path d="'+d+'Z" fill="#fff0b7" stroke="#8a5d25" stroke-width=".6"/>';
}
function livery(c,idx){
 const p=color(c.primary),s=color(c.secondary),a=idx%5;
 if(c.id==='junja')
  return '<rect x="11" y="10" width="58" height="76" fill="#ece9dc"/>'+
   '<path d="M17 14 63 57M17 31 62 74M20 63 41 83" fill="none" stroke="#d2b578" stroke-width="2.4" opacity=".8"/>'+
   '<path d="M18 17V55Q19 72 40 84" fill="none" stroke="#fff" stroke-width="8" opacity=".36"/>';
 if(c.id==='happy')
  return '<rect x="12" y="10" width="55" height="80" fill="#0e234f"/>'+
   '<path d="M15 12H40V87H15Z" fill="#8d1d44"/>'+
   '<path d="M18 13V87M27 13V87M46 13V87M56 13V87" fill="none" stroke="#b53a58" stroke-width="5" opacity=".73"/>';
 if(c.id==='hari')
  return '<rect x="12" y="11" width="56" height="80" fill="#222a64"/>'+
   '<path d="M16 16 64 56V86L16 48Z" fill="#8c3659"/>'+
   '<path d="M40 13 64 34V65L19 24Z" fill="#5a469e" opacity=".78"/>';
 if(a===0)return '<rect x="10" y="11" width="60" height="76" fill="'+p+'"/>'+
  '<path d="M26 11V88M54 11V88" stroke="'+s+'" stroke-width="12" opacity=".85"/>'+
  '<path d="M40 11V88" stroke="#07121c" stroke-width="10" opacity=".35"/>';
 if(a===1)return '<rect x="10" y="11" width="60" height="76" fill="'+p+'"/>'+
  '<path d="M5 27 74 78M4 10 75 60" stroke="'+s+'" stroke-width="16" opacity=".63"/>'+
  '<path d="M6 40 63 82" stroke="#101923" stroke-width="7" opacity=".38"/>';
 if(a===2)return '<rect x="10" y="11" width="60" height="76" fill="'+p+'"/>'+
  '<path d="M7 27 40 61 73 27V48L40 82 7 48Z" fill="'+s+'" opacity=".65"/>'+
  '<path d="M7 19 40 52 73 19" stroke="#fff6d6" stroke-width="2" opacity=".38" fill="none"/>';
 if(a===3)return '<rect x="10" y="11" width="60" height="76" fill="'+s+'"/>'+
  '<path d="M28 11H52V87H28Z" fill="'+p+'"/><path d="M10 35H70V57H10Z" fill="'+p+'"/>'+
  '<path d="M40 11V87M10 46H70" stroke="#f7eac7" stroke-width="2" opacity=".52"/>';
 return '<rect x="10" y="11" width="60" height="76" fill="'+p+'"/>'+
  '<path d="M10 12 70 80M10 79 70 12" stroke="'+s+'" stroke-width="20" opacity=".64"/>'+
  '<path d="M10 12 70 80M10 79 70 12" stroke="#f9f3e8" stroke-width="1.7" opacity=".5"/>';
}
function badge(c,cls='',id=''){
 if(!c)return '<span class="crest placeholder">?</span>';
 const idx=Object.keys(crests).indexOf(c.id),n=++drawn;
 const uid='jplcrest'+n,metal=uid+'m',body=uid+'b',shine=uid+'s',plate=uid+'p',clip=uid+'c';
 const accent=color(c.primary),second=color(c.secondary),icon=symbols[c.id]||symbols.saram;
 const stars=Number(c.attack)>=90?3:Number(c.attack)>=83?2:1;
 const series=Array.from({length:stars},(_,i)=>star(40+(i-(stars-1)/2)*11,18,3.8)).join('');
 const baseSymbol=premiumSpecial[c.id];
 const raisedSymbol=baseSymbol
   ?'<g transform="translate(8 12)">'+baseSymbol.replace(/#METAL#/g,metal)+'</g>'
   :'<g transform="translate(7 17)">'+
       '<g fill="none" stroke="#0b131b" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" opacity=".72">'+icon+'</g>'+
       '<g fill="none" stroke="url(#'+metal+')" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round">'+icon+'</g>'+
       '<g fill="none" stroke="#fff7de" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" opacity=".84" transform="translate(-.8 -1)">'+icon+'</g></g>';
 const featured=c.id==='junja'||c.id==='happy'||c.id==='hari';
 return '<span '+(id?'id="'+escape(id)+'" ':'')+'class="crest '+escape(cls)+'" data-club="'+escape(c.id)+'" title="'+escape(c.name)+'" role="img" aria-label="'+escape(c.name)+' 구단 엠블럼">'+
 '<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+
 '<defs>'+
  '<linearGradient id="'+metal+'" x1="0%" y1="0%" x2="100%" y2="87%"><stop stop-color="#fff9da"/><stop offset=".19" stop-color="#dbb86d"/><stop offset=".37" stop-color="#fff0b9"/><stop offset=".57" stop-color="#b28136"/><stop offset=".78" stop-color="#f0d18e"/><stop offset="1" stop-color="#765022"/></linearGradient>'+
  '<linearGradient id="'+body+'" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#27323c"/><stop offset=".52" stop-color="#090f18"/><stop offset="1" stop-color="#23323b"/></linearGradient>'+
  '<linearGradient id="'+shine+'" x1="0%" y1="0%" x2="100%" y2="85%"><stop stop-color="#fff" stop-opacity=".42"/><stop offset=".28" stop-color="#fff" stop-opacity=".07"/><stop offset=".7" stop-color="#000" stop-opacity=".13"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>'+
  '<radialGradient id="'+plate+'"><stop stop-color="#192a35" stop-opacity=".97"/><stop offset=".65" stop-color="#0c1924" stop-opacity=".91"/><stop offset="1" stop-color="#020910" stop-opacity=".98"/></radialGradient>'+
  '<clipPath id="'+clip+'"><path d="'+innerShape+'"/></clipPath>'+
 '</defs>'+
 '<path d="'+crestShape+'" fill="#03080d" stroke="#000" stroke-width="2" transform="translate(0 1.7)" opacity=".77"/>'+
 '<path d="'+crestShape+'" fill="url(#'+metal+')" stroke="#fff5c8" stroke-width="1.25"/>'+
 '<path d="M40 6 68 13 68 53Q66 75 40 91 14 75 12 53V13Z" fill="#12171e" stroke="#8c6336" stroke-width="1.2"/>'+
 '<path d="'+innerShape+'" fill="url(#'+body+')" stroke="#f5dba4" stroke-width="1"/>'+
 '<g clip-path="url(#'+clip+')">'+livery(c,idx<0?0:idx)+
  '<path d="'+innerShape+'" fill="url(#'+shine+')" opacity=".82"/>'+
  '<path d="M19 17V54Q21 70 40 80" fill="none" stroke="#fff" stroke-opacity=".19" stroke-width="2.5"/>'+
  '<path d="M60 17V54Q59 70 40 80" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="4"/>'+
  '<path d="M16 68Q40 82 64 68" stroke="#ffdfa0" stroke-opacity=".54" fill="none" stroke-width="1.2"/>'+
 '</g>'+
 '<path d="M18 24Q40 18 62 24" fill="none" stroke="#f5d89d" stroke-width=".8" opacity=".7"/>'+
 '<path d="M20 31Q10 45 18 61M60 31Q70 45 62 61" stroke="#f5d89d" stroke-width="1.3" opacity=".55" fill="none"/>'+
 (!featured?'<circle cx="40" cy="49" r="23.6" fill="url(#'+plate+')" stroke="#25190d" stroke-width="3"/>'+
  '<circle cx="40" cy="49" r="23.6" fill="none" stroke="url(#'+metal+')" stroke-width="1.4"/>'+
  '<circle cx="40" cy="49" r="20.5" fill="none" stroke="#fff7d5" stroke-opacity=".26" stroke-width=".8"/>':'')+
 '<g>'+raisedSymbol+'</g>'+
 '<g>'+series+'</g>'+
 '<path d="M14 79Q40 89 66 79L65 91Q40 101 15 91Z" fill="#090f16" stroke="url(#'+metal+')" stroke-width="2"/>'+
 '<path d="M18 82Q40 89 62 82" fill="none" stroke="#fff1bb" stroke-opacity=".45" stroke-width=".75"/>'+
 '<text x="40" y="91" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10.5" font-weight="900" letter-spacing="1.25" fill="#ffeab8" stroke="#000" stroke-width=".55" paint-order="stroke">'+escape(c.code)+'</text>'+
 '<path d="M40 3L72 11" fill="none" stroke="#fff8e0" stroke-width=".85" opacity=".62"/>'+
 '</svg></span>';
}
window.JPLCrests={badge,clubCount:Object.keys(symbols).length};
})();
