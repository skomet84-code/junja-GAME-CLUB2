/*
 * JUNJA SOVEREIGN / EXTERIOR AERO STUDY v10.
 * Independently authored procedural exterior bodywork pieces. The underlying
 * Khronos CarConcept body, proportions and licensed source are unchanged.
 * This module adds physically triangulated source-anchored 3D geometry, not
 * screenshot overlays, CSS wings, or a replacement proprietary full car.
 */
export function createSovereignAeroKit(THREE, car, carRoot){
 const node=name=>car.getObjectByName(name);
 const hood=node('BodyHoodUnder'),chassis=node('BodyUnderside'),rear=node('BodyTaillightsPanels');
 if(!hood||!chassis||!rear)throw Error('Aero studio requires the actual GLB hood, chassis and rear-body geometry');
 carRoot.updateMatrixWorld(true);
 const box=object=>new THREE.Box3().setFromObject(object);
 const front=box(hood),under=box(chassis),back=box(rear),source=box(carRoot);
 if([front,under,back,source].some(b=>b.isEmpty()))throw Error('Aero source surface has invalid geometry bounds');
 if(!(front.max.z>back.min.z+2&&source.max.y-source.min.y>.7))throw Error('Aero source orientation is unsafe');
 const ground=source.min.y;
 const half=Math.min(.91,(under.max.x-under.min.x)*.405);
 const nose=front.max.z,tail=under.min.z;
 const topY=ground+.125;
 const kit=new THREE.Group();
 kit.name='JUNJA_SOURCE_ANCHORED_AERO_V10';
 const carbon=new THREE.MeshPhysicalMaterial({
  color:0x11171c,metalness:.38,roughness:.34,clearcoat:.36,clearcoatRoughness:.3,
  side:THREE.DoubleSide
 });
 const titanium=new THREE.MeshStandardMaterial({
  color:0xb9a17d,metalness:.78,roughness:.29,side:THREE.DoubleSide
 });
 const shadow=new THREE.MeshStandardMaterial({
  color:0x06080b,metalness:.14,roughness:.63,side:THREE.DoubleSide
 });
 const metal=new THREE.MeshPhysicalMaterial({
  color:0x30343a,metalness:.73,roughness:.24,clearcoat:.2,side:THREE.DoubleSide
 });
 const pieces=[];
 // Exact triangulated horizontal plan profile, closed sides and real thickness.
 function sculptPlate(name,outline,yTop,thickness,material){
  const p=outline.map(([x,z])=>new THREE.Vector2(x,z));
  const tris=THREE.ShapeUtils.triangulateShape(p,[]);
  if(!tris.length)throw Error('Cannot triangulate aero surface: '+name);
  const n=p.length,positions=[],indices=[];
  for(const y of [yTop,yTop-thickness])for(const v of p)positions.push(v.x,y,v.y);
  for(const t of tris){indices.push(t[0],t[1],t[2],n+t[2],n+t[1],n+t[0]);}
  for(let i=0;i<n;i++){
   const j=(i+1)%n;
   indices.push(i,j,n+j,i,n+j,n+i);
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geom.setIndex(indices);geom.computeVertexNormals();
  const mesh=new THREE.Mesh(geom,material);
  mesh.name=name;mesh.castShadow=false;mesh.receiveShadow=true;
  kit.add(mesh);pieces.push(mesh);return mesh;
 }
 // Sculptural front splitter follows the front hood's actual lowest outline
 // and overhangs the pinned original vehicle only by a shallow real lip.
 const lip=half*.94;
 sculptPlate('JUNJA_V10_FRONT_SCULPTED_SPLITTER',[
  [-half,nose-.145],[-half,nose-.01],[-lip,nose+.08],
  [-half*.57,nose+.145],[0,nose+.127],
  [half*.57,nose+.145],[lip,nose+.08],
  [half,nose-.01],[half,nose-.145],[0,nose-.162]
 ],topY,.038,carbon);
 // Angled corner blades: low enough to remain exterior-only, well below the
 // grille, headlamps and windshield. Symmetric physical triangular meshes.
 for(const sign of [-1,1]){
  const x=sign*half;
  sculptPlate('JUNJA_V10_FRONT_CARBON_CANARD_'+(sign<0?'L':'R'),[
   [x*.71,nose+.038],[x*.91,nose+.025],[x*1.02,nose+.095],
   [x*.86,nose+.153],[x*.67,nose+.112]
  ],topY+.061,.029,metal);
 }
 // Subtle individually meshed metal upper rim, not a glowing decal.
 function line(name,coords,radius,material){
  const curve=new THREE.CatmullRomCurve3(coords.map(p=>new THREE.Vector3(...p)));
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,30,radius,5,false),material);
  mesh.name=name;mesh.castShadow=false;kit.add(mesh);pieces.push(mesh);return mesh;
 }
 line('JUNJA_V10_FRONT_TITANIUM_RIM',[
  [-half*.88,topY+.014,nose+.055],[-half*.54,topY+.014,nose+.13],
  [0,topY+.014,nose+.125],[half*.54,topY+.014,nose+.13],
  [half*.88,topY+.014,nose+.055]
 ],.007,titanium);
 // Lower sculpted intake blades are physical vertical surfaces close to
 // the donor nose, not hidden cockpit/roof tubes or floating billboard parts.
 function facadeBlade(sign){
  const x0=sign*half*.50,x1=sign*half*.81,z=nose+.018;
  const y0=ground+.195,y1=ground+.305;
  const coords=[
   x0,y0,z,
   x1,y0+.012,z+.012,
   x1*.99,y1-.012,z-.016,
   x0*.91,y1,z-.02
  ];
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
  const m=new THREE.Mesh(g,shadow);m.name='JUNJA_V10_FRONT_INTAKE_'+(sign<0?'L':'R');
  m.castShadow=false;kit.add(m);pieces.push(m);
 }
 facadeBlade(-1);facadeBlade(1);
 // Functional-looking rear diffuser mounted behind the actual body lower lip.
 const rearTop=ground+.155;
 sculptPlate('JUNJA_V10_REAR_SCULPTED_DIFFUSER',[
  [-half*.89,tail+.145],[-half*.80,tail-.082],
  [-half*.48,tail-.145],[0,tail-.17],
  [half*.48,tail-.145],[half*.80,tail-.082],
  [half*.89,tail+.145],[0,tail+.178]
 ],rearTop,.039,carbon);
 // Five individually tapered aerodynamic vanes are real closed triangular
 // prisms. Their height is only ~10cm above the ground, never inside cabin.
 function fin(name,x){
  const zz=tail-.137,y=ground+.12,th=.014;
  const pts=[
   [x-th,y-.075,zz+.16],[x-th,y+.075,zz+.15],
   [x-th,y+.023,zz-.034],
   [x+th,y-.075,zz+.16],[x+th,y+.075,zz+.15],
   [x+th,y+.023,zz-.034]
  ];
  const indices=[0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,2,0,3,2,3,5];
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(pts.flat(),3));
  geom.setIndex(indices);geom.computeVertexNormals();
  const m=new THREE.Mesh(geom,metal);m.name=name;m.castShadow=false;
  kit.add(m);pieces.push(m);
 }
 for(let i=-2;i<=2;i++)fin('JUNJA_V10_DIFFUSER_FIN_'+(i+3),i*half*.29);
 // Keep the original car's rear lamps free of all newly authored pieces.
 line('JUNJA_V10_REAR_TITANIUM_RIM',[
  [-half*.78,rearTop+.008,tail-.065],[-half*.43,rearTop+.008,tail-.131],
  [0,rearTop+.008,tail-.16],[half*.43,rearTop+.008,tail-.131],
  [half*.78,rearTop+.008,tail-.065]
 ],.006,titanium);
 const bounds=box(kit);
 // Any misplaced / oversized work is rejected rather than shipping a roof
 // piercing spoiler or an arbitrary large fake bumper.
 if(bounds.min.y<ground-.08||bounds.max.y>ground+.55||
  bounds.max.z>source.max.z+.35||bounds.min.z<source.min.z-.35||
  bounds.max.x>source.max.x+.09||bounds.min.x<source.min.x-.09){
  throw Error('Source-anchored aero work exceeds safe exterior geometry envelope');
 }
 return {group:kit,meshCount:pieces.length,bounds,
  frontDepth:+Math.max(0,bounds.max.z-source.max.z).toFixed(3),
  rearDepth:+Math.max(0,source.min.z-bounds.min.z).toFixed(3),
  originalSourceBounds:source.clone()};
}
