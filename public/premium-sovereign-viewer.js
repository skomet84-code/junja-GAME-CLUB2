'use strict';
/* Standalone WebGL-1 triangle viewer. Original procedural proof of concept,
   not a final photorealistic PBR production car asset. No third-party CDNs. */
(()=>{
 const canvas=document.getElementById('sovereignCanvas'),screen=document.getElementById('sovereignScreen');
 if(!canvas||!screen)return;
 const $=id=>document.getElementById(id),status=$('sovereignStatus'),fallback=$('sovereignFallback');
 const controls={door:$('sovDoor'),light:$('sovLight'),color:$('sovColor'),reset:$('sovReset'),view:$('sovView'),plus:$('sovZoomIn'),minus:$('sovZoomOut')};
 const state={supported:false,doorsOpen:false,lightsOn:false,color:'platinum',view:'threeQuarter',pixels:0,renderCount:0};
 const theme={platinum:[.62,.68,.78],onyx:[.060,.092,.144],champagne:[.78,.61,.38]};
 const target={rotation:-.44,pitch:.22,zoom:9.1,door:0},current={...target};
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
 const setInfo=text=>status.textContent=text;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 function multiply(a,b){const out=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
 const translation=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
 const rotationY=a=>[Math.cos(a),0,-Math.sin(a),0,0,1,0,0,Math.sin(a),0,Math.cos(a),0,0,0,0,1];
 const perspective=(f,aspect,n,far)=>{const t=1/Math.tan(f/2),r=1/(n-far);return [t/aspect,0,0,0,0,t,0,0,0,0,(far+n)*r,-1,0,0,2*far*n*r,0];};
 function lookAt(eye,center,up){
  const norm=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
  const z=norm([eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]]);
  const x=norm([up[1]*z[2]-up[2]*z[1],up[2]*z[0]-up[0]*z[2],up[0]*z[1]-up[1]*z[0]]);
  const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,
   -x[0]*eye[0]-x[1]*eye[1]-x[2]*eye[2],-y[0]*eye[0]-y[1]*eye[1]-y[2]*eye[2],-z[0]*eye[0]-z[1]*eye[1]-z[2]*eye[2],1];
 }
 function shader(gl,kind,src){const x=gl.createShader(kind);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x)||'Shader failed');return x;}
 const vertex=[
 'attribute vec3 aPosition;attribute vec3 aNormal;',
 'uniform mat4 uModel;uniform mat4 uCamera;',
 'varying vec3 vWorld;varying vec3 vNormal;',
 'void main(){vec4 p=uModel*vec4(aPosition,1.0);vWorld=p.xyz;vNormal=normalize(mat3(uModel)*aNormal);gl_Position=uCamera*p;}'
 ].join('\n');
 const fragment=[
 'precision mediump float;',
 'varying vec3 vWorld;varying vec3 vNormal;',
 'uniform vec3 uColor;uniform vec3 uEye;',
 'uniform float uGloss;uniform float uMetal;uniform float uGlow;',
 'void main(){',
 'vec3 n=normalize(vNormal),v=normalize(uEye-vWorld);',
 'vec3 warm=normalize(vec3(-0.55,1.8,1.35)),cool=normalize(vec3(1.6,1.25,-0.85));',
 'float a=abs(dot(n,warm)),b=abs(dot(n,cool));',
 'float rim=pow(1.0-max(0.0,dot(n,v)),3.2);',
 'float exponent=mix(8.0,90.0,clamp(uGloss,0.0,1.0));',
 'vec3 h1=normalize(warm+v),h2=normalize(cool+v);',
 'float shine=pow(max(0.0,dot(n,h1)),exponent)*(.35+uMetal*.9)+pow(max(0.0,dot(n,h2)),exponent)*(.15+uMetal*.6);',
 'vec3 radiance=uColor*(.22+warm.y*a*.68+b*.42);',
 'radiance+=vec3(1.0,.83,.53)*shine*.82+vec3(.22,.40,.74)*rim*(.10+uMetal*.35);',
 'radiance+=uGlow*vec3(.92,.92,.77);radiance=radiance/(radiance+vec3(.30));',
 'gl_FragColor=vec4(pow(radiance,vec3(.94)),1.0);}'
 ].join('\n');
 let gl,program,meshes=[],raf=0;
 const colorHex=h=>{const v=parseInt(String(h).replace('#',''),16)||0;return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255];};
 function showFallback(reason){state.supported=false;canvas.hidden=true;fallback.hidden=false;$('sovereignControls').hidden=true;setInfo('현재 기기에서는 실시간 3D를 사용할 수 없어 정적 대체 이미지를 표시합니다. '+reason);}
 try{
  gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'default'})||canvas.getContext('experimental-webgl',{alpha:false,antialias:true});
  if(!gl)throw Error('WebGL 미지원');
  const vs=shader(gl,gl.VERTEX_SHADER,vertex),fs=shader(gl,gl.FRAGMENT_SHADER,fragment);
  program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Program link failed');
  gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
  const loc={pos:gl.getAttribLocation(program,'aPosition'),normal:gl.getAttribLocation(program,'aNormal'),
   model:gl.getUniformLocation(program,'uModel'),camera:gl.getUniformLocation(program,'uCamera'),color:gl.getUniformLocation(program,'uColor'),
   eye:gl.getUniformLocation(program,'uEye'),gloss:gl.getUniformLocation(program,'uGloss'),metal:gl.getUniformLocation(program,'uMetal'),
   glow:gl.getUniformLocation(program,'uGlow')};
  const objects=window.JunjaSovereignMeshes?.create();
  if(!Array.isArray(objects)||objects.length<30)throw Error('3D 구조 파일을 불러오지 못했습니다.');
  let triangles=0;
  for(const o of objects){
   const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   const verts=new Float32Array(o.verts);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);
   meshes.push({buffer,count:verts.length/6,tint:colorHex(o.color),gloss:o.gloss,metal:o.metal,group:o.group,paint:o.paint,light:o.light});
   triangles+=verts.length/18;
   o.verts=null;
  }
  gl.enableVertexAttribArray(loc.pos);gl.enableVertexAttribArray(loc.normal);gl.enable(gl.DEPTH_TEST);
  function draw(){
   raf=0;if(!state.supported)return;
   let moving=false;for(const k of ['rotation','pitch','zoom','door']){const err=target[k]-current[k];
    if(Math.abs(err)>.0005){current[k]=reduced?target[k]:current[k]+err*.18;moving=true}else current[k]=target[k];
   }
   const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
   const width=Math.max(1,Math.floor(rect.width*dpr)),height=Math.max(1,Math.floor(rect.height*dpr));
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);state.pixels=width*height;}
   const {rotation,pitch,zoom}=current;
   const eye=[Math.sin(rotation)*Math.cos(pitch)*zoom,.85+Math.sin(pitch)*zoom,Math.cos(rotation)*Math.cos(pitch)*zoom];
   const camera=multiply(perspective(Math.PI/4,width/height,.12,100),lookAt(eye,[0,.56,0],[0,1,0]));
   gl.clearColor(.019,.020,.030,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.useProgram(program);gl.uniformMatrix4fv(loc.camera,false,new Float32Array(camera));gl.uniform3fv(loc.eye,new Float32Array(eye));
   for(const m of meshes){
    let model=identity();
    if(m.group==='leftDoor'||m.group==='rightDoor'){
     const side=m.group==='leftDoor'?-1:1,p=[side*.97,1.04,.52];
     model=multiply(translation(...p),multiply(rotationY(side*current.door),translation(-p[0],-p[1],-p[2])));
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(loc.normal,3,gl.FLOAT,false,24,12);
    gl.uniformMatrix4fv(loc.model,false,new Float32Array(model));gl.uniform3fv(loc.color,new Float32Array(m.paint?theme[state.color]:m.tint));
    gl.uniform1f(loc.gloss,m.gloss);gl.uniform1f(loc.metal,m.metal);gl.uniform1f(loc.glow,m.group==='headlamp'&&state.lightsOn?.78:0);
    gl.drawArrays(gl.TRIANGLES,0,m.count);
   }
   state.renderCount++;if(moving)raf=requestAnimationFrame(draw);
  }
  const render=()=>{if(!raf)raf=requestAnimationFrame(draw);};
  const cameraTarget=(yaw,pitch,zoom)=>{target.rotation=yaw;target.pitch=clamp(pitch,-.10,1.13);target.zoom=clamp(zoom,5.6,15.4);render();};
  let dragging=false,lastX=0,lastY=0;
  canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;cameraTarget(target.rotation-dx*.009,target.pitch+dy*.008,target.zoom);});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  canvas.addEventListener('wheel',e=>{e.preventDefault();cameraTarget(target.rotation,target.pitch,target.zoom+(e.deltaY>0?.5:-.5));},{passive:false});
  canvas.addEventListener('keydown',e=>{const keys={ArrowLeft:[-.14,0,0],ArrowRight:[.14,0,0],ArrowUp:[0,.12,0],ArrowDown:[0,-.12,0],'+':[0,0,-.5],'-':[0,0,.5]};if(!keys[e.key])return;e.preventDefault();const [x,y,z]=keys[e.key];cameraTarget(target.rotation+x,target.pitch+y,target.zoom+z);});
  controls.door.addEventListener('click',()=>{state.doorsOpen=!state.doorsOpen;target.door=state.doorsOpen?.98:0;controls.door.setAttribute('aria-pressed',String(state.doorsOpen));controls.door.textContent=state.doorsOpen?'도어 닫기':'도어 열기';setInfo(state.doorsOpen?'실제 3D 도어가 힌지를 중심으로 열렸습니다.':'도어가 닫혔습니다.');render();});
  controls.light.addEventListener('click',()=>{state.lightsOn=!state.lightsOn;controls.light.setAttribute('aria-pressed',String(state.lightsOn));controls.light.textContent=state.lightsOn?'전조등 끄기':'전조등 켜기';setInfo(state.lightsOn?'전조등 발광 재질을 켰습니다.':'전조등을 껐습니다.');render();});
  controls.color.addEventListener('change',()=>{state.color=controls.color.value;setInfo('차체 색상: '+controls.color.selectedOptions[0].text);render();});
  controls.view.addEventListener('click',()=>{const opts=[[-.44,.22,9.1],[Math.PI/2,.20,10.6],[0,.05,7.8],[Math.PI,.32,9.6]];const views=['threeQuarter','side','front','rear'],k=(views.indexOf(state.view)+1)%views.length;state.view=views[k];cameraTarget(...opts[k]);controls.view.textContent='시점 · '+['사선','측면','정면','후면'][k];});
  controls.plus.addEventListener('click',()=>cameraTarget(target.rotation,target.pitch,target.zoom-.7));
  controls.minus.addEventListener('click',()=>cameraTarget(target.rotation,target.pitch,target.zoom+.7));
  controls.reset.addEventListener('click',()=>{cameraTarget(-.44,.22,9.1);state.view='threeQuarter';state.doorsOpen=false;target.door=0;state.lightsOn=false;state.color='platinum';controls.color.value='platinum';controls.light.setAttribute('aria-pressed','false');controls.light.textContent='전조등 켜기';controls.door.setAttribute('aria-pressed','false');controls.door.textContent='도어 열기';controls.view.textContent='시점 · 사선';setInfo('시점과 외형을 기본 상태로 복구했습니다.');render();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showFallback('그래픽 컨텍스트 연결이 끊어졌습니다.');});
  if(window.ResizeObserver)new ResizeObserver(render).observe(canvas);else window.addEventListener('resize',render);
  state.supported=true;render();setInfo('실제 WebGL 3D 기술 시연 · 드래그/방향키로 회전 · '+triangles.toLocaleString('ko-KR')+'개 삼각형');
 }catch(e){showFallback('3D 초기화 실패: '+String(e.message||e).slice(0,100));}
 Object.defineProperty(window,'JunjaSovereignLab',{value:Object.freeze({
  snapshot:()=>({supported:state.supported,rotation:target.rotation,pitch:target.pitch,zoom:target.zoom,doorsOpen:state.doorsOpen,
   lightsOn:state.lightsOn,color:state.color,view:state.view,pixels:state.pixels,renderCount:state.renderCount,paid:false,owned:false,entitlement:false})
 })});
})();
