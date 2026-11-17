import assert from 'node:assert/strict';
import dicom from 'dicom-parser';
import { mat4, vec3 } from 'gl-matrix';
import { meshesFromRtstruct, decimals } from '../src/lib/rtstruct';
import { Anatomy } from '../src/data/anatomy';
import { importDicomData } from '../src/lib/dicom';
import type { Volume } from '../src/data/volume';

function element(tag: string, vr: string, value: string | Buffer) {
  let bytes = typeof value === 'string' ? Buffer.from(value) : value;
  if (bytes.length % 2) bytes = Buffer.concat([bytes, Buffer.from([vr === 'UI' ? 0 : 32])]);
  const long = ['SQ', 'UN', 'OW'].includes(vr), header = Buffer.alloc(long ? 12 : 8);
  header.writeUInt16LE(parseInt(tag.slice(0,4),16)); header.writeUInt16LE(parseInt(tag.slice(4),16),2); header.write(vr,4);
  if (long) header.writeUInt32LE(bytes.length,8); else header.writeUInt16LE(bytes.length,6);
  return Buffer.concat([header,bytes]);
}
function sequence(tag: string, items: Buffer[][]) {
  return element(tag,'SQ',Buffer.concat(items.map(elements=>{
    const bytes=Buffer.concat(elements), header=Buffer.alloc(8);
    header.writeUInt16LE(0xfffe);header.writeUInt16LE(0xe000,2);header.writeUInt32LE(bytes.length,4);
    return Buffer.concat([header,bytes]);
  })));
}
function part10(elements: Buffer[]) {
  const preamble=Buffer.alloc(132);preamble.write('DICM',128);
  return new Uint8Array(Buffer.concat([preamble,element('00020010','UI','1.2.840.10008.1.2.1'),...elements]));
}
const volume: Volume = {
  label:'MRI',origin:[10,20,30],dims:[5,5,3],dirs:[[2,0,0],[0,3,0],[0,0,4]],space:'lps',data:new Uint8Array(75),
  volumeToWorld:mat4.create(),worldToVolume:mat4.create(),dicom:{seriesUID:'2',frameUID:'3',instanceUIDs:['2.0','2.1','2.2']},
};
function contour(square: number[][], type='CLOSED_PLANAR', vr='DS', grid=volume) {
  const text=square.map(p=>[0,1,2].map(i=>grid.origin[i]+grid.dirs[0][i]*p[0]+grid.dirs[1][i]*p[1]+grid.dirs[2][i])).flat().join(String.fromCharCode(92));
  return [sequence('30060016',[[element('00081155','UI','2.1')]]),element('30060042','CS',type),element('30060046','IS',String(square.length)),element('30060050',vr,text)];
}
const square=[[1,1],[3,1],[3,3],[1,3]];
function rt(contours=[contour(square)], frame='3') {
  return part10([
    element('00080060','CS','RTSTRUCT'),
    sequence('30060010',[[element('00200052','UI',frame),sequence('30060012',[[sequence('30060014',[[element('0020000e','UI','2')]])]])]]),
    sequence('30060020',[[element('30060022','IS','1'),element('30060024','UI',frame),element('30060026','LO','Target')]]),
    sequence('30060039',[[element('3006002a','IS','255\\128\\0'),sequence('30060040',contours),element('30060084','IS','1')]]),
  ]);
}
// Reproduce 528 point groups containing 1584 coordinates.
const grouped = Array.from({length:528},(_,i)=>`${i}.25 ${i}.5 34`).join(String.fromCharCode(92));
const groupedDs=dicom.parseDicom(part10([element('30060050','UN',grouped)]));
assert.equal(decimals(groupedDs,'x30060050',1584).length,1584);
const commaDs=dicom.parseDicom(part10([element('30060050','DS','1,2,3'+String.fromCharCode(92)+'4,5,6')]));
assert.deepEqual(decimals(commaDs,'x30060050',6),[1,2,3,4,5,6]);
const genuinelyShort=dicom.parseDicom(part10([element('30060050','DS',Array.from({length:528},(_,i)=>String(i)).join(String.fromCharCode(92)))]));
assert.throws(()=>decimals(genuinelyShort,'x30060050',1584),/expected 1584 decimal values, found 528/,'do not silently invent missing coordinates');
// Reproduce the inspected exporter: point count stores the number of scalars.
const exporterContour=contour(square);
exporterContour[2]=element('30060046','IS','12');
const recovered=meshesFromRtstruct([dicom.parseDicom(rt([exporterContour]))],[volume]);
assert.equal(recovered.meshes.length,1);
assert.match(recovered.warnings.join(' '),/corrected scalar counts to XYZ point counts/);
const wrongCount=contour(square);wrongCount[2]=element('30060046','IS','5');
assert.throws(()=>meshesFromRtstruct([dicom.parseDicom(rt([wrongCount]))],[volume]),/expected 15/,'other mismatches remain errors');
const parsed=dicom.parseDicom(rt());
const result=meshesFromRtstruct([parsed],[volume]);
assert.equal(result.meshes.length,1);
assert.equal(result.meshes[0].label,'Target');
assert.deepEqual(result.meshes[0].color,[1,128/255,0]);
assert.equal(result.meshes[0].indices.length,96,'four occupied voxels form a closed surface');
const source=result.meshes[0];
const anatomy=Anatomy.create({id:'dicom-test',info:{description:'',url:''},volumes:[volume],meshes:result.meshes,boundsFrom:'volumes'});
const without=Anatomy.create({id:'volume-only',info:{description:'',url:''},volumes:[volume],meshes:[],boundsFrom:'volumes'});
assert.deepEqual(anatomy.world,without.world,'adding ROI does not change volume bounds');
assert.deepEqual(anatomy.volumes[0].volumeToWorld,without.volumes[0].volumeToWorld,'ROI never changes volume transform');
const inversePatient=mat4.invert(mat4.create(),mat4.fromValues(2,0,0,0,0,3,0,0,0,0,4,0,10,20,30,1))!;
for(let i=0;i<source.points.length;i+=3) {
  const lps=[-source.points[i],-source.points[i+1],source.points[i+2]];
  const voxel=vec3.transformMat4(vec3.create(),lps,inversePatient);
  const expected=vec3.transformMat4(vec3.create(),[voxel[0]/4,voxel[1]/4,voxel[2]/2],anatomy.volumes[0].volumeToWorld);
  assert.ok(vec3.distance(expected,anatomy.meshes[0].points.slice(i,i+3))<1e-6,'mesh and volume share patient coordinates');
}
const atlas=Anatomy.create({id:'atlas',info:{description:'',url:''},volumes:[volume],meshes:result.meshes});
assert.notDeepEqual(atlas.world,anatomy.world,'existing atlas mesh-bounds default is preserved');
const tilted: Volume={...volume,dirs:[[0,2,0],[-3,0,0],[0.5,0,4]]};
const tiltedMeshes=meshesFromRtstruct([dicom.parseDicom(rt([contour(square,'CLOSED_PLANAR','DS',tilted)]))],[tilted]).meshes;
const tiltedAnatomy=Anatomy.create({id:'tilted',info:{description:'',url:''},volumes:[tilted],meshes:tiltedMeshes,boundsFrom:'volumes'});
for(let i=0;i<tiltedMeshes[0].points.length;i+=3) {
  const ras=tiltedMeshes[0].points.slice(i,i+3);
  const normalized=vec3.fromValues(...Array.from(ras).map((v,j)=>(v-tiltedAnatomy.world.bounds.min[j])/tiltedAnatomy.world.maxSize+tiltedAnatomy.world.offset[j]) as [number,number,number]);
  assert.ok(vec3.distance(normalized,tiltedAnatomy.meshes[0].points.slice(i,i+3))<1e-6,'oblique tilted mesh gets only shared normalization');
}
const xor=meshesFromRtstruct([dicom.parseDicom(rt([contour([[0,0],[4,0],[4,4],[0,4]],'CLOSEDPLANAR_XOR'),contour([[1,1],[3,1],[3,3],[1,3]],'CLOSEDPLANAR_XOR')]))],[volume]);
assert.ok(xor.meshes[0].indices.length>result.meshes[0].indices.length,'XOR reconstruction has inner hole surfaces');
assert.equal(meshesFromRtstruct([dicom.parseDicom(rt([contour(square,'CLOSED_PLANAR','UN')]))],[volume]).meshes.length,1);
assert.throws(()=>meshesFromRtstruct([dicom.parseDicom(rt(undefined,'other-frame'))],[volume]),/Frame of Reference/);
const skipped=meshesFromRtstruct([dicom.parseDicom(rt([contour(square,'OPEN_PLANAR')]))],[volume]);
assert.equal(skipped.meshes.length,0);assert.equal(skipped.warnings.length,1);
// Exercise the folder import API, not just the reconstruction helper.
const us=(tag:string,value:number)=>{const bytes=Buffer.alloc(2);bytes.writeUInt16LE(value);return element(tag,'US',bytes);};
const image=(z:number,series='2',frame='3',modality='MR')=>new File([part10([
  element('00080018','UI',`${series}.${z}`),element('00080060','CS',modality),element('0020000e','UI',series),element('00200052','UI',frame),
  element('00200032','DS',`10\\20\\${30+z*4}`),element('00200037','DS','1\\0\\0\\0\\1\\0'),
  us('00280002',1),element('00280004','CS','MONOCHROME2'),us('00280010',5),us('00280011',5),element('00280030','DS','3\\2'),
  us('00280100',16),us('00280101',16),us('00280102',15),us('00280103',0),element('7fe00010','OW',Buffer.alloc(50)),
])],`slice-${z}.dcm`);
const imported=await importDicomData([image(2),new File([rt()],'structures.dcm'),image(0),image(1),image(0,'7','8','CT'),image(1,'7','8','CT')],()=>{});
assert.equal(imported.volumes.length,1);assert.equal(imported.meshes.length,1);
assert.equal(imported.meshes[0].label,'Target');
assert.match(imported.warnings.join(' '),/Skipped 1 volume/,'incompatible frame variants excluded from anatomy');
console.log('RTSTRUCT tests passed: folder import, colors, LPS/RAS alignment, volume bounds, XOR, UN, frame validation.');
