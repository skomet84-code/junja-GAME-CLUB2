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
const paint=$('atelierPaint'),door=$('atelierDoor'),hood=$('atelierHood'),light=$('atelierLight'),reset=$('atelierReset');
const stage=$('atelierStage');
const quick=[...document.querySelectorAll('[data-at-view]')];
const viewNames={hero:'외관 3/4',front:'정면',side:'측면',rear:'후면',detail:'실내·디테일'};
const colors={silver:0x9ba4ad,onyx:0x131a25,gold:0xb98b58,blue:0x144d96};
const state={ready:false,failed:false,renderCount:0,meshCount:0,materialCount:0,clipCount:0,
 paint:'silver',view:'hero',light:'studio',lastError:null,glb:true,owned:false,paid:false};
const banner=message=>{info.textContent=message;};
const disabled=flag=>{for(const el of [...quick,door,hood,paint,light,reset])el.disabled=flag;};
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
let renderer,scene,camera,orbit,mixer,clips=[],carRoot,paintMaterials=[],oldMaterials=[];
let environmentTexture,studioGroup,nightGroup,clock,visible=true,car=null,rotationTimer=0;
const tmp=new THREE.Vector3();
try {
 renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(1.5,Math.max(1,window.devicePixelRatio||1)));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.16;
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
 scene.add(new THREE.HemisphereLight(0xaebad7,0x19151e,1.55));
 studioGroup=new THREE.Group();
 const key=new THREE.DirectionalLight(0xffebcc,4.6);
 key.position.set(-4,9,7);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
 key.shadow.camera.left=-8;key.shadow.camera.right=8;
 key.shadow.camera.top=8;key.shadow.camera.bottom=-8;
 key.shadow.normalBias=.018;studioGroup.add(key);
 const cool=new THREE.DirectionalLight(0xa1c0ff,2.6);cool.position.set(6,4,-5);studioGroup.add(cool);
 const rim=new THREE.DirectionalLight(0xffd1a0,1.7);rim.position.set(-5,3,-6);studioGroup.add(rim);
 scene.add(studioGroup);
 nightGroup=new THREE.Group();
 const midnight=new THREE.DirectionalLight(0x6c88e3,1.35);midnight.position.set(2,4,5);
 const tail=new THREE.PointLight(0xff7d48,34,15,2);tail.position.set(-3,2,-3);
 nightGroup.add(midnight,tail);nightGroup.visible=false;scene.add(nightGroup);
 const plinth=new THREE.Group();
 const stone=new THREE.Mesh(new THREE.CylinderGeometry(3.33,3.39,.16,96),
  new THREE.MeshPhysicalMaterial({color:0x11131a,roughness:.60,metalness:.14,clearcoat:.33}));
 stone.position.y=-.10;stone.receiveShadow=true;plinth.add(stone);
 const trim=new THREE.Mesh(new THREE.TorusGeometry(3.32,.019,8,120),
  new THREE.MeshStandardMaterial({color:0xb59863,roughness:.24,metalness:.93}));
 trim.rotation.x=Math.PI/2;trim.position.y=-.012;plinth.add(trim);
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
  hero:[5.3,2.5,5.2],front:[0,1.72,radius],side:[radius,1.85,0],
  rear:[0,1.75,-radius],detail:[2.4,1.72,2.9]
 };
 camera.position.set(...coords[view]);
 orbit.target.set(0,view==='detail'?1.20:.84,0);
 orbit.update();
 for(const b of quick)b.setAttribute('aria-pressed',String(b.dataset.atView===view));
 banner(viewNames[view]+' 실시간 3D 관찰 시점');
}
function setPaint(key){
 if(!state.ready||!Object.hasOwn(colors,key))return;
 state.paint=key;
 for(const m of paintMaterials){
  m.color.setHex(colors[key]);
  m.metalness=.79;m.roughness=.19;
  if('clearcoat' in m)m.clearcoat=.84;
  m.needsUpdate=true;
 }
 banner(paintMaterials.length?'차체 페인트 변경 · 실제 모델의 '+paintMaterials.length+'개 표면에 적용':'선택한 모델의 색상 변경 가능 부품이 없습니다.');
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
  // Khronos car is already authored for the standard glTF coordinate system.
  const bounds=new THREE.Box3().setFromObject(car);
  if(bounds.isEmpty())throw Error('GLB 모델에 실제 메시가 없습니다.');
  const center=bounds.getCenter(tmp.clone());
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
     paintMaterials.push(copy);
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
  // Respect saved draft color only in old studio; the new asset is explicitly free.
  setPaint('silver');
  setView('hero');
  door.disabled=true;hood.disabled=true;
  door.title='도어 힌지 애니메이션은 정식 모델 연결 후 제공';
  hood.title='보닛 애니메이션은 정식 모델 연결 후 제공';
  paint.disabled=!paintMaterials.length;
  status.textContent='3D 모델 로딩 완료';
  banner('고품질 glTF 모델 로딩 완료 · 메시 '+state.meshCount+'개 · 재질 '+state.materialCount+'종 · 도어 조작 개발 중');
 }catch(e){fail(e);}
}
for(const button of quick)button.addEventListener('click',()=>setView(button.dataset.atView));
paint.addEventListener('change',()=>setPaint(paint.value));
door.addEventListener('click',()=>play('doors'));
hood.addEventListener('click',()=>play('hood'));
light.addEventListener('click',setLights);
reset.addEventListener('click',()=>{setView('hero');});
load();
