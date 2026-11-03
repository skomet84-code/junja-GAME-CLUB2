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
function badge(c,cls='',id=''){
 if(!c)return '<span class="crest placeholder">?</span>';
 const icon=symbols[c.id]||symbols.saram;
 return '<span '+(id?'id="'+escape(id)+'" ':'')+'class="crest '+escape(cls)+'" title="'+escape(c.name)+'" style="--primary:'+color(c.primary)+';--secondary:'+color(c.secondary)+'" data-club="'+escape(c.id)+'">'+
  '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke="#fff8df" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">'+icon+'</svg>'+
  '<small>'+escape(c.code)+'</small></span>';
}
window.JPLCrests={badge,clubCount:Object.keys(symbols).length};
})();
