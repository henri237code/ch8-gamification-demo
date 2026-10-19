import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 root:'client',publicDir:false,plugins:[react()],
 build:{outDir:'../dist/client',emptyOutDir:true},
 server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{
  '/api':'http://127.0.0.1:3080','/socket.io':{target:'http://127.0.0.1:3080',ws:true},
  '/challenges':'http://127.0.0.1:3080','/icons':'http://127.0.0.1:3080','/badges':'http://127.0.0.1:3080','/media':'http://127.0.0.1:3080'
 }}
});
