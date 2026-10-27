/* BLACKROOM IMMERSIVE INVESTIGATION — presentation-only visual layer. Zero wallet or account changes. */
(function(root){
'use strict';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
const svgBegin='<svg class="br-room-art" viewBox="0 0 900 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="br-wall" x1="0" y1="0" x2="0.7" y2="1"><stop stop-color="#1e3240"/><stop offset=".65" stop-color="#0c171f"/><stop offset="1" stop-color="#091017"/></linearGradient><linearGradient id="br-floor" x1="0" y1="0" x2="0.6" y2="1"><stop stop-color="#21313a"/><stop offset="1" stop-color="#080f15"/></linearGradient><radialGradient id="br-light"><stop stop-color="#ffe5a0" stop-opacity=".33"/><stop offset="1" stop-color="#ffe5a0" stop-opacity="0"/></radialGradient><linearGradient id="br-glass" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#7fc8bf" stop-opacity=".35"/><stop offset="1" stop-color="#274653" stop-opacity=".12"/></linearGradient></defs>';
function shelf(x,y,w,h){
 let s='<g><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="3" fill="#090e14" stroke="#758078" stroke-opacity=".5"/>';
 for(let k=0;k<4;k++){let sy=y+17+k*(h-24)/4;s+='<rect x="'+(x+6)+'" y="'+sy+'" width="'+(w-12)+'" height="3" fill="#64727b" opacity=".65"/>';
 for(let j=0;j<6;j++)s+='<rect x="'+(x+10+j*(w-20)/6)+'" y="'+(sy-18)+'" width="'+(w-25)/7+'" height="16" fill="'+(['#7b7161','#576b70','#2f4850','#766a58'][((j+k)%4)])+'" opacity=".86"/>';
 }return s+'</g>';
}
function servers(x,y){
 let s='<g>';for(let i=0;i<3;i++){let sx=x+i*112;s+='<rect x="'+sx+'" y="'+(y+i*8)+'" width="99" height="'+(310-i*10)+'" rx="4" fill="#0a1219" stroke="#5d8187" stroke-width="3"/>';
 for(let j=0;j<7;j++){let yy=y+i*8+16+j*39;s+='<rect x="'+(sx+8)+'" y="'+yy+'" width="82" height="29" rx="2" fill="#182d37" stroke="#374f57"/><rect x="'+(sx+14)+'" y="'+(yy+6)+'" width="42" height="2" fill="#6c8e97" opacity=".6"/><circle cx="'+(sx+77)+'" cy="'+(yy+15)+'" r="3.5" fill="'+(j%3===0?'#efac75':'#81d9bf')+'" class="br-led"/>';}
 }return s+'</g>';
}
function archive(){
 return shelf(36,125,175,294)+shelf(229,135,166,284)+
 '<rect x="527" y="247" width="300" height="22" rx="3" fill="#746755"/><path d="M549 269 L526 474 M795 269 L826 474" stroke="#554e46" stroke-width="15"/>'+
 '<rect x="617" y="160" width="148" height="90" rx="5" fill="#050d13" stroke="#748f91" stroke-width="7"/><path d="M632 199h113M632 215h78" stroke="#81cbbc" stroke-width="3" opacity=".8"/>'+
 '<rect x="651" y="251" width="85" height="8" rx="4" fill="#637b7f"/>'+
 '<path d="M554 245 l33 -40 86 35 -21 18z" fill="#ddd0a7" opacity=".86"/><path d="M575 236 l69 11 M577 228 l45 8" stroke="#736a55" stroke-width="2"/>'+
 '<rect x="815" y="109" width="55" height="204" fill="#18262c" stroke="#697d7e" stroke-width="4"/><path d="M829 132h27M829 149h27M829 166h27" stroke="#b8a886" stroke-width="3"/>';
}
function datacenter(){
 return servers(28,100)+servers(540,111)+
 '<path d="M354 500 L414 198 L490 198 L561 500" fill="#10222c" stroke="#54827c" stroke-opacity=".46" stroke-width="4"/>'+
 '<rect x="377" y="107" width="162" height="98" rx="9" fill="#09151b" stroke="#8babac" stroke-width="5"/>'+
 '<rect x="391" y="118" width="134" height="76" fill="#164b53"/><path d="M402 152h30l12 -23 18 42 15 -17h37" fill="none" stroke="#9fe7bd" stroke-width="4"/>'+
 '<path d="M88 437 C238 395 251 487 381 459 M822 424 C654 393 655 490 503 452" fill="none" stroke="#cd9c6d" stroke-width="6" opacity=".5"/>';
}
function disposal(){
 return '<rect x="22" y="127" width="225" height="313" fill="#16222a" stroke="#5a6666" stroke-width="6"/>'+
 '<path d="M45 162h180M45 223h180M45 284h180M45 345h180" stroke="#75827f" stroke-width="6"/>'+
 '<rect x="275" y="268" width="380" height="154" rx="8" fill="#303b3a" stroke="#8e8a78" stroke-width="6"/>'+
 '<rect x="300" y="274" width="330" height="28" fill="#090f15"/><path d="M322 341h278" stroke="#d8ab73" stroke-dasharray="18 12" stroke-width="3"/>'+
 '<rect x="339" y="190" width="83" height="91" fill="#635b50"/><rect x="424" y="198" width="87" height="82" fill="#81755e"/>'+
 '<path d="M693 129h159v289H693z" fill="#0c131a" stroke="#9a7461" stroke-width="8"/>'+
 '<path d="M722 164h98M722 205h98M722 246h98" stroke="#ae8975" stroke-width="7"/>'+
 '<ellipse cx="758" cy="321" rx="64" ry="39" fill="#c38f51" opacity=".2"/>'+
 '<path d="M735 320h50v8h-50zM770 320l13 -12 9 12 -9 12z" fill="#e5c99c"/>';
}
function room(c,p){
 const k=p.scene,t=['ARCHIVE / RECORDS','SECURE NETWORK / RECOVERY','EVIDENCE TRANSFER / VAULT'][k];
 const palette=['#e2c894','#81d5d1','#efa77b'][k];
 let art=svgBegin+
 '<rect width="900" height="500" fill="url(#br-wall)"/><path d="M0 341 900 341 900 500 0 500" fill="url(#br-floor)"/>'+
 '<path d="M0 340h900M450 340 220 500M450 340 690 500M450 340v160" stroke="#83908a" stroke-opacity=".24" stroke-width="2"/>'+
 '<path d="M0 80 900 80M0 85 900 85" stroke="#435560" opacity=".5" stroke-width="3"/>'+
 '<ellipse cx="490" cy="90" rx="360" ry="270" fill="url(#br-light)"/>'+
 '<rect x="350" y="18" width="205" height="16" rx="3" fill="#e8dbb9" opacity=".87"/>'+
 (k===0?archive():k===1?datacenter():disposal())+
 '<rect width="900" height="500" fill="#020810" opacity=".11"/>'+
 '</svg>';
 const candidates=c.clues.filter(x=>x.scene===k);
 const points=k===0?[[19,52],[55,66],[81,35]]:k===1?[[29,51],[53,40],[76,72]]:[[37,55],[83,62]];
 let hotspots=candidates.map((e,i)=>{
  const found=p.clues.includes(e.id),pt=points[i]||[50,50];
  return '<button type="button" class="br-hotspot'+(found?' is-found':'')+'" style="left:'+pt[0]+'%;top:'+pt[1]+'%" data-clue="'+esc(e.id)+'" aria-label="'+esc(e.name)+' 조사">'+
   '<span class="br-target">'+(found?'✓':'⌕')+'</span><span class="br-spot-caption">'+(found?esc(e.name):'단서 조사')+'</span></button>';
 }).join('');
 return '<div class="br-scene-head"><div><span class="br-sector">● LIVE INVESTIGATION / FILE '+String(c.id).padStart(3,'0')+'</span><h2>'+esc(c.locations[k])+'</h2></div><span class="br-scan-status">증거 '+p.clues.length+' / 8</span></div>'+
 '<div class="br-room br-room-'+k+'" style="--br-glow:'+palette+'">'+art+
 '<div class="br-room-hud"><span>◉ 현장 탐색 모드</span><span>빛나는 지점을 눌러 조사</span></div>'+hotspots+
 '<div class="br-room-grain"></div></div>'+
 '<div class="br-scene-legend"><span><i class="br-legend-dot"></i> 점멸하는 단서 터치</span><span>✓ 기록 완료</span></div>';
}
function challenge(c,e){
 return '<div class="br-forensic">'+
 '<div class="br-forensic-tag">DIGITAL FORENSICS / USB-002</div><h2 id="srModalTitle">검은 USB · 원본 복원</h2>'+
 '<p>삭제된 영상 3개가 남아 있다. CCTV는 실제보다 7분 느렸다. <b>조작되지 않은 사건의 실제 시각</b>을 골라 원본을 복원해.</p>'+
 '<div class="br-monitor"><span class="br-monitor-top">CAM 13 · RECOVERY MODE <b class="br-rec">● REC</b></span>'+
 '<div class="br-monitor-picture"><span class="br-ghost">?</span><span class="br-crosshair">＋</span><span class="br-timecode">23 : ? ?</span></div>'+
 '<div class="br-monitor-bottom">RECOVERED SEGMENTS // 03 FOUND</div></div>'+
 '<div class="br-recovery-grid">'+
 '<button type="button" data-imm-answer="a" data-imm-clue="'+esc(e.id)+'"><small>FILE 01</small><strong>23:17</strong><span>CCTV 표시 시각</span></button>'+
 '<button type="button" data-imm-answer="b" data-imm-clue="'+esc(e.id)+'"><small>FILE 02</small><strong>23:31</strong><span>후속 감시 기록</span></button>'+
 '<button type="button" data-imm-answer="c" data-imm-clue="'+esc(e.id)+'"><small>FILE 03</small><strong>23:24</strong><span>미상 단편 C · 비교 필요</span></button></div>'+
 '<p class="br-forensic-foot">현장 시계와 녹화장비는 서로 다른 기준을 쓴다. 시간의 출처를 재검증해.</p><p class="br-failure" aria-live="polite"></p></div>';
}
function checkChallenge(caseId,clue,answer){return Number(caseId)===2&&clue==='e5'&&answer==='c';}
function recovered(c,e){
 return '<div class="br-proof-recovered"><span class="br-proof-tick">✓</span><span class="br-forensic-tag">ORIGINAL FOOTAGE RECOVERED</span><h2 id="srModalTitle">영상 원본 확보</h2>'+
 '<p>시각 보정 자료와 대조해 원본의 실제 촬영 시각을 복원했어.</p>'+
 '<div class="br-discovery">'+esc(e.description)+'</div><button class="sr-btn" data-global="close">증거 수첩에 저장하고 계속 조사 →</button></div>';
}
function artifact(c,e){
 const icons=['▤','▣','⌑','⌘','◷','◈','⌁','⚿'];let kind=e.id==='e5'&&c.id===2?'RECOVERED ORIGINAL':e.id==='e7'&&c.id===2?'PHYSICAL EVIDENCE':'EVIDENCE VERIFIED';
 return '<div class="br-artifact"><div class="br-artifact-icon">'+icons[Number(e.id.substring(1))]+'</div>'+
 '<span class="br-forensic-tag">'+kind+' / '+esc(e.id.toUpperCase())+'</span><h2 id="srModalTitle">'+esc(e.name)+'</h2>'+
 '<div class="br-discovery">'+esc(e.description)+'</div>'+
 '<div class="br-artifact-stamp">✓ 수사 기록에 확보됨</div><button class="sr-btn" data-global="close">계속 조사 →</button></div>';
}
function interview(w,res){
 return '<div class="br-interrogation"><div class="br-interrogation-stage"><div class="br-person-shape"><div></div></div>'+
 '<span>INTERROGATION ROOM <b class="br-rec">● REC</b></span></div>'+
 '<div class="br-speaker">'+esc(w.name)+'<small>'+esc(w.role)+'</small></div>'+
 '<blockquote>“'+esc(res.message)+'”</blockquote>'+
 '<p class="br-interrogation-status">'+(res.reveal?'✓ 거짓 진술의 모순을 입증했어':'증거가 더 필요해. 수사 보드에서 기록을 연결해.')+'</p>'+
 '<button class="sr-btn" data-global="close">심문 종료 →</button></div>';
}
function board(c,p,selection){
 let cards=p.clues.map(id=>{
  const e=c.clues.find(x=>x.id===id),chosen=selection.includes(id);
  return '<button class="br-pin'+(chosen?' chosen':'')+'" type="button" data-evidence="'+esc(id)+'"><small>FILE '+esc(id.toUpperCase())+'</small><span class="br-pin-icon">◈</span><strong>'+esc(e.name)+'</strong><em>'+(chosen?'선택됨':'증거 연결하기')+'</em></button>';
 }).join('');
 let proven=p.theories.map(id=>{let t=c.theories.find(x=>x.id===id);return '<div class="br-theory-done">✓ '+esc(t.name)+'</div>';}).join('');
 return '<div class="br-board-top"><span class="br-sector">INFERENCE / RED THREAD</span><h2>증거 관계망</h2><p>서로 관계있는 증거 두 개를 터치해서 연결해. 논리적 근거가 맞으면 추론이 입증돼.</p></div>'+
 '<div class="br-board"><div class="br-redwire"></div><div class="br-pin-grid">'+cards+'</div></div>'+
 '<div class="br-connection-panel"><span>'+selection.length+' / 2개 선택</span>'+
 '<button class="sr-btn" type="button" data-action="connect" '+(selection.length!==2?'disabled':'')+'>붉은 실로 연결 →</button>'+
 '<button class="sr-btn ghost" type="button" data-action="clear">선택 취소</button></div>'+
 '<div class="br-proof-log"><strong>입증한 추론 '+p.theories.length+' / 3</strong>'+ (proven||'<p>서로 연결되는 증거를 찾아봐.</p>')+'</div>';
}
root.BlackRoomImmersive=Object.freeze({room,challenge,checkChallenge,recovered,artifact,interview,board});
})(typeof window!=='undefined'?window:{});
