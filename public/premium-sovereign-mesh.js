'use strict';
/* Original procedural proof-of-concept meshes. These are genuine 3D triangles,
   not a still photo or CSS-rotated image. High-detail PBR production GLB TBD. */
(()=> {
 const TAU=Math.PI*2;
 function make(name,opts={}){return {name,verts:[],color:opts.color||'#999999',gloss:opts.gloss??0.5,metal:opts.metal??0.1,group:opts.group||'static',paint:!!opts.paint,light:!!opts.light};}
 function tri(m,a,b,c){
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const l=Math.hypot(...n)||1;n=n.map(x=>x/l);
  for(const p of [a,b,c])m.verts.push(...p,...n);
 }
 function quad(m,a,b,c,d){tri(m,a,b,c);tri(m,a,c,d);}
 function box(name,c,size,opts={}){
  const m=make(name,opts),[x,y,z]=c,[a,b,d]=size.map(v=>v/2);
  const p=[[-a,-b,-d],[a,-b,-d],[a,b,-d],[-a,b,-d],[-a,-b,d],[a,-b,d],[a,b,d],[-a,b,d]].map(q=>[q[0]+x,q[1]+y,q[2]+z]);
  for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])quad(m,p[a],p[b],p[c],p[d]);
  return m;
 }
 function cylinder(name,center,radius,height,sides,opts={}){
  const m=make(name,opts),[x,y,z]=center,top=y+height/2,bottom=y-height/2;
  for(let i=0;i<sides;i++){
   const a=i*TAU/sides,b=(i+1)*TAU/sides;
   const p=(t,h)=>[x+Math.cos(t)*radius,h,z+Math.sin(t)*radius];
   quad(m,p(a,bottom),p(b,bottom),p(b,top),p(a,top));
   tri(m,[x,top,z],p(a,top),p(b,top));tri(m,[x,bottom,z],p(b,bottom),p(a,bottom));
  }
  return m;
 }
 function wheelPart(name,c,outer,inner,halfWidth,color,opts={}){
  const m=make(name,{color,gloss:0.30,metal:0.08,...opts}),[x,y,z]=c,steps=24;
  for(let i=0;i<steps;i++){
   const a=i*TAU/steps,b=(i+1)*TAU/steps;
   function p(rad,theta,dx){return [x+dx,y+Math.sin(theta)*rad,z+Math.cos(theta)*rad]}
   quad(m,p(outer,a,-halfWidth),p(outer,b,-halfWidth),p(outer,b,halfWidth),p(outer,a,halfWidth));
   quad(m,p(inner,a,halfWidth),p(inner,b,halfWidth),p(outer,b,halfWidth),p(outer,a,halfWidth));
   quad(m,p(outer,a,-halfWidth),p(outer,b,-halfWidth),p(inner,b,-halfWidth),p(inner,a,-halfWidth));
  }
  return m;
 }
 function roofLoft(){
  // Wide fastback and narrower upper greenhouse with front swept windshield.
  const m=make('cockpit-canopy',{color:'#121e2b',gloss:0.96,metal:0.45});
  const sec=[
   {z:-1.42,wide:.82,low:1.04,high:1.06,cap:.73},
   {z:-.75,wide:.88,low:1.12,high:1.78,cap:.68},
   {z:.45,wide:.80,low:1.12,high:1.68,cap:.63},
   {z:1.13,wide:.88,low:1.02,high:1.04,cap:.76}
  ];
  for(let k=0;k<sec.length-1;k++){
   const a=sec[k],b=sec[k+1];
   for(const sign of [-1,1]){
    quad(m,[sign*a.wide,a.low,a.z],[sign*b.wide,b.low,b.z],[sign*b.cap,b.high,b.z],[sign*a.cap,a.high,a.z]);
   }
   quad(m,[-a.cap,a.high,a.z],[a.cap,a.high,a.z],[b.cap,b.high,b.z],[-b.cap,b.high,b.z]);
  }
  return m;
 }
 function chassis(){
  const m=make('sculpted-body',{color:'#8c8f9f',gloss:.96,metal:.75,paint:true});
  const sections=[
   {z:-2.44,w:.70,b:.54,t:.78},{z:-2.08,w:1.01,b:.49,t:1.04},
   {z:-1.18,w:1.11,b:.46,t:1.14},{z:.35,w:1.12,b:.45,t:1.10},
   {z:1.24,w:1.04,b:.45,t:.93},{z:2.21,w:.88,b:.44,t:.84},
   {z:2.56,w:.59,b:.45,t:.71}
  ];
  for(let i=0;i<sections.length-1;i++){
   const a=sections[i],b=sections[i+1];
   quad(m,[-a.w,a.t,a.z],[a.w,a.t,a.z],[b.w,b.t,b.z],[-b.w,b.t,b.z]);
   quad(m,[-a.w,a.b,a.z],[-b.w,b.b,b.z],[-b.w,b.t,b.z],[-a.w,a.t,a.z]);
   quad(m,[a.w,a.b,a.z],[a.w,a.t,a.z],[b.w,b.t,b.z],[b.w,b.b,b.z]);
  }
  return m;
 }
 function wedge(name,p1,p2,p3,p4,height,opts={}){
  const m=make(name,opts),high=p=>[p[0],p[1]+height,p[2]];
  quad(m,p1,p2,p3,p4);
  quad(m,high(p4),high(p3),high(p2),high(p1));
  for(const [a,b] of [[p1,p2],[p2,p3],[p3,p4],[p4,p1]])quad(m,a,b,high(b),high(a));
  return m;
 }
 // Curved torus triangles for wheel accents, cockpit steering and ambient
 // showroom sculpture. These are actual 3D meshes, not a photographic layer.
 function ring(name,center,major,minor,opts={},plane='xy'){
  const m=make(name,opts),[x,y,z]=center,steps=36,tube=10;
  const p=(u,v)=>{
   const outer=major+Math.cos(v)*minor;
   if(plane==='xy')return [x+Math.cos(u)*outer,y+Math.sin(u)*outer,z+Math.sin(v)*minor];
   if(plane==='yz')return [x+Math.sin(v)*minor,y+Math.cos(u)*outer,z+Math.sin(u)*outer];
   return [x+Math.cos(u)*outer,y+Math.sin(v)*minor,z+Math.sin(u)*outer];
  };
  for(let i=0;i<steps;i++)for(let j=0;j<tube;j++){
   const u=i*TAU/steps,u2=(i+1)*TAU/steps,v=j*TAU/tube,v2=(j+1)*TAU/tube;
   quad(m,p(u,v),p(u2,v),p(u2,v2),p(u,v2));
  }
  return m;
 }
 function create(){
  const m=[];
  const add=x=>m.push(x);
  // Sculptural black marble display stage + two gold inset trim rings.
  add(cylinder('obsidian-plinth',[0,-.33,0],3.64,.30,48,{color:'#11111a',gloss:.81,metal:.24}));
  add(cylinder('champagne-gold-trim',[0,-.15,0],3.53,.055,48,{color:'#c9a86f',gloss:.83,metal:.75}));
  add(cylinder('upper-plinth',[0,-.09,0],3.47,.10,48,{color:'#24232b',gloss:.82,metal:.32}));
  add(box('ground-shadow',[0,-.014,0],[2.8,.015,5.12],{color:'#0a101a',gloss:.1}));
  add(chassis());
  add(roofLoft());
  add(box('front-splitter',[0,.42,2.45],[1.25,.08,.23],{color:'#060a0f',gloss:.49,metal:.7}));
  add(box('rear-diffuser',[0,.41,-2.36],[1.38,.08,.25],{color:'#0a0e13',gloss:.44,metal:.76}));
  add(box('center-stripe',[0,1.108,.32],[.07,.012,.93],{color:'#b69d70',gloss:1,metal:.74}));
  add(box('nose-badge',[0,.779,2.35],[.23,.017,.18],{color:'#cbb77e',gloss:.84,metal:.74}));
  add(box('cockpit-dashboard',[0,1.18,.62],[1.25,.08,.38],{color:'#14151c',gloss:.38,metal:.2}));

  // Interior craft: leather console, dashboard display, steering rim,
  // exposed stitching and instrument components under the greenhouse.
  add(box('center-console',[0,1.155,-.20],[.23,.17,1.25],{color:'#1e1b1d',gloss:.24,metal:.18}));
  add(box('console-carbon-inlay',[0,1.25,-.17],[.15,.015,1.02],{color:'#303039',gloss:.72,metal:.66}));
  add(box('dashboard-instrument-screen',[-.39,1.255,.69],[.46,.055,.19],{color:'#19344c',gloss:.96,metal:.27}));
  add(box('dashboard-gold-bezel',[-.39,1.29,.69],[.49,.016,.23],{color:'#c1a576',gloss:.77,metal:.88}));
  add(ring('real-steering-wheel',[-.39,1.43,.45],.24,.038,{color:'#1b1b21',gloss:.68,metal:.32},'xy'));
  add(ring('steering-gold-filigree',[-.39,1.43,.45],.204,.012,{color:'#caaf75',gloss:.93,metal:.86},'xy'));
  add(box('steering-hub',[-.39,1.43,.45],[.16,.15,.045],{color:'#c3a36b',gloss:.78,metal:.82}));
  add(box('windshield-brow',[0,1.80,-.74],[1.35,.045,.055],{color:'#151722',gloss:.8,metal:.6}));
  add(box('rear-glass-crossbar',[0,1.70,.40],[1.27,.052,.048],{color:'#1b2026',gloss:.81,metal:.63}));
  // Sculpted nose vents and low, recessed air intakes.
  add(box('front-wide-intake',[0,.57,2.50],[.86,.19,.085],{color:'#03060b',gloss:.23,metal:.54}));
  for(const side of [-1,1]){
   add(box('lower-intake-'+side,[side*.84,.61,2.36],[.32,.18,.085],{color:'#06090e',gloss:.25,metal:.53}));
   add(box('chin-gold-accents-'+side,[side*.66,.435,2.49],[.44,.022,.08],{color:'#b39465',gloss:.92,metal:.89}));
   add(box('hood-vent-'+side,[side*.58,1.135,1.48],[.27,.018,.63],{color:'#0a0d13',gloss:.7,metal:.71}));
   add(box('hood-vent-inset-'+side,[side*.58,1.152,1.52],[.15,.017,.47],{color:'#24252d',gloss:.64,metal:.62}));
   add(box('front-corner-canard-'+side,[side*.94,.53,2.32],[.22,.037,.48],{color:'#10121b',gloss:.75,metal:.71}));
   add(box('rear-air-scoop-'+side,[side*.90,.87,-1.19],[.13,.25,.50],{color:'#090c14',gloss:.67,metal:.74}));
   add(box('cockpit-gold-edge-'+side,[side*.71,1.747,-.64],[.045,.032,.59],{color:'#c0a36f',gloss:.98,metal:.83}));
   add(box('seat-upholstery-'+side,[side*.44,1.28,-.45],[.40,.18,.61],{color:'#795845',gloss:.23,metal:.05}));
   add(box('seat-gold-stitch-'+side,[side*.44,1.385,-.33],[.03,.008,.56],{color:'#bf9d6c',gloss:.4,metal:.26}));
   add(box('headrest-inlay-'+side,[side*.44,1.65,-.67],[.28,.010,.15],{color:'#9a7652',gloss:.30,metal:.11}));
   add(box('floor-sill-accent-'+side,[side*1.17,.51,-.23],[.026,.024,1.6],{color:'#b69d74',gloss:.91,metal:.84}));
   // Gold inner wheel discs and ventilated brake faces, physically distinct.
   for(const z of [-1.47,1.43]){
    add(ring('rim-polished-edge-'+side+'-'+z,[side*1.317,.50,z],.326,.018,
     {color:'#e3c995',gloss:.99,metal:.91},'yz'));
    add(ring('brake-rotor-'+side+'-'+z,[side*1.273,.50,z],.222,.023,
     {color:'#4c5765',gloss:.64,metal:.79},'yz'));
    add(box('brake-caliper-'+side+'-'+z,[side*1.307,.67,z+.14],[.022,.15,.09],
     {color:'#ae6040',gloss:.72,metal:.61}));
   }
   add(box('tail-led-line-'+side,[side*.63,.911,-2.38],[.47,.022,.04],{color:'#e64b37',gloss:.92,metal:.33}));
   add(ring('dual-exhaust-'+side,[side*.47,.455,-2.45],.12,.02,{color:'#c5bdad',gloss:.94,metal:.82},'xy'));
  }
  // Radial-cut engraved display plinth: actual 3D gold geometry.
  for(let i=0;i<24;i++){
   const angle=i*TAU/24;
   const radius=3.27;
   add(box('dial-index-'+i,[Math.cos(angle)*radius,.002,Math.sin(angle)*radius],
    [.055,.012,.055],{color:'#b49563',gloss:.82,metal:.85}));
  }
  add(ring('display-gold-halo',[0,.015,0],3.37,.024,{color:'#c49e60',gloss:.87,metal:.78},'xz'));
  add(box('sovereign-front-emblem',[0,.68,2.58],[.34,.025,.055],{color:'#d5b778',gloss:.94,metal:.91}));

  // Individually shaded seats visible through glass canopy.
  for(const side of [-1,1]){
   add(box('bucket-seat-'+side,[side*.44,1.25,-.45],[.53,.44,.72],{color:'#563b2e',gloss:.19}));
   add(box('headrest-'+side,[side*.44,1.51,-.68],[.46,.30,.24],{color:'#70513f',gloss:.20}));
   // Door slab geometry is attached to a real turning hinge, not CSS transforms.
   add(wedge('butterfly-door-'+side,
    [side*.97,.96,.53],[side*1.114,.95,-.82],[side*1.114,1.05,-.82],[side*.97,1.08,.53],
    .032,{color:'#8c8f9f',gloss:.93,metal:.7,paint:true,group:side===-1?'leftDoor':'rightDoor'}));
   add(box('side-sill-'+side,[side*1.085,.55,-.13],[.10,.15,1.42],{color:'#12141e',gloss:.63,metal:.5}));
   add(box('side-mirror-'+side,[side*1.10,1.13,.60],[.25,.13,.33],{color:'#16191f',gloss:.75,metal:.6}));
   add(box('headlamp-glass-'+side,[side*.59,.87,2.29],[.42,.08,.34],{color:'#9cbed3',gloss:.98,metal:.13,light:true}));
   add(box('headlamp-core-'+side,[side*.57,.86,2.465],[.30,.038,.055],{color:'#f3eccf',gloss:.91,metal:.21,group:'headlamp'}));
   add(box('tail-lamp-'+side,[side*.68,.87,-2.25],[.45,.064,.19],{color:'#a13435',gloss:.86,metal:.3}));
   for(const z of [-1.47,1.43]){
    const c=[side*1.08,.50,z];
    add(wheelPart('tire-'+side+'-'+z,c,.51,.35,.19,'#0b0d12'));
    add(wheelPart('gold-rim-'+side+'-'+z,[side*1.29,.50,z],.342,.10,.012,'#b99d69',{gloss:.94,metal:.85}));
    for(let j=0;j<7;j++){
     const a=j*TAU/7,z1=z+Math.cos(a)*.22,y1=.50+Math.sin(a)*.22;
     add(box('spoke-'+side+'-'+z+'-'+j,[side*1.314, (.50+y1)/2,(z+z1)/2],
      [.036,.045+Math.abs(y1-.50),.045+Math.abs(z1-z)],{color:'#c6b48c',gloss:.81,metal:.7}));
    }
    add(box('hub-'+side+'-'+z,[side*1.332,.50,z],[.040,.13,.13],{color:'#dad6c2',gloss:.86,metal:.74}));
   }
  }
  add(box('rear-spoiler',[0,1.17,-2.02],[1.72,.065,.28],{color:'#111720',gloss:.81,metal:.62}));
  add(box('spoiler-left',[-.7,.99,-1.96],[.07,.3,.17],{color:'#101520',metal:.6}));
  add(box('spoiler-right',[.7,.99,-1.96],[.07,.3,.17],{color:'#101520',metal:.6}));
  return m.filter(x=>x.verts.length);
 }
 window.JunjaSovereignMeshes=Object.freeze({create});
})();
