import assert from 'node:assert/strict';
import { importDicomVolumes } from '../src/lib/dicom';
import { Anatomy } from '../src/data/anatomy';
import { vec3 } from 'gl-matrix';

function image(z: number, modality = 'CT', series = '1', orientation = '1\\0\\0\\0\\1\\0') {
  const chunks: Buffer[] = [Buffer.alloc(128), Buffer.from('DICM')];
  function tag(group: number, element: number, vr: string, value: string | number | Buffer) {
    let bytes = typeof value === 'number' ? Buffer.from([value & 255, value >> 8]) : typeof value === 'string' ? Buffer.from(value) : value;
    if (bytes.length % 2) bytes = Buffer.concat([bytes, Buffer.from([vr === 'UI' ? 0 : 32])]);
    const long = vr === 'OW';
    const header = Buffer.alloc(long ? 12 : 8);
    header.writeUInt16LE(group); header.writeUInt16LE(element, 2); header.write(vr, 4);
    if (long) header.writeUInt32LE(bytes.length, 8); else header.writeUInt16LE(bytes.length, 6);
    chunks.push(header, bytes);
  }
  tag(2, 0x10, 'UI', '1.2.840.10008.1.2.1');
  tag(8, 0x18, 'UI', `${series}.${z}`); tag(8, 0x60, 'CS', modality);
  tag(0x20, 0xe, 'UI', series); tag(0x20, 0x32, 'DS', `10\\20\\${z}`); tag(0x20, 0x37, 'DS', orientation);
  tag(0x28, 2, 'US', 1); tag(0x28, 4, 'CS', 'MONOCHROME2');
  tag(0x28, 0x10, 'US', 2); tag(0x28, 0x11, 'US', 2); tag(0x28, 0x30, 'DS', '2\\3');
  tag(0x28, 0x100, 'US', 16); tag(0x28, 0x101, 'US', 12); tag(0x28, 0x102, 'US', 11); tag(0x28, 0x103, 'US', 1);
  tag(0x28, 0x1052, 'DS', '-100'); tag(0x28, 0x1053, 'DS', '2');
  const pixels = Buffer.alloc(8);
  [-100 + z, 0, 100, 200].forEach((v, i) => pixels.writeUInt16LE(v & 4095, i * 2));
  tag(0x7fe0, 0x10, 'OW', pixels);
  return new File([Buffer.concat(chunks)], `${series}-${z}.dcm`);
}
const volumes = await importDicomVolumes([image(6), image(0), image(3), image(0, 'MR', '2'), image(3, 'MR', '2')], () => {});
assert.equal(volumes.length, 2);
assert.deepEqual(Array.from(volumes[0].dims), [2, 2, 3]);
assert.deepEqual(Array.from(volumes[0].origin), [10, 20, 0]);
assert.deepEqual(Array.from(volumes[0].dirs[0]), [3, 0, 0]);
assert.deepEqual(Array.from(volumes[0].dirs[1]), [0, 2, 0]);
assert.deepEqual(Array.from(volumes[0].dirs[2]), [0, 0, 3]);
assert.equal(volumes[0].data[0], 0);
assert.equal(volumes[0].data[3], 255);
const anatomy = Anatomy.create({ id: 'test', info: { description: '', url: '' }, volumes, meshes: [] });
assert.equal(anatomy.world.maxSize, 6);
const v = anatomy.volumes[0];
const start = vec3.transformMat4(vec3.create(), [0, 0, 0], v.volumeToWorld);
const end = vec3.transformMat4(vec3.create(), [1, 1, 1], v.volumeToWorld);
assert.ok(Math.abs(start[0] - .75) < 1e-6);
assert.ok(Math.abs(end[0] - .25) < 1e-6);
assert.ok(Math.abs(end[2] - 1) < 1e-6);
const roundtrip = vec3.transformMat4(vec3.create(), end, v.worldToVolume);
assert.ok(vec3.distance(roundtrip, [1, 1, 1]) < 1e-6);
await assert.rejects(() => importDicomVolumes([image(0), image(3), image(9)], () => {}), /irregularly spaced/);
await assert.rejects(() => importDicomVolumes([image(0)], () => {}), /at least two/);
console.log('DICOM import tests passed');
