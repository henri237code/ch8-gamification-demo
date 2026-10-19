import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {Server} from 'socket.io';
import type {Engine} from './engine.js';
import {createApp} from './app.js';
export type SharedState=ReturnType<Engine['snapshot']>&{synchronization:{serverInstanceId:string;sequence:number;emittedAt:string}};

// One snapshot per broadcast, also reused for a command's HTTP response.
// A new server identity distinguishes a restart from an out-of-order packet.
export function createRuntime(engine:Engine,token:string,options:{intervalMs?:number;onError?:(error:unknown)=>void}={}) {
  const instance=randomUUID();let sequence=0;
  const readState=():SharedState=>({...engine.snapshot(),synchronization:{serverInstanceId:instance,sequence:++sequence,emittedAt:new Date(engine.clock()).toISOString()}});
  let io:Server;
  const broadcast=(state?:ReturnType<Engine['snapshot']>)=>{const current=state??readState();io.emit('state',current);return current;};
  const app=createApp(engine,token,broadcast,readState),server=createServer(app);
  io=new Server(server,{serveClient:false,maxHttpBufferSize:32_768});
  const report=(error:unknown)=>{
    options.onError?.(error);
    io.emit('state-error',{message:'Actualisation indisponible ; conserver l’affichage comme non actualisé et attendre la prochaine mise à jour.',retryable:true});
  };
  // No command handlers: mutations use the authenticated HTTP routes only.
  io.on('connection',()=>{try {broadcast();}catch(error){report(error);}});
  const refresh=()=>{try {if(io.engine.clientsCount>0) broadcast();else engine.tick();}catch(error){report(error);}};
  const interval=setInterval(refresh,options.intervalMs??1000);
  interval.unref();
  return {app,server,io,readState,refresh,close:()=>new Promise<void>((resolve,reject)=>{
    clearInterval(interval);
    io.close((error?:Error)=>error?reject(error):resolve());
  })};
}
