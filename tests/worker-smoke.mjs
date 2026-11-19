import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true,ws:false}});
try {
  const { workerJob }=await server.ssrLoadModule('/tests/rtstruct.test.ts');
  const { meshesFromRtstruct }=await server.ssrLoadModule('/src/lib/rtstruct.ts');
  const parser=(await import('dicom-parser')).default;
  const assets=await fs.readdir('dist/assets');
  const workerFile=assets.find(file=>file.startsWith('rtstruct-worker-')&&file.endsWith('.js'));
  assert.ok(workerFile,'build emits reconstruction worker');
  for(const method of ['smooth','surface-nets','voxel']) {
    const job={...workerJob,method};
    const expected=meshesFromRtstruct(job.structures.map(bytes=>parser.parseDicom(bytes)),job.volumes,method);
    const worker=new Worker(`
      const {parentPort,workerData}=require('node:worker_threads');
      globalThis.self=globalThis;
      globalThis.postMessage=(...args)=>parentPort.postMessage(...args);
      import(workerData).then(()=>{
        parentPort.on('message',data=>globalThis.onmessage({data}));
        parentPort.postMessage({ready:true});
      });
    `,{eval:true,workerData:pathToFileURL(`${process.cwd()}/dist/assets/${workerFile}`).href});
    try {
      const result=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Worker timeout')),20000);
        worker.on('error',error=>{clearTimeout(timeout);reject(error);});
        worker.on('message',message=>{
          if(message.ready) worker.postMessage(job);
          else {clearTimeout(timeout);if(message.error)reject(new Error(message.error));else resolve(message.result);}
        });
      });
      assert.deepEqual(result.meshes[0].points,expected.meshes[0].points,`${method} worker output`);
      assert.deepEqual(result.meshes[0].indices,expected.meshes[0].indices);
    } finally { await worker.terminate(); }
  }
  console.log('Production worker smoke test passed for all reconstruction methods.');
} finally { await server.close(); }
