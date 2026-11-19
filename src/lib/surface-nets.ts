import { mat4, vec3 } from 'gl-matrix';
import { Mesh } from '../data/mesh';

/** Dual surface at the 0.5 isovalue of a binary mask, with an empty exterior. */
export function surfaceNets(mask: Uint8Array, dims: number[], affine: mat4, label: string, smooth: boolean): Mesh {
  const [nx, ny, nz] = dims;
  let xmin=nx, ymin=ny, zmin=nz, xmax=-1, ymax=-1, zmax=-1;
  for (let z=0;z<nz;z++) for (let y=0;y<ny;y++) for(let x=0;x<nx;x++) {
    if (!mask[x+nx*(y+ny*z)]) continue;
    xmin=Math.min(xmin,x); xmax=Math.max(xmax,x);
    ymin=Math.min(ymin,y); ymax=Math.max(ymax,y);
    zmin=Math.min(zmin,z); zmax=Math.max(zmax,z);
  }
  if (xmax<0) return Mesh.create({label,points:new Float32Array(),indices:new Uint32Array()});
  const sample=(x:number,y:number,z:number)=>x>=0 && y>=0 && z>=0 && x<nx && y<ny && z<nz ? mask[x+nx*(y+ny*z)] : 0;
  const key=(x:number,y:number,z:number)=>(x+1)+(nx+1)*((y+1)+(ny+1)*(z+1));
  const cells=new Map<number,number>();
  const points:number[]=[], origins:number[]=[], indices:number[]=[];
  // CSR adjacency is assembled from quad edges below; diagonals must not bias relaxation.
  const edges:number[]=[];
  const corners=Array.from({length:8},(_,i)=>[i&1,(i>>1)&1,(i>>2)&1]);
  const cubeEdges:number[][]=[];
  for(let i=0;i<8;i++) for(let axis=0;axis<3;axis++) if(!(i&(1<<axis))) cubeEdges.push([i,i|(1<<axis)]);
  for(let z=zmin-1;z<=zmax;z++) for(let y=ymin-1;y<=ymax;y++) for(let x=xmin-1;x<=xmax;x++) {
    const values=corners.map(c=>sample(x+c[0],y+c[1],z+c[2]));
    if(values.every(v=>v===values[0])) continue;
    let px=0,py=0,pz=0,count=0;
    for(const [a,b] of cubeEdges) if(Boolean(values[a])!==Boolean(values[b])) {
      px+=(corners[a][0]+corners[b][0])/2;
      py+=(corners[a][1]+corners[b][1])/2;
      pz+=(corners[a][2]+corners[b][2])/2; count++;
    }
    const id=points.length/3;
    if(id>=2_000_000) throw new Error(`${label}: mesh exceeds two million vertices`);
    cells.set(key(x,y,z),id);
    points.push(x+px/count,y+py/count,z+pz/count);origins.push(x,y,z);
  }
  const quad=(coords:number[][],outward:boolean)=>{
    const ids=coords.map(c=>cells.get(key(c[0],c[1],c[2])));
    if(ids.some(id=>id===undefined)) throw new Error(`${label}: incomplete surface cell connectivity`);
    const q=ids as number[];
    if(!outward) q.reverse();
    indices.push(q[0],q[1],q[2],q[0],q[2],q[3]);
    if(smooth) for(let i=0;i<4;i++) edges.push(q[i],q[(i+1)%4]);
  };
  for(let z=zmin-1;z<=zmax;z++) for(let y=ymin-1;y<=ymax;y++) for(let x=xmin-1;x<=xmax;x++) {
    const value=Boolean(sample(x,y,z));
    if(value!==Boolean(sample(x+1,y,z))) quad([[x,y-1,z-1],[x,y,z-1],[x,y,z],[x,y-1,z]],value);
    if(value!==Boolean(sample(x,y+1,z))) quad([[x-1,y,z-1],[x-1,y,z],[x,y,z],[x,y,z-1]],value);
    if(value!==Boolean(sample(x,y,z+1))) quad([[x-1,y-1,z],[x,y-1,z],[x,y,z],[x-1,y,z]],value);
  }
  let positions=Float32Array.from(points);
  if(smooth) {
    const vertexCount=positions.length/3;
    const counts=new Uint32Array(vertexCount);
    // Each shared quad edge occurs twice, equally weighting all neighbors.
    for(const id of edges) counts[id]++;
    const offsets=new Uint32Array(vertexCount+1);
    for(let i=0;i<vertexCount;i++) offsets[i+1]=offsets[i]+counts[i];
    const neighbors=new Uint32Array(offsets[vertexCount]);
    counts.fill(0);
    for(let e=0;e<edges.length;e+=2) {
      const a=edges[e],b=edges[e+1];
      neighbors[offsets[a]+counts[a]++]=b;neighbors[offsets[b]+counts[b]++]=a;
    }
    // Preserve tiny connected components instead of smoothing them toward a point.
    const visited=new Uint8Array(vertexCount), pinned=new Uint8Array(vertexCount);
    for(let seed=0;seed<vertexCount;seed++) if(!visited[seed]) {
      const component=[seed];visited[seed]=1;
      for(let i=0;i<component.length;i++) {
        const v=component[i];
        for(let j=offsets[v];j<offsets[v+1];j++) {
          const n=neighbors[j];
          if(!visited[n]) { visited[n]=1;component.push(n); }
        }
      }
      if(component.length<32) for(const v of component) pinned[v]=1;
    }
    let next=new Float32Array(positions.length);
    // Paired Taubin passes reduce shrinkage; clamp both passes to source cells.
    // Voxel-space constraints retain the original anisotropic/tilted geometry.
    for(let pass=0;pass<20;pass++) {
      for(let v=0;v<vertexCount;v++) for(let axis=0;axis<3;axis++) {
        const index=v*3+axis;
        let sum=0;
        for(let j=offsets[v];j<offsets[v+1];j++) sum+=positions[neighbors[j]*3+axis];
        if(pinned[v]) { next[index]=positions[index];continue; }
        const target=counts[v] ? sum/counts[v] : positions[index];
        const factor=pass%2===0 ? 0.5 : -0.53;
        const relaxed=positions[index]+factor*(target-positions[index]);
        // Keep a small margin to avoid collapsing different cells onto one plane.
        next[index]=Math.max(origins[index]+0.01,Math.min(origins[index]+0.99,relaxed));
      }
      [positions,next]=[next,positions];
    }
  }
  for(let i=0;i<positions.length;i+=3) {
    const lps=vec3.transformMat4(vec3.create(),positions.subarray(i,i+3),affine);
    positions[i]=-lps[0];positions[i+1]=-lps[1];positions[i+2]=lps[2];
  }
  return Mesh.create({label,points:positions,indices:Uint32Array.from(indices)});
}
