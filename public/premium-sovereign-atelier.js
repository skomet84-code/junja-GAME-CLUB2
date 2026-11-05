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
const viewNames={hero:'외관 3/4',front:'정면',side:'측면',rear:'후면',wheel:'전륜 디테일'};
const colors={silver:0xadb6c0,onyx:0x121925,gold:0xba915b,blue:0x123b71,burgundy:0x6b152d};
const wheelPalettes={
 graphite:{accent:0xa7adb8,base:0x1a202a,roughness:.21},
 obsidian:{accent:0x5b626e,base:0x080a0f,roughness:.19},
 champagne:{accent:0xc49b62,base:0x30261b,roughness:.25}
};
const state={ready:false,failed:false,renderCount:0,meshCount:0,materialCount:0,clipCount:0,
 paint:'silver',wheelFinish:'graphite',paintSurfaceCount:0,wheelSurfaceCount:0,view:'hero',light:'studio',doorsOpen:false,hoodOpen:false,
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
let renderer,scene,camera,orbit,mixer,clips=[],carRoot,paintMaterials=[],wheelMaterials=[];
let environmentTexture,studioGroup,nightGroup,clock,visible=true,car=null;
const hinges={doors:[],hood:null};
const motion={doors:0,hood:0};
const tmp=new THREE.Vector3();
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
 const floor=new THREE.Mesh(new THREE.CircleGeometry(50,96),
  new THREE.MeshBasicMaterial({color:0x080a10}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.22;floor.receiveShadow=true;
 scene.add(floor,plinth);
 carRoot=new THREE.Group();scene.add(carRoot);
 clock=new THREE.Clock();
 const onResize=()=>{
  const width=Math.max(canvas.clientWidth,1),height=Math.max(canvas.clientHeight,1);
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
 };
 onResize();
 if(window.ResizeObserver)new ResizeObserver(onResize).observe(stage);
 else window.addEventListener('resize',onResize);
 if(window.IntersectionObserver)new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;},{threshold:0}).observe(stage);
 window.addEventListener('visibilitychange',()=>{clock.getDelta();});
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(Error('WebGL 그래픽 연결이 끊겼습니다.'));});
 function animate(){
  requestAnimationFrame(animate);
  if(state.failed||document.hidden||!visible)return;
  const dt=Math.min(clock.getDelta(),.05);
  if(mixer)mixer.update(dt);
  // Genuine grouped door/bonnet hinges stay in their source local coordinates.
  // The GLB root already contains the Z-up -> Y-up transform; do not rotate twice.
  const easing=1-Math.exp(-8*dt);
  motion.doors+=((state.doorsOpen?1:0)-motion.doors)*easing;
  motion.hood+=((state.hoodOpen?1:0)-motion.hood)*easing;
  if(Math.abs(motion.doors-(state.doorsOpen?1:0))<.0005)motion.doors=state.doorsOpen?1:0;
  if(Math.abs(motion.hood-(state.hoodOpen?1:0))<.0005)motion.hood=state.hoodOpen?1:0;
  for(const hinge of hinges.doors)hinge.node.rotation.z=hinge.base+hinge.sweep*motion.doors;
  if(hinges.hood)hinges.hood.node.rotation.x=hinges.hood.base+hinges.hood.sweep*motion.hood;
  state.doorAngle=+(motion.doors*.93).toFixed(3);
  state.hoodAngle=+(motion.hood*.47).toFixed(3);
  orbit.update();
  renderer.render(scene,camera);
  state.renderCount++;
 }
 animate();
}catch(e){fail(e);}

function setView(view){
 if(!state.ready||!viewNames[view])return;
 state.view=view;
 const radius=6.6,coords={
  hero:[5.2,2.15,5.65],front:[0,1.60,radius],side:[8.05,1.68,0],
  rear:[0,1.65,-radius],wheel:[3.05,1.12,2.35]
 };
 camera.position.set(...coords[view]);
 // Only the wheel preset inspects a local exterior component. No cockpit camera.
 orbit.target.set(...(view==='wheel'?[1.00,.52,1.35]:[0,.77,0]));
 orbit.update();
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
  m.needsUpdate=true;
 }
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
    const n=String(mat.name||'').toLowerCase();
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
  setPaint('silver');
  setWheelFinish('graphite');
  setView('hero');
  paint.disabled=!paintMaterials.length;
  wheelFinish.disabled=!wheelMaterials.length;
  status.textContent='3D 모델 로딩 완료';
  banner('고품질 GLB 외관 로딩 완료 · 차체 도장 '+paintMaterials.length+'면 · 휠 림 '+wheelMaterials.length+'면 · 외관 360도');
 }catch(e){fail(e);}
}
for(const button of quick)button.addEventListener('click',()=>setView(button.dataset.atView));
paint.addEventListener('change',()=>setPaint(paint.value));
wheelFinish.addEventListener('change',()=>setWheelFinish(wheelFinish.value));
door.addEventListener('click',toggleDoor);
hood.addEventListener('click',toggleHood);
light.addEventListener('click',setLights);
reset.addEventListener('click',()=>{setView('hero');});
load();
