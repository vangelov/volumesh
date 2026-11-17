import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true,ws:false}});
try {
  await server.ssrLoadModule('/tests/dicom.test.ts');
  await server.ssrLoadModule('/tests/rtstruct.test.ts');
} finally { await server.close(); }
