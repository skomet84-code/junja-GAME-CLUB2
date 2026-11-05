/* JUNJA licensed GLB atelier v1.
 * This is a separated technical preview. No wallet, purchase or entitlement API.
 * Khronos CarConcept: CC-BY 4.0, Eric Chadwick / Darmstadt Graphics Group GmbH. Three.js: MIT.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $=id=>document.getElementById(id);
const canvas=$('atelierCanvas'),loading=$('atelierLoading'),status=$('atelierStatus');
const info=$('atelierInfo'),fallback=$('atelierFallback'),error=$('atelierError');
const paint=$('atelierPaint'),wheelFinish=$('atelierWheelFinish'),door=$('atelierDoor'),hood=$('atelierHood'),light=$('atelierLight'),reset=$('atelierReset');
const stage=$('atelierStage');
const quick=[...document.querySelectorAll('[data-at-view]')];
const viewNames={hero:'외관 3/4',front:'정면',frontDetail:'전면 디자인',side:'측면',rear:'후면',wheel:'전륜 디테일'};
const colors={silver:0xadb6c0,onyx:0x121925,gold:0xba915b,blue:0x123b71,burgundy:0x6b152d};
const wheelPalettes={
 graphite:{accent:0xa7adb8,base:0x1a202a,roughness:.21},
 obsidian:{accent:0x5b626e,base:0x080a0f,roughness:.19},
 champagne:{accent:0xc49b62,base:0x30261b,roughness:.25}
};
const state={ready:false,failed:false,renderCount:0,meshCount:0,materialCount:0,clipCount:0,
 paint:'silver',wheelFinish:'graphite',paintSurfaceCount:0,wheelSurfaceCount:0,headlightSurfaceCount:0,frontGrilleCount:0,brakeCaliperCount:0,wheelTargetResolved:false,cameraDistance:null,viewFitMargin:null,autoFramed:false,view:'hero',light:'studio',doorsOpen:false,hoodOpen:false,
 doorAngle:0,hoodAngle:0,hingeCount:0,modelSize:null,lastError:null,glb:true,owned:false,paid:false};
const banner=message=>{info.textContent=message;};
const disabled=flag=>{for(const el of [...quick,door,hood,paint,wheelFinish,light,reset])el.disabled=flag;};
disabled(true);
Object.defineProperty(window,'JunjaSovereignAtelier',{value:Object.freeze({
 snapshot:()=>({...state}),
 modelUrl:'/art/royal/models/carconcept-ccby.glb'
})});
const fail=err=>{
 state.failed=true;state.ready=false;state.lastError=String(err?.message||err).slice(0,140);
 loading.hidden=true;fallback.hidden=false;error.textContent=state.lastError;
 banner('새 3D 모델을 표시하지 못했습니다. 기존 체험실을 이용할 수 있습니다.');
 disabled(true);
};
let renderer,scene,camera,orbit,mixer,clips=[],carRoot,paintMaterials=[],wheelMaterials=[],headlightMaterials=[],frontGrilleMaterials=[],caliperMaterials=[];
let environmentTexture,studioGroup,nightGroup,clock,visible=true,car=null;
let frontRimFocus=null,exteriorBounds=null;
const hinges={doors:[],hood:null};
const motion={doors:0,hood:0};
const tmp=new THREE.Vector3();
let renderDirty=true;
// A user may select a camera or finish while the canvas is outside the viewport.
// Rendering only in the intersection-based RAF loop caused a stale image to
// appear one selection behind on real iPhone/WebKit screenshots.
function renderOnDemand(){
 if(!renderer||!scene||!camera||!state.ready||state.failed)return;
 orbit?.update();
 renderer.render(scene,camera);
 state.renderCount++;
 renderDirty=false;
}
try {
 // High-DPI iPhones pay a large GPU tax rendering the 11.8MB PBR model.
 // Keep physical car paint but cap the canvas cost on mobile devices.
 const compact=window.matchMedia('(max-width:690px)').matches;
 renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:!compact,powerPreference:'default'});
 renderer.setPixelRatio(Math.min(compact?1.20:1.5,Math.max(1,window.devicePixelRatio||1)));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.02;
 renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(39,1,.06,120);
 camera.position.set(5.5,2.6,5.9);
 orbit=new OrbitControls(camera,canvas);
 orbit.enableDamping=true;orbit.dampingFactor=.075;
 orbit.enablePan=false;orbit.minDistance=2.3;orbit.maxDistance=15.5;
 orbit.minPolarAngle=.12;orbit.maxPolarAngle=Math.PI*.49;
 orbit.target.set(0,.83,0);orbit.update();
 orbit.addEventListener('change',()=>{renderDirty=true;});
 const pmrem=new THREE.PMREMGenerator(renderer);
 environmentTexture=pmrem.fromScene(new RoomEnvironment(),.05).texture;
 scene.environment=environmentTexture;
 pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xb4c6dc,0x151821,1.05));
 studioGroup=new THREE.Group();
 const key=new THREE.DirectionalLight(0xffebda,3.5);
 key.position.set(-4,9,7);key.castShadow=true;key.shadow.mapSize.set(compact?512:1024,compact?512:1024);
 key.shadow.camera.left=-8;key.shadow.camera.right=8;
 key.shadow.camera.top=8;key.shadow.camera.bottom=-8;
 key.shadow.normalBias=.018;studioGroup.add(key);
 const cool=new THREE.DirectionalLight(0xaccaff,2.0);cool.position.set(6,4,-5);studioGroup.add(cool);
 const rim=new THREE.DirectionalLight(0xffd1a0,1.25);rim.position.set(-5,3,-6);studioGroup.add(rim);
 scene.add(studioGroup);
 nightGroup=new THREE.Group();
 const midnight=new THREE.DirectionalLight(0x6c88e3,1.35);midnight.position.set(2,4,5);
 const tail=new THREE.PointLight(0xff7d48,34,15,2);tail.position.set(-3,2,-3);
 nightGroup.add(midnight,tail);nightGroup.visible=false;scene.add(nightGroup);
 const plinth=new THREE.Group();
 // The old brightly reflecting circular disk dominated the car on phones.
 // Keep a thin, unlit graphite plinth so attention stays on the silhouette.
 const stone=new THREE.Mesh(new THREE.CylinderGeometry(3.01,3.05,.075,96),
  new THREE.MeshBasicMaterial({color:0x101218}));
 stone.position.y=-.13;stone.receiveShadow=true;plinth.add(stone);
 const trim=new THREE.Mesh(new THREE.TorusGeometry(3.02,.009,8,120),
  new THREE.MeshBasicMaterial({color:0x776140}));
 trim.rotation.x=Math.PI/2;trim.position.y=-.09;plinth.add(trim);
 // A huge black floor disc created a hard horizontal horizon across mobile.
 // The CSS studio gradient is a seamless background; only a thin plinth
 // remains in WebGL so the exterior has no artificial black cut-off band.
 scene.add(plinth);
 carRoot=new THREE.Group();scene.add(carRoot);
 clock=new THREE.Clock();
 const onResize=()=>{
  const width=Math.max(canvas.clientWidth,1),height=Math.max(canvas.clientHeight,1);
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderDirty=true;
  // On orientation change, refit the full exterior to the real canvas aspect.
  if(state.ready&&['hero','front','side','rear'].includes(state.view))setView(state.view);
 };
 onResize();
 if(window.ResizeObserver)new ResizeObserver(onResize).observe(stage);
 else window.addEventListener('resize',onResize);
 if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;if(visible)renderDirty=true;},{threshold:0}).observe(stage);
 window.addEventListener('visibilitychange',()=>{clock.getDelta();renderDirty=true;});
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(Error('WebGL 그래픽 연결이 끊겼습니다.'));});
 function animate(){
  requestAnimationFrame(animate);
  if(state.failed||document.hidden||!visible)return;
  const dt=Math.min(clock.getDelta(),.05);
  if(mixer){mixer.update(dt);renderDirty=true;}
  // Genuine grouped door/bonnet hinges stay in their source local coordinates.
  // The GLB root already contains the Z-up -> Y-up transform; do not rotate twice.
  const easing=1-Math.exp(-8*dt);
  const previousDoor=motion.doors,previousHood=motion.hood;
  motion.doors+=((state.doorsOpen?1:0)-motion.doors)*easing;
  motion.hood+=((state.hoodOpen?1:0)-motion.hood)*easing;
  if(Math.abs(motion.doors-previousDoor)>1e-6||Math.abs(motion.hood-previousHood)>1e-6)renderDirty=true;
  if(Math.abs(motion.doors-(state.doorsOpen?1:0))<.0005)motion.doors=state.doorsOpen?1:0;
  if(Math.abs(motion.hood-(state.hoodOpen?1:0))<.0005)motion.hood=state.hoodOpen?1:0;
  for(const hinge of hinges.doors)hinge.node.rotation.z=hinge.base+hinge.sweep*motion.doors;
  if(hinges.hood)hinges.hood.node.rotation.x=hinges.hood.base+hinges.hood.sweep*motion.hood;
  state.doorAngle=+(motion.doors*.93).toFixed(3);
  state.hoodAngle=+(motion.hood*.47).toFixed(3);
  // OrbitControls emits 'change' while touch drag/zoom/damping is active.
  // Stop redraws when the user is not touching the static, nonanimated car.
  orbit.update();
  if(!renderDirty)return;
  renderer.render(scene,camera);
  state.renderCount++;
  renderDirty=false;
 }
 animate();
}catch(e){fail(e);}

// Use the *actual* positioned GLB bounds to fit every full-car view.
 // This avoids cutting off the silhouette on narrower iPhone canvases.
 function exteriorCorners(box){
  const {min,max}=box;
  return [
   [min.x,min.y,min.z],[min.x,min.y,max.z],
   [min.x,max.y,min.z],[min.x,max.y,max.z],
   [max.x,min.y,min.z],[max.x,min.y,max.z],
   [max.x,max.y,min.z],[max.x,max.y,max.z]
  ].map(v=>new THREE.Vector3(...v));
 }
 function frameFullExterior(direction){
  const target=exteriorBounds.getCenter(new THREE.Vector3());
  const from=direction.clone().normalize();
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),from).normalize();
  const up=new THREE.Vector3().crossVectors(from,right).normalize();
  const halfVertical=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5);
  const halfHorizontal=halfVertical*camera.aspect;
  let required=0;
  for(const corner of exteriorCorners(exteriorBounds)){
   const relative=corner.sub(target);
   const near=relative.dot(from);
   required=Math.max(required,
    Math.abs(relative.dot(right))/halfHorizontal+near,
    Math.abs(relative.dot(up))/halfVertical+near);
  }
  const dist=Math.max(3.2,required*1.16);
  camera.position.copy(target).addScaledVector(from,dist);
  orbit.target.copy(target);
  state.autoFramed=true;
 }
function setView(view){
 if(!state.ready||!viewNames[view])return;
 state.view=view;
 const angles={
  hero:new THREE.Vector3(5.2,1.85,5.65),front:new THREE.Vector3(0,1.1,6.6),
  side:new THREE.Vector3(7.6,1.2,0),rear:new THREE.Vector3(0,1.15,-6.6)
 };
 state.viewFitMargin=null;
 state.autoFramed=false;
 if(view==='wheel'&&frontRimFocus){
  // Source model determines the real wheel centre, never a guessed front-
  // bumper coordinate. Approach nearly perpendicular to the wheel's plane,
  // so the hood cannot occlude the forged rim in the mobile close-up.
  const side=frontRimFocus.x>=0?1:-1;
  orbit.target.copy(frontRimFocus);
  camera.position.copy(frontRimFocus).add(new THREE.Vector3(side*2.55,.58,.10));
 }else if(view==='frontDetail'){
  camera.position.set(1.9,1.40,3.10);
  orbit.target.set(0,.76,1.4);
 }else if(exteriorBounds&&angles[view]){
  frameFullExterior(angles[view]);
 }else{
  camera.position.set(5.2,2.15,5.65);
  orbit.target.set(0,.77,0);
 }
 orbit.update();
 if(state.autoFramed&&exteriorBounds){
  camera.updateMatrixWorld(true);
  let maxNdc=0;
  for(const point of exteriorCorners(exteriorBounds)){
   const projected=point.project(camera);
   maxNdc=Math.max(maxNdc,Math.abs(projected.x),Math.abs(projected.y));
  }
  state.viewFitMargin=+maxNdc.toFixed(3);
 }
 state.cameraDistance=+camera.position.distanceTo(orbit.target).toFixed(2);
 renderOnDemand();
 for(const b of quick)b.setAttribute('aria-pressed',String(b.dataset.atView===view));
 banner(viewNames[view]+' 실시간 3D 관찰 시점');
}
function setPaint(key){
 if(!state.ready||!Object.hasOwn(colors,key))return;
 state.paint=key;
 paint.value=key;
 const bodyColor=new THREE.Color(colors[key]);
 for(const {material:m,secondary} of paintMaterials){
  // Preserve the real body's two-tone panel contrast rather than coating
  // every part in one flat color. Modify only authored paint surfaces.
  const finish=secondary?bodyColor.clone().multiplyScalar(.24):bodyColor;
  m.color.copy(finish);
  m.metalness=.78;
  m.roughness=secondary ? .31 : .22;
  if('clearcoat' in m){m.clearcoat=.94;m.clearcoatRoughness=.12;}
  m.envMapIntensity=1.30;
  m.needsUpdate=true;
 }
 renderOnDemand();
 banner(paintMaterials.length?'메탈릭 차체 페인트 변경 · '+paintMaterials.length+'개 실제 도장 표면 적용':'원본 모델의 차체 도장 표면을 찾지 못했습니다.');
}
function setWheelFinish(key){
 if(!state.ready||!Object.hasOwn(wheelPalettes,key))return;
 state.wheelFinish=key;
 wheelFinish.value=key;
 const finish=wheelPalettes[key];
 for(const {material:m,accent} of wheelMaterials){
  // Only genuine Wheel...Rim geometry is restyled. Never color tires,
  // brake discs, badges or the wheel arch as though they were rims.
  m.color.setHex(accent?finish.accent:finish.base);
  m.metalness=accent ? .94 : .70;
  m.roughness=accent?finish.roughness:.32;
  m.envMapIntensity=1.25;
  // The sample GLB ships with emissive white Rim1/Rim2 materials.
  // Remove that white glow so forged metal color and PBR reflections show.
  if(m.emissive)m.emissive.setRGB(.008,.009,.010);
  m.emissiveIntensity=1;
  m.needsUpdate=true;
 }
 renderOnDemand();
 banner(wheelMaterials.length?'휠 마감 변경 · 실제 단조 림 '+wheelMaterials.length+'개 재질 표면 적용':'휠 재질을 찾지 못했습니다.');
}
function setupMechanics(){
  // The CC-BY CarConcept hierarchy already groups each complete door under a
  // real, correctly positioned hinge pivot, including glass and side mirrors.
  const left=car.getObjectByName('BodyDoorLColor1');
  const right=car.getObjectByName('BodyDoorRColor1');
  const bonnet=car.getObjectByName('BodyHood');
  if(left&&right&&left.children.length>=10&&right.children.length>=10){
   hinges.doors=[
    {node:left,base:left.rotation.z,sweep:-.93},
    {node:right,base:right.rotation.z,sweep:.93}
   ];
   state.hingeCount=2;
  }
  if(bonnet&&bonnet.children.length>=3){
   hinges.hood={node:bonnet,base:bonnet.rotation.x,sweep:.47};
   state.hingeCount++;
  }
  door.disabled=hinges.doors.length!==2;
  hood.disabled=!hinges.hood;
  door.title=door.disabled?'이 에셋의 도어 피벗을 확인하지 못했습니다.':'양쪽 실제 3D 도어를 열고 닫습니다.';
  hood.title=hood.disabled?'이 에셋의 보닛 피벗을 확인하지 못했습니다.':'실제 3D 보닛을 열고 닫습니다.';
}
function toggleDoor(){
 if(!state.ready||door.disabled)return;
 state.doorsOpen=!state.doorsOpen;
 door.textContent=state.doorsOpen?'양쪽 도어 닫기':'양쪽 도어 열기';
 door.setAttribute('aria-pressed',String(state.doorsOpen));
 if(state.doorsOpen){setView('hero');stage.scrollIntoView({block:'center',behavior:'smooth'});}
 banner(state.doorsOpen?'실제 GLB 차체 도어 2개가 부드럽게 열립니다.':'실제 도어를 닫습니다.');
}
function toggleHood(){
 if(!state.ready||hood.disabled)return;
 state.hoodOpen=!state.hoodOpen;
 hood.textContent=state.hoodOpen?'보닛 닫기':'보닛 열기';
 hood.setAttribute('aria-pressed',String(state.hoodOpen));
 if(state.hoodOpen){setView('front');stage.scrollIntoView({block:'center',behavior:'smooth'});}
 banner(state.hoodOpen?'실제 GLB 보닛이 열립니다.':'실제 보닛을 닫습니다.');
}
function play(keyword){
 if(!state.ready)return;
 const matches=clips.filter(clip=>clip.name.toLowerCase().includes(keyword));
 if(!matches.length){banner('이 모델에는 '+keyword+' 애니메이션이 없습니다.');return;}
 for(const clip of matches){
  const action=mixer.clipAction(clip);
  action.stop();action.reset();action.setLoop(THREE.LoopOnce,1);
  action.clampWhenFinished=false;action.play();
 }
 banner('실제 GLB 애니메이션 재생 · '+matches.map(x=>x.name).join(', '));
}
function setLights(){
 if(!state.ready)return;
 const night=state.light!=='night';
 state.light=night?'night':'studio';
 studioGroup.visible=!night;nightGroup.visible=night;
 for(const m of headlightMaterials)m.emissiveIntensity=night?2.10:1.15;
 renderOnDemand();
 light.textContent=night?'조명 · 야간':'조명 · 스튜디오';
 light.setAttribute('aria-pressed',String(!night));
 banner(night?'야간 조명으로 변경':'스튜디오 조명으로 변경');
}
async function load(){
 if(state.failed||!renderer)return;
 try{
  const gltf=await new GLTFLoader().loadAsync('/art/royal/models/carconcept-ccby.glb',
   e=>{if(e.total>0)status.textContent='3D 다운로드 '+Math.min(100,Math.round(e.loaded/e.total*100))+'%';});
  car=gltf.scene;
  // Khronos CarConcept vertices use Z-up locally, but node BodyUnderside has
  // the matrix [1,0,0; 0,0,-1; 0,1,0], already converting to Three.js Y-up.
  // Respect its author-provided transform to avoid pointing the nose skyward.
  car.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(car);
  if(bounds.isEmpty())throw Error('GLB 모델에 실제 메시가 없습니다.');
  const center=bounds.getCenter(tmp.clone());
  const size=bounds.getSize(new THREE.Vector3());
  state.modelSize={width:+size.x.toFixed(3),height:+size.y.toFixed(3),length:+size.z.toFixed(3)};
  if(!(size.z>size.y*2&&size.z>size.x*1.2))throw Error('모델 축 변환에 실패했습니다.');
  carRoot.position.set(-center.x,.02-bounds.min.y,-center.z);
  carRoot.add(car);
  carRoot.updateMatrixWorld(true);
  exteriorBounds=new THREE.Box3().setFromObject(carRoot);
  if(exteriorBounds.isEmpty())throw Error('자동 카메라에 필요한 차량 외관 범위가 없습니다.');
  const sourceRim=car.getObjectByName('WheelFrontLRim')||car.getObjectByName('WheelFrontRRim');
  if(sourceRim){
   const rimBounds=new THREE.Box3().setFromObject(sourceRim);
   if(!rimBounds.isEmpty()){
    frontRimFocus=rimBounds.getCenter(new THREE.Vector3());
    state.wheelTargetResolved=true;
   }
  }
  const materialNames=new Set();
  car.traverse(object=>{
   // Exclude trademark-bearing steering badge and license-plate graphics.
   if(/^(InteriorSteeringEmblem|License Plate)$/i.test(object.name||'')){object.visible=false;return;}
   if(!object.isMesh)return;
   state.meshCount++;
   object.castShadow=true;object.receiveShadow=true;
   const a=Array.isArray(object.material)?object.material:[object.material];
   const replacement=a.map(mat=>{
    if(!mat)return mat;
    materialNames.add(mat.name||'unnamed');
    // Exterior-only finish pass. The original hood upper grille and four
    // brake-caliper parts are real source GLB meshes, not overlay decoration.
    // Clone only those materials before the general paint rule so their carbon
    // and champagne-gold detail does not get wiped by user body color selection.
    const namedInHierarchy=pattern=>[object.name,object.parent?.name,object.parent?.parent?.name]
     .some(name=>pattern.test(name||''));
    if(namedInHierarchy(/^BodyHoodTopgrill(?:$|[_ .])/i)){
     const copy=mat.clone();
     copy.color.setHex(0x1c222c);
     copy.metalness=.44;
     copy.roughness=.35;
     if('clearcoat' in copy){copy.clearcoat=.23;copy.clearcoatRoughness=.29;}
     copy.envMapIntensity=1.12;
     frontGrilleMaterials.push(copy);
     return copy;
    }
    if(namedInHierarchy(/^Wheel(?:Front|Rear)[LR]BrakePad(?:$|[_ .])/i)&&/^Brake$/i.test(mat.name||'')){
     const copy=mat.clone();
     copy.color.setHex(0xb69a68);
     copy.metalness=.61;
     copy.roughness=.29;
     if(copy.emissive)copy.emissive.setHex(0x000000);
     copy.envMapIntensity=1.05;
     caliperMaterials.push(copy);
     return copy;
    }
    if(/^paint [12] (carmine|pearl|graphite)/i.test(String(mat.name||''))){
     const copy=mat.clone();
     paintMaterials.push({material:copy,secondary:/^paint 2 /i.test(copy.name)});
     return copy;
    }
    // Khronos wheel rims contain two glTF primitives each. Three.js may
    // convert these into grouped child meshes with suffixes, so look through
    // their immediate hierarchy instead of assuming a flat object name.
    const rimSource=[object.name,object.parent?.name,object.parent?.parent?.name].some(name=>
     /^Wheel(?:Front|Rear)[LR]Rim(?:$|[_ .])/i.test(name||''));
    if(rimSource&&/^Rim[12]$/i.test(mat.name||'')){
     const copy=mat.clone();
     wheelMaterials.push({material:copy,accent:/^Rim2$/i.test(copy.name)});
     return copy;
    }
    if(mat.name==='Headlight'){
     // Original model's 10x headlamp emissive strength blew out the lamp.
     // Keep the original lens geometry and use a controlled crisp LED white.
     const copy=mat.clone();
     copy.emissive.setRGB(.73,.84,1);
     copy.emissiveIntensity=1.15;
     copy.roughness=.27;
     headlightMaterials.push(copy);
     return copy;
    }
    return mat;
   });
   object.material=Array.isArray(object.material)?replacement:replacement[0];
  });
  state.materialCount=materialNames.size;
  clips=gltf.animations||[];
  state.clipCount=clips.length;
  mixer=clips.length?new THREE.AnimationMixer(car):null;
  state.ready=true;
  loading.hidden=true;fallback.hidden=true;disabled(false);
  // Exterior-first showroom: original hinge/bonnet prototypes are kept for
  // separate QA but are not presented as member-facing product features.
  // Keep the moving parts closed and out of the luxury exterior presentation.
  door.disabled=true;hood.disabled=true;
  // Free, non-owned exterior preview; no user draft or purchase is written.
  state.paintSurfaceCount=paintMaterials.length;
  state.wheelSurfaceCount=wheelMaterials.length;
  state.headlightSurfaceCount=headlightMaterials.length;
  state.frontGrilleCount=frontGrilleMaterials.length;
  state.brakeCaliperCount=caliperMaterials.length;
  setPaint('silver');
  setWheelFinish('graphite');
  setView('hero');
  paint.disabled=!paintMaterials.length;
  wheelFinish.disabled=!wheelMaterials.length;
  status.textContent='3D 모델 로딩 완료';
  banner('GLB 외관 로딩 완료 · 새틴 그릴 '+frontGrilleMaterials.length+'면 · 브레이크 디테일 '+caliperMaterials.length+'면 · 외관 360도');
 }catch(e){fail(e);}
}
for(const button of quick)button.addEventListener('click',()=>{
 setView(button.dataset.atView);
 if(['wheel','frontDetail'].includes(button.dataset.atView))stage.scrollIntoView({block:'center',behavior:'smooth'});
});
paint.addEventListener('change',()=>setPaint(paint.value));
wheelFinish.addEventListener('change',()=>setWheelFinish(wheelFinish.value));
door.addEventListener('click',toggleDoor);
hood.addEventListener('click',toggleHood);
light.addEventListener('click',setLights);
reset.addEventListener('click',()=>{setView('hero');});
load();
