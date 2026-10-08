import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {createWorker} from '../worker/index.js';
import {localDatabase} from './local-db.mjs';
import {localPhotos} from './local-photos.mjs';
mkdirSync('.sites-runtime',{recursive:true});
const DB=localDatabase('.sites-runtime/preview-votes.sqlite');
const PHOTOS=localPhotos('.sites-runtime/preview-photos');
const server=createServer(async(req,res)=>{
  try{
    const assets={};for(const name of ['index.html','style.css','app.js','admin.html','admin.js','classes.js','tickets.js','tierlist-restore.js'])assets['/'+name]=readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
    assets['/favicon.png']={base64:readFileSync(new URL('../public/favicon.png',import.meta.url)).toString('base64'),type:'image/png'};
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const host=req.headers.host==='localhost:5174'?'localhost:5174':'127.0.0.1:5174';
    const request=new Request('http://'+host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await createWorker(assets).fetch(request,{DB,PHOTOS,ADMIN_SETUP_HASH:process.env.ADMIN_SETUP_HASH});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.writeHead(500);res.end('Preview unavailable');}
});
server.listen(5174,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5174/'));
