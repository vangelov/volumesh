import assert from 'node:assert/strict';
import { mat4 } from 'gl-matrix';
import { surfaceNets } from '../src/lib/surface-nets';
import type { Mesh } from '../src/data/mesh';

function topology(mesh: Mesh) {
  const edges=new Map<string,number>();
  const neighbors=Array.from({length:mesh.points.length/3},()=>new Set<number>());
  let signedVolume=0;
  for(let i=0;i<mesh.indices.length;i+=3) {
    const ids=Array.from(mesh.indices.slice(i,i+3));
    const [a,b,c]=ids.map(id=>mesh.points.slice(id*3,id*3+3));
    const cross=[b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0]];
    signedVolume+=(a[0]*cross[0]+a[1]*cross[1]+a[2]*cross[2])/6;
    for(let j=0;j<3;j++) {
      const a=ids[j],b=ids[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');
      edges.set(key,(edges.get(key)||0)+1);neighbors[a].add(b);neighbors[b].add(a);
    }
  }
  assert.ok([...edges.values()].every(count=>count===2),'surface closed, including volume boundaries');
  assert.ok(signedVolume>0,'outward orientation survives LPS to RAS');
  let components=0;
  const visited=new Set<number>();
  for(let i=0;i<neighbors.length;i++) if(!visited.has(i)) {
    components++;const stack=[i];visited.add(i);
    while(stack.length)for(const n of neighbors[stack.pop()!])if(!visited.has(n)){visited.add(n);stack.push(n);}
  }
  return {euler:mesh.points.length/3-edges.size+mesh.indices.length/3,components};
}
const dims=[20,20,12];
const ring=new Uint8Array(dims[0]*dims[1]*dims[2]);
for(let z=3;z<=8;z++) for(let y=0;y<20;y++)for(let x=0;x<20;x++) {
  const r=Math.hypot(x-9.5,y-9.5);
  if(r>=3 && r<=7)ring[x+20*(y+20*z)]=1;
}
const plain=surfaceNets(ring,dims,mat4.create(),'Ring',false);
const smooth=surfaceNets(ring,dims,mat4.create(),'Ring',true);
assert.notDeepEqual(plain.points,smooth.points,'smoothing changes larger surfaces');
assert.deepEqual(topology(plain),{euler:0,components:1},'central hole retained');
assert.deepEqual(topology(smooth),topology(plain),'smoothing retains connectivity and holes');
assert.deepEqual(smooth.indices,plain.indices);
assert.notDeepEqual(smooth.points,plain.points,'smoothing changes shape, not just lighting');
assert.ok(smooth.points.every(Number.isFinite));
for(let i=0;i<smooth.points.length;i+=3) {
  assert.ok(Math.hypot(...Array.from(smooth.points.slice(i,i+3)).map((v,j)=>v-plain.points[i+j]))<=Math.sqrt(3),'motion constrained to original surface cell');
}
const disjoint=new Uint8Array(125);disjoint[0]=1;disjoint[124]=1;
for(const smooth of [false,true]) {
  const tiny=surfaceNets(disjoint,[5,5,5],mat4.create(),'Tiny',smooth);
  assert.deepEqual(topology(tiny),{euler:4,components:2},'tiny disjoint structures and border caps retained');
}
assert.deepEqual(
  surfaceNets(disjoint,[5,5,5],mat4.create(),'Tiny',true).points,
  surfaceNets(disjoint,[5,5,5],mat4.create(),'Tiny',false).points,
  'tiny components retain their unsmoothed shape',
);
function volume(mesh: Mesh) {
  let sum=0;
  for(let i=0;i<mesh.indices.length;i+=3) {
    const [a,b,c]=Array.from(mesh.indices.slice(i,i+3)).map(v=>mesh.points.slice(v*3,v*3+3));
    sum+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  return sum;
}
const sphere=new Uint8Array(20*20*20);
for(let z=0;z<20;z++) for(let y=0;y<20;y++)for(let x=0;x<20;x++) if(Math.hypot(x-10,y-10,z-10)<6) sphere[x+20*(y+20*z)]=1;
const spherePlain=surfaceNets(sphere,[20,20,20],mat4.create(),'Sphere',false);
const sphereSmooth=surfaceNets(sphere,[20,20,20],mat4.create(),'Sphere',true);
assert.ok(Math.abs(volume(sphereSmooth)/volume(spherePlain)-1)<0.1,'paired smoothing limits sphere volume change');
assert.deepEqual(topology(sphereSmooth),{euler:2,components:1});
const empty=surfaceNets(new Uint8Array(8),[2,2,2],mat4.create(),'Empty',true);
assert.equal(empty.indices.length,0);
console.log('Surface nets tests passed: closed surfaces, holes, orientation, disjoint tiny structures, bounded smoothing.');
