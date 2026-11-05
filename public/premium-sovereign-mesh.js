'use strict';
/* SOVEREIGN GT · Original curved 3D concept geometry v2.
 * A complete sculptural silhouette replacement, not an image/CSS rotation.
 * Native self-contained WebGL meshes. Commercial-quality GLB/PBR asset still pending.
 */
(()=>{
 const TAU=Math.PI*2;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const mix=(a,b,t)=>a+(b-a)*t;
 const make=(name,o={})=>({
  name,verts:[],color:o.color||'#647080',gloss:o.gloss??.65,metal:o.metal??.25,
  group:o.group||'static',paint:!!o.paint,light:!!o.light
 });
 const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const normal=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
 function facet(m,a,b,c){
  const n=normal(cross(sub(b,a),sub(c,a)));
  for(const p of [a,b,c])m.verts.push(...p,...n);
 }
 function quad(m,a,b,c,d){facet(m,a,b,c);facet(m,a,c,d);}
 function box(name,center,size,o={}){
  const m=make(name,o),[x,y,z]=center,[sx,sy,sz]=size.map(v=>v/2);
  const p=[[-sx,-sy,-sz],[sx,-sy,-sz],[sx,sy,-sz],[-sx,sy,-sz],[-sx,-sy,sz],[sx,-sy,sz],[sx,sy,sz],[-sx,sy,sz]].map(v=>[v[0]+x,v[1]+y,v[2]+z]);
  for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])quad(m,p[a],p[b],p[c],p[d]);
  return m;
 }
 function cylinder(name,center,r,height,segments,o={}){
  const m=make(name,o),[x,y,z]=center;
  for(let i=0;i<segments;i++){
   const a=i*TAU/segments,b=(i+1)*TAU/segments;
   const pt=(t,h)=>[x+r*Math.cos(t),y+h,z+r*Math.sin(t)];
   quad(m,pt(a,-height/2),pt(b,-height/2),pt(b,height/2),pt(a,height/2));
   facet(m,[x,y+height/2,z],pt(a,height/2),pt(b,height/2));
  }
  return m;
 }
 // A surface grid with shared calculated vertex normals, not flat-shaded bricks.
 function skin(name,rows,o={}){
  const m=make(name,o),r=rows.length,c=rows[0].length,n=rows.map(row=>row.map(()=>[0,0,0]));
  for(let i=0;i<r-1;i++)for(let j=0;j<c-1;j++){
   const a=rows[i][j],b=rows[i+1][j],d=rows[i][j+1],e=rows[i+1][j+1];
   const f=normal(cross(sub(b,a),sub(d,a)));
   const g=normal(cross(sub(e,b),sub(d,b)));
   for(const p of [[i,j],[i+1,j],[i,j+1]])n[p[0]][p[1]]=n[p[0]][p[1]].map((x,k)=>x+f[k]);
   for(const p of [[i+1,j],[i+1,j+1],[i,j+1]])n[p[0]][p[1]]=n[p[0]][p[1]].map((x,k)=>x+g[k]);
  }
  function triangle(pts){
   for(const [i,j] of pts)m.verts.push(...rows[i][j],...normal(n[i][j]));
  }
  for(let i=0;i<r-1;i++)for(let j=0;j<c-1;j++){
   triangle([[i,j],[i+1,j],[i,j+1]]);
   triangle([[i+1,j],[i+1,j+1],[i,j+1]]);
  }
  return m;
 }
 function interpolate(keys,t){
  const i=Math.min(keys.length-2,Math.floor(t)),u=t-i;
  const p0=keys[Math.max(0,i-1)],p1=keys[i],p2=keys[i+1],p3=keys[Math.min(keys.length-1,i+2)];
  return p1.map((v,j)=>{
   // Cardinal spline, tension 0.5; clamp extreme overshoot for panel stability.
   const a=0.5*(p2[j]-p0[j]),b=0.5*(p3[j]-p1[j]);
   return (2*u*u*u-3*u*u+1)*v+(u*u*u-2*u*u+u)*a+(-2*u*u*u+3*u*u)*p2[j]+(u*u*u-u*u)*b;
  });
 }
 function sculptedBody(){
  // Rear -> front. z / half-width / flank-height / crown-height / lower skirt.
  // Continuous venturi profile and swept wheel shoulders in place of old boxy body.
  const station=[
   [-2.66,.58,.69,.75,.47],[-2.47,.88,.77,.83,.43],
   [-2.13,1.09,.87,.92,.42],[-1.58,1.16,.95,1.00,.40],
   [-1.01,1.17,.97,1.07,.42],[-.43,1.12,.96,1.09,.40],
   [.30,1.11,.95,1.08,.39],[1.05,1.17,.94,1.03,.42],
   [1.57,1.18,.93,.97,.43],[2.15,1.04,.79,.83,.42],
   [2.52,.82,.70,.75,.46],[2.77,.50,.64,.65,.51]
  ];
  const rows=[];
  for(let j=0;j<=132;j++){
   const [z,w,s,h,b]=interpolate(station,j/132*(station.length-1));
   const section=[];
   for(let k=0;k<=48;k++){
    const theta=k*TAU/48,cos=Math.cos(theta),sin=Math.sin(theta);
    // Shoulder crest and smooth convex hood; radius at sill never becomes cuboid.
    const x=w*cos*(1+0.014*Math.cos(3*theta));
    const yy=sin>=0?s+(h-s)*Math.pow(sin,.68):s+(s-b)*sin;
    section.push([x,yy,z]);
   }
   rows.push(section);
  }
  return skin('sculpted-body',rows,{color:'#55616e',gloss:.97,metal:.76,paint:true});
 }
 function roofGlass(){
  const profile=[
   [-1.66,.42,1.025,1.065],[-1.36,.59,1.055,1.20],[-1.03,.67,1.07,1.40],
   [-.68,.70,1.08,1.51],[-.12,.71,1.08,1.52],[.28,.69,1.07,1.49],
   [.68,.64,1.055,1.30],[1.10,.57,1.035,1.065]
  ];
  const rows=[];
  for(let i=0;i<=84;i++){
   const [z,w,base,top]=interpolate(profile,i/84*(profile.length-1));
   const row=[];
   for(let j=0;j<=32;j++){
    const a=j*Math.PI/32,s=Math.sin(a);
    row.push([w*Math.cos(a),base+(top-base)*Math.pow(s,.78),z]);
   }
   rows.push(row);
  }
  return skin('cockpit-canopy',rows,{color:'#111d2c',gloss:.98,metal:.24});
 }
 function roofCarbon(){
  // True 3D curved coachwork roof contrasting the smoked front/rear glazing;
  // avoid a toy-like single uninterrupted glass egg.
  const rows=[];
  for(let i=0;i<=28;i++){
   const z=-.64+i/28*.88;
   const row=[];
   for(let j=0;j<=22;j++){
    const x=(j/22*2-1)*.515;
    row.push([x,1.515-.052*Math.pow(Math.abs(x)/.515,2)+.009*Math.sin(i/28*Math.PI),z]);
   }
   rows.push(row);
  }
  return skin('woven-carbon-roof',rows,{color:'#11151c',metal:.62,gloss:.83});
 }
 function wheelArch(name,side,z){
  const points=[];
  for(let i=0;i<=28;i++){
   const a=i*Math.PI/28;
   points.push([side*1.173,.52+.48*Math.sin(a),z+.494*Math.cos(a)]);
  }
  return lineTube(name,points,.023,{color:'#1e2530',metal:.72,gloss:.87},9);
 }
 function frontSplitterWing(side){
  const rows=[];
  for(let i=0;i<=12;i++){
   const z=2.10+i/12*.51;
   const row=[];
   for(let j=0;j<=6;j++){
    const x=side*(.69+j/6*.39);
    row.push([x,.425-.065*j/6+.024*Math.sin(i/12*Math.PI),z]);
   }
   rows.push(row);
  }
  return skin('carbon-front-wing-'+side,rows,{color:'#0c1018',metal:.46,gloss:.80});
 }
 function lineTube(name,points,r,o={},sides=7){
  // Smooth chrome/gold/LED seams following real spatial curves.
  const m=make(name,o);
  for(let j=0;j<points.length-1;j++){
   const a=points[j],b=points[j+1],v=normal(sub(b,a));
   const arbitrary=Math.abs(v[1])<.87?[0,1,0]:[1,0,0];
   const u=normal(cross(v,arbitrary)),w=normal(cross(v,u));
   const pt=(p,t)=>p.map((n,k)=>n+r*(u[k]*Math.cos(t)+w[k]*Math.sin(t)));
   for(let i=0;i<sides;i++){
    const p=i*TAU/sides,q=(i+1)*TAU/sides;
    quad(m,pt(a,p),pt(b,p),pt(b,q),pt(a,q));
   }
  }
  return m;
 }
 function ring(name,c,r,tube,o={},plane='xy'){
  const m=make(name,o),[x,y,z]=c,segments=48,tubesteps=10;
  const pos=(a,b)=>{
   const rr=r+tube*Math.cos(b);
   if(plane==='yz')return [x+tube*Math.sin(b),y+rr*Math.sin(a),z+rr*Math.cos(a)];
   if(plane==='xz')return [x+rr*Math.cos(a),y+tube*Math.sin(b),z+rr*Math.sin(a)];
   return [x+rr*Math.cos(a),y+rr*Math.sin(a),z+tube*Math.sin(b)];
  };
  for(let i=0;i<segments;i++)for(let j=0;j<tubesteps;j++){
   const a=i*TAU/segments,b=(i+1)*TAU/segments,c=j*TAU/tubesteps,d=(j+1)*TAU/tubesteps;
   quad(m,pos(a,c),pos(b,c),pos(b,d),pos(a,d));
  }
  return m;
 }
 function wheelPart(name,c,outer,inner,width,color,o={}){
  const m=make(name,{color,gloss:.35,metal:.05,...o}),[x,y,z]=c;
  for(let i=0;i<48;i++){
   const a=i*TAU/48,b=(i+1)*TAU/48;
   const p=(r,t,h)=>[x+h,y+r*Math.sin(t),z+r*Math.cos(t)];
   quad(m,p(outer,a,-width),p(outer,b,-width),p(outer,b,width),p(outer,a,width));
   quad(m,p(inner,a,width),p(inner,b,width),p(outer,b,width),p(outer,a,width));
   quad(m,p(outer,a,-width),p(outer,b,-width),p(inner,b,-width),p(inner,a,-width));
  }
  return m;
 }
 function spoke(name,side,z,theta,o={}){
  const m=make(name,o),x=side*1.253,y=.52;
  // Double-tapered turbine blade, embedded flush against graphite brake rotor.
  function pt(r,a,dep=0){return [x+dep,y+r*Math.sin(a),z+r*Math.cos(a)]}
  const a=pt(.089,theta-.10),b=pt(.276,theta-.07),c=pt(.278,theta+.068),d=pt(.096,theta+.19);
  quad(m,a,b,c,d);quad(m,pt(.096,theta+.19,-.011),pt(.278,theta+.068,-.011),pt(.276,theta-.07,-.011),pt(.089,theta-.10,-.011));
  return m;
 }
 function wedge(name,p1,p2,p3,p4,height,o={}){
  const m=make(name,o),h=p=>[p[0],p[1]+height,p[2]];
  quad(m,p1,p2,p3,p4);quad(m,h(p4),h(p3),h(p2),h(p1));
  for(const [a,b] of [[p1,p2],[p2,p3],[p3,p4],[p4,p1]])quad(m,a,b,h(b),h(a));
  return m;
 }
 function build(){
  const m=[],add=x=>m.push(x),paint={paint:true,metal:.78,gloss:.97};
  // Compact black marble exhibit; the vehicle, not the plinth, fills the frame.
  add(cylinder('obsidian-plinth',[0,-.30,0],3.03,.25,64,{color:'#0a0c12',metal:.28,gloss:.67}));
  add(cylinder('champagne-gold-trim',[0,-.15,0],3.00,.027,64,{color:'#95774b',metal:.86,gloss:.91}));
  add(cylinder('upper-plinth',[0,-.115,0],2.98,.070,64,{color:'#1a1d26',metal:.42,gloss:.90}));
  add(sculptedBody());
  add(roofGlass());
  add(roofCarbon());
  add(box('ground-shadow',[0,-.03,0],[2.9,.025,5.08],{color:'#070a0f',gloss:.15}));
  add(box('rear-powertrain-grille',[0,.94,-1.90],[.78,.018,.42],{color:'#0c111a',metal:.60,gloss:.35}));
  add(box('engine-cover-center-spine',[0,.945,-1.88],[.06,.018,.46],{color:'#9f835d',metal:.88,gloss:.91}));
  // Sculpted belt line, curved A-pillars, intake grooves and dorsal crease.
  for(const side of [-1,1]){
   add(frontSplitterWing(side));
   add(lineTube('roof-gold-seam-'+side,[[side*.52,1.472,.24],[side*.52,1.484,-.15],[side*.50,1.475,-.63]],.014,{color:'#8f765a',metal:.91,gloss:.91}));
   add(lineTube('windshield-header-'+side,[[side*.16,1.505,.28],[side*.46,1.475,.30],[side*.66,1.35,.62]],.019,{color:'#10151e',metal:.52,gloss:.87}));
   add(lineTube('canopy-side-window-division-'+side,[[side*.67,1.38,-.80],[side*.70,1.23,-1.14]],.019,{color:'#232733',metal:.54,gloss:.84}));
   add(lineTube('belt-line-'+side,[
    [side*.57,.77,2.63],[side*.97,.89,2.23],[side*1.15,.98,1.49],
    [side*1.13,.99,.55],[side*1.15,.98,-.50],[side*1.13,.94,-1.54],[side*.85,.78,-2.38]
   ],.013,{color:'#9e916e',gloss:.93,metal:.90}));
   add(lineTube('a-pillar-'+side,[
    [side*.67,1.045,.95],[side*.74,1.27,.65],[side*.74,1.54,.24],[side*.72,1.62,-.13]
   ],.035,{color:'#11151d',gloss:.86,metal:.60}));
   add(lineTube('roof-edge-'+side,[
    [side*.70,1.62,-.15],[side*.74,1.65,-.49],[side*.69,1.51,-.96],[side*.56,1.24,-1.39]
   ],.027,{color:'#222932',gloss:.90,metal:.65}));
   add(lineTube('hood-crease-'+side,[
    [side*.42,1.07,.94],[side*.47,1.04,1.46],[side*.45,.92,1.88],[side*.35,.76,2.46]
   ],.010,{color:'#a0a9b0',gloss:.92,metal:.8,paint:true}));
   add(lineTube('side-sill-'+side,[
    [side*1.155,.45,-1.10],[side*1.16,.44,-.45],[side*1.16,.45,.45],[side*1.14,.44,1.07]
   ],.028,{color:'#a17d4f',gloss:.91,metal:.86}));
   // Narrow aggressive boomerang LED lamps (real illuminated geometry).
   add(lineTube('headlamp-core-'+side,[
    [side*.43,.78,2.58],[side*.70,.83,2.40],[side*.91,.86,2.14],[side*1.01,.86,1.98]
   ],.038,{color:'#f3f2e2',gloss:.98,metal:.10,group:'headlamp',light:true}));
   add(lineTube('headlamp-glass-'+side,[
    [side*.39,.82,2.57],[side*.66,.86,2.38],[side*.94,.89,2.13]
   ],.051,{color:'#182c3e',gloss:.95,metal:.38}));
   // Sculpted black air inlet silhouettes, deeply inset below front LEDs.
   add(wedge('lower-intake-'+side,
    [side*.38,.54,2.62],[side*.79,.53,2.45],[side*.92,.70,2.25],[side*.48,.68,2.43],
    .018,{color:'#03070c',gloss:.21,metal:.38}));
   add(lineTube('chin-gold-accents-'+side,
    [ [side*.30,.43,2.72],[side*.63,.41,2.54],[side*.88,.40,2.27] ],
    .015,{color:'#c1a06e',metal:.93,gloss:.92}));
   add(wedge('rear-air-scoop-'+side,
    [side*.95,.73,-.86],[side*1.15,.79,-1.04],[side*1.16,.58,-1.60],[side*1.01,.56,-1.49],
    .017,{color:'#080d15',metal:.45,gloss:.25}));
   add(lineTube('rear-intake-blade-'+side,
    [[side*.94,.78,-.91],[side*1.14,.78,-1.06],[side*1.13,.62,-1.53]],
    .019,{color:'#876c4a',metal:.9,gloss:.9}));
   add(lineTube('side-air-channel-'+side,[[side*1.16,.62,-1.42],[side*1.16,.56,-.70],[side*1.15,.56,.19]],.012,{color:'#2b3542',metal:.71,gloss:.8}));
   add(lineTube('tail-led-line-'+side,[[side*.42,.83,-2.56],[side*.74,.83,-2.49],[side*.91,.81,-2.37]],
    .031,{color:'#e54b40',metal:.07,gloss:.92}));
   // High-contrast visible leather cockpit beneath curved shaded glass.
   add(box('seat-upholstery-'+side,[side*.40,1.23,-.44],[.39,.30,.60],{color:'#6f4a32',gloss:.30}));
   add(box('headrest-'+side,[side*.40,1.50,-.70],[.32,.19,.22],{color:'#7d5741',gloss:.25}));
   add(lineTube('seat-gold-stitch-'+side,[[side*.26,1.43,-.24],[side*.26,1.45,-.52],[side*.34,1.51,-.69]],.008,{color:'#e2b47c',gloss:.56}));
   // Moving butterfly doors follow the curved shoulder instead of floating rectangles.
   add(wedge('butterfly-door-'+side,
    [side*.976,.97,.54],[side*1.112,.93,-.67],[side*1.095,.75,-.67],[side*1.005,.75,.54],
    .023,{...paint,group:side<0?'leftDoor':'rightDoor'}));
   add(lineTube('door-sweep-'+side,
    [[side*.984,.99,.52],[side*1.114,.99,-.22],[side*1.105,.97,-.65]],
    .012,{color:'#c2ab7a',metal:.93,gloss:.90,group:side<0?'leftDoor':'rightDoor'}));
   // Deep wheel-well lips visually integrate the actual tire into sculpted body.
   for(const z of [-1.47,1.43])add(wheelArch('integrated-wheel-arch-'+side+'-'+z,side,z));
   // Four articulated tires, turbine rims, visible rotors and brake calipers.
   for(const z of [-1.47,1.43]){
    const x=side*1.01,face=side*1.251;
    add(wheelPart('tire-'+side+'-'+z,[x,.52,z],.477,.313,.183,'#111318'));
    add(ring('tire-sidewall-'+side+'-'+z,[side*1.205,.52,z],.385,.065,{color:'#14191e',gloss:.27,metal:.04},'yz'));
    add(ring('rim-polished-edge-'+side+'-'+z,[face,.52,z],.307,.019,{color:'#cbb88a',gloss:.99,metal:.90},'yz'));
    add(ring('gold-rim-'+side+'-'+z,[face,.52,z],.278,.012,{color:'#303840',gloss:.86,metal:.83},'yz'));
    add(ring('brake-rotor-'+side+'-'+z,[side*1.244,.52,z],.205,.032,{color:'#4d5c69',gloss:.74,metal:.87},'yz'));
    add(box('brake-caliper-'+side+'-'+z,[side*1.245,.67,z+.14],[.021,.14,.08],{color:'#bb573d',gloss:.81,metal:.54}));
    for(let i=0;i<10;i++){
     const theta=i*TAU/10;
     add(spoke('turbine-spoke-'+side+'-'+z+'-'+i,side,z,theta,{color:'#aeb6b5',metal:.9,gloss:.93}));
    }
    add(ring('hub-machined-'+side+'-'+z,[side*1.261,.52,z],.080,.026,{color:'#c9b68d',gloss:.9,metal:.92},'yz'));
    add(box('hub-'+side+'-'+z,[side*1.267,.52,z],[.025,.13,.13],{color:'#101723',metal:.72,gloss:.84}));
   }
  }
  // Underbody, front splitters, rear diffuser and restrained carbon spoiler.
  add(box('front-wide-intake',[0,.53,2.64],[.71,.20,.08],{color:'#030408',gloss:.14,metal:.42}));
  add(lineTube('front-splitter-edge',[[-.68,.42,2.65],[-.40,.40,2.72],[.40,.40,2.72],[.68,.42,2.65]],.019,{color:'#967950',metal:.82,gloss:.85}));
  add(lineTube('front-cowl-cutline',[[-.32,.77,2.48],[0,.80,2.36],[.32,.77,2.48]],.010,{color:'#808c9a',metal:.86,gloss:.9}));
  add(box('front-splitter',[0,.40,2.61],[1.18,.052,.25],{color:'#090d14',gloss:.42,metal:.66}));
  add(box('rear-diffuser',[0,.40,-2.54],[1.25,.065,.24],{color:'#070b11',gloss:.36,metal:.7}));
  add(box('rear-spoiler',[0,1.10,-2.18],[1.61,.045,.19],{color:'#111923',metal:.79,gloss:.9}));
  add(box('spoiler-left',[-.68,1.02,-2.15],[.042,.14,.09],{color:'#151b25',metal:.74}));
  add(box('spoiler-right',[.68,1.02,-2.15],[.042,.14,.09],{color:'#151b25',metal:.74}));
  add(box('center-console',[0,1.19,-.22],[.20,.13,1.15],{color:'#17151c',gloss:.26,metal:.11}));
  add(box('dashboard-instrument-screen',[-.37,1.29,.54],[.40,.035,.16],{color:'#142f42',gloss:.89,metal:.32}));
  add(ring('real-steering-wheel',[-.39,1.47,.36],.21,.030,{color:'#151923',gloss:.6,metal:.36},'xy'));
  add(ring('steering-gold-filigree',[-.39,1.47,.36],.176,.012,{color:'#c5a16f',gloss:.92,metal:.87},'xy'));
  add(box('sovereign-front-emblem',[0,.755,2.65],[.20,.020,.12],{color:'#d3af71',gloss:.95,metal:.92}));
  add(ring('display-gold-halo',[0,-.045,0],2.97,.022,{color:'#b89761',gloss:.9,metal:.86},'xz'));
  for(let i=0;i<24;i++){
   const a=i*TAU/24;
   add(box('dial-index-'+i,[2.84*Math.cos(a),-.044,2.84*Math.sin(a)],[.035,.013,.048],{color:'#ac8b59',metal:.89,gloss:.90}));
  }
  return m.filter(x=>x.verts.length);
 }
 window.JunjaSovereignMeshes=Object.freeze({create:build});
})();