'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const meshSource=read('public/premium-sovereign-mesh.js');
const viewer=read('public/premium-sovereign-viewer.js');
const page=read('public/premium-sovereign-lab.html');
const style=read('public/premium-sovereign.css');
const collection=read('public/premium-preview.html');
const sandbox={window:{}};
vm.runInNewContext(meshSource,sandbox,{timeout:2000,filename:'premium-sovereign-mesh.js'});
const models=sandbox.window.JunjaSovereignMeshes.create();
assert(models.length>40,'Need multiple independently sculpted original 3D components.');
let triangles=0,paint=0,doors=0,lights=0;
for(const m of models){
 assert(Array.isArray(m.verts)&&m.verts.length>=18,'Every model has triangles');
 assert.equal(m.verts.length%18,0,'Position/normal attributes must form valid triangles: '+m.name);
 assert(m.verts.every(Number.isFinite),'No NaN/Infinity 3D coordinates: '+m.name);
 assert(m.verts.every((x,i)=>i%6!==1||x>=-3),'Unexpected negative vertices');
 assert(/^#[\da-f]{6}$/i.test(m.color));
 assert(m.gloss>=0&&m.gloss<=1&&m.metal>=0&&m.metal<=1);
 triangles+=m.verts.length/18;paint+=Number(m.paint);doors+=Number(['leftDoor','rightDoor'].includes(m.group));lights+=Number(m.group==='headlamp');
}
assert(triangles>24000,'Premium vehicle must use dense smooth 3D geometry, not block silhouettes');
const body=models.find(m=>m.name==='sculpted-body'),canopy=models.find(m=>m.name==='cockpit-canopy');
assert(body&&body.verts.length/18>12000,'Body must have an original spline loft surface');
assert(canopy&&canopy.verts.length/18>5000,'Canopy must use curved surface normals');
assert(models.some(x=>x.name==='woven-carbon-roof'),'Need visually differentiated carbon roof');
assert(models.filter(x=>x.name.startsWith('integrated-wheel-arch')).length===4,'Need four proper wheel arch outlines');
assert(models.filter(x=>x.name.startsWith('carbon-front-wing')).length===2,'Need sculpted side aero');
for(const mode of ['threeQuarter','front','side','rear','wheel'])assert(page.includes('data-sov-preset="'+mode+'"'),'Missing exterior mobile inspection mode: '+mode);
assert(style.includes('.studio-quickviews'),'Premium mobile camera toolbar must be styled');
assert(models.filter(m=>m.name.startsWith('turbine-spoke-')).length>=40,'Each wheel must have individually sculpted turbine spokes');
assert(viewer.includes('float rough=clamp')&&viewer.includes('vec3 brdf('),'Studio renderer requires physically informed roughness/metallic shader');
assert(viewer.includes('Reflected rectangular softboxes'),'Paint needs true view-dependent studio reflection');
for(const part of ['front-wide-intake','rim-polished-edge','brake-rotor','display-gold-halo','sovereign-front-emblem']){
 assert(models.some(m=>m.name.startsWith(part)),'Missing sculpted premium 3D detail '+part);
}
// The reported old screenshot had roof bars and cabin objects penetrating the
// exterior silhouette. These are intentionally absent from the rendered geometry.
for(const model of models){
 assert(!/^(a-pillar-|roof-edge-|roof-gold-seam-|windshield-header-|canopy-side-window-division-|rear-spoiler$|spoiler-left$|spoiler-right$|seat-upholstery-|headrest-|seat-gold-stitch-|center-console$|dashboard-instrument-screen$|real-steering-wheel$|steering-gold-filigree$)/.test(model.name),
  'No cockpit prop or rollbar may pierce the canopy: '+model.name);
 if(!/plinth|halo|ground-shadow|dial-index/.test(model.name)){
  let highest=-Infinity;
  for(let i=1;i<model.verts.length;i+=6)highest=Math.max(highest,model.verts[i]);
  assert(highest<=1.60,'Exterior protrudes above roof silhouette: '+model.name+' '+highest);
 }
}
assert(doors>=2,'At least two real separate moving door components');
assert(lights>=2,'At least two light materials');
assert(paint>=3,'Paint must affect multiple car geometry components');
assert(page.includes('<canvas id="sovereignCanvas"'));
for(const id of ['sovereignControls','sovereignStatus','sovereignFallback','sovDoor','sovLight','sovColor','sovView','sovReset','sovZoomIn','sovZoomOut'])assert(page.includes('id="'+id+'"'),'Missing UI: '+id);
assert(page.includes('/premium-sovereign-mesh.js?v='));
assert(page.includes('/premium-sovereign-viewer.js?v='));
assert(page.includes('/premium-sovereign.css?v='));
assert(style.includes('@media(max-width:650px)'),'Responsive mobile required');
assert(style.includes('prefers-reduced-motion'),'Reduced-motion control required');
assert(viewer.includes("canvas.getContext('webgl'"),'Real 3D graphics context required');
assert(viewer.includes('gl.drawArrays(gl.TRIANGLES'),'Triangles must be submitted to GPU');
assert(viewer.includes('pointermove'),'Interactive orbit movement required');
assert(viewer.includes('pointers.size===2'),'Two-finger mobile zoom required');
assert(viewer.includes("state.view==='cockpit'")&&viewer.includes("state.view==='wheel'"),'True camera inspection modes required');
assert(viewer.includes('target.door='),'Real door geometry transform required');
assert(viewer.includes('uGlow'),'Headlight emissive shader required');
assert(viewer.includes("Object.defineProperty(window,'JunjaSovereignLab'"),'Readonly test/debug API required');
assert(viewer.includes("event")===false||viewer.includes("addEventListener('wheel'"));
assert(!/innerHTML\s*=/.test(viewer),'Do not render untrusted HTML');
assert(!/TossPayments|confirmPayment|\/api\/premium\/buy|\/api\/premium\/checkout|localStorage|sessionStorage/.test(viewer),'Never connect prototype to cash, account entitlement or fake owned state');
assert(!/<script[^>]*src=["']https?:\/\//i.test(page),'No external JS/CDN');
assert(!/<button[^>]*data-(?:purchase|checkout)/i.test(page));
assert(page.includes('NOT OWNED')||page.includes('미소유'));
assert(page.includes('NOT FOR SALE')||page.includes('판매'));
assert(collection.includes('/premium-sovereign-lab.html'));
assert(page.includes('studio-exterior-gateway')&&page.includes('/premium-sovereign-atelier.html'),'Legacy draft must prominently direct viewers to actual GLB exterior');
assert(!page.includes('data-sov-preset="cockpit"'),'Exterior-first quick-view bar must not show cockpit');
assert.equal((collection.match(/<button disabled type="button">판매 준비 중<\/button>/g)||[]).length,6,'Existing six payment controls remain disabled');
const policy=JSON.parse(read('docs/COMMERCE_GO_LIVE_GATE.json'));
assert.equal(policy.goLive,false);
console.log('SOVEREIGN_3D_STATIC_OK: '+models.length+' original components, '+triangles+' real triangles, '+doors+' moving doors, '+lights+' headlights, orbit/zoom/paint, six sales buttons still disabled');
