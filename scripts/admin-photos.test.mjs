import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,ACTIVE_ROUND} from '../worker/index.js';
import {digest} from '../worker/admin.js';
import {localDatabase} from './local-db.mjs';
const origin='https://ranking.test';const worker=createWorker({});const setupToken='test-only-setup-token';const email='admin@example.test',password='Only-for-local-tests-2026';
const ranks=tier=>Array.from({length:7},(_,i)=>({teacherId:i+1,tier}));
async function envForTest(){return {DB:localDatabase(),ADMIN_SETUP_HASH:await digest(setupToken)};}
async function post(env,path,body,cookie='',token='',requestOrigin=origin){return worker.fetch(new Request(origin+path,{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json',...(cookie?{cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);}
async function person(env,classId='1ITF04'){const response=await worker.fetch(new Request(origin+'/api/results?classId='+classId),env);return {cookie:response.headers.get('set-cookie').split(';')[0],data:await response.json()};}
async function setup(env){const response=await post(env,'/api/admin/setup',{email,password},'',setupToken);assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict.*Secure/);return response.headers.get('set-cookie').split(';')[0];}
test('Only an authenticated admin can reset; setup is one-time and logout revokes the session',async()=>{
 const env=await envForTest();try{
  assert.equal((await post(env,'/api/admin/reset',{classId:'all',confirm:'RESET'})).status,401);
  assert.equal((await post(env,'/api/admin/setup',{email,password},'','bad-token')).status,403);
  const cookie=await setup(env);
  const initialState=await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env);assert.equal((await initialState.json()).classes.length,19);
  assert.equal((await post(env,'/api/admin/setup',{email,password},'',setupToken)).status,403);
  assert.equal((await post(env,'/api/admin/login',{email,password:'wrong'})).status,401);
  assert.equal((await post(env,'/api/admin/reset',{classId:'all',confirm:'RESET'},cookie,'','https://outside.test')).status,403);
  assert.equal((await post(env,'/api/admin/reset',{classId:'1ITF06',confirm:'RESET'},cookie)).status,400);
  const login=await post(env,'/api/admin/login',{email,password});assert.equal(login.status,200);
  const [stored]=await env.DB.batch([env.DB.prepare('SELECT password_hash, salt FROM admin_account')]);assert.notEqual(stored.results[0].password_hash,password);assert.equal(stored.results[0].salt.length,64);
  await post(env,'/api/admin/logout',{},cookie);
  assert.equal((await post(env,'/api/admin/reset',{classId:'all',confirm:'RESET'},cookie)).status,401);
  const loginCookie=login.headers.get('set-cookie').split(';')[0];const future=createWorker({},()=>new Date(Date.now()+86401000));const state=await future.fetch(new Request(origin+'/api/admin/state',{headers:{cookie:loginCookie}}),env);assert.equal((await state.json()).authenticated,false);
 }finally{env.DB.close();}
});
test('Reset isolates one class, rejects old open ballots, updates overall and can reset all classes',async()=>{
 const env=await envForTest();try{
  const admin=await setup(env),p=await person(env);await post(env,'/api/votes',{rankings:ranks('S'),roundId:ACTIVE_ROUND},p.cookie);
  await post(env,'/api/classes',{classId:'1ITF01',teacherNames:['Lena Dillien','Brent Pulmans','Michaël Cloots','Natalie Smets','Bart Portier','Stef Adriaansen','Stef Van Wolputte']},p.cookie);
  await post(env,'/api/votes',{classId:'1ITF01',rankings:ranks('A'),roundId:ACTIVE_ROUND},p.cookie);
  await post(env,'/api/duels',{leftId:1,rightId:2,winnerId:1,roundId:ACTIVE_ROUND},p.cookie);
  let response=await post(env,'/api/admin/reset',{classId:'1ITF04',confirm:'RESET'},admin);assert.equal(response.status,200);let data=await response.json();assert.equal(data.classes.find(c=>c.classId==='1ITF04').votes,0);assert.equal(data.classes.find(c=>c.classId==='1ITF01').votes,1);
  data=await (await worker.fetch(new Request(origin+'/api/results',{headers:{cookie:p.cookie}}),env)).json();assert.equal(data.blind,true);assert.deepEqual(data.myDuels,[]);assert.notEqual(data.roundId,ACTIVE_ROUND);assert.equal(data.teacherNames[0],'Lena Dillien');const newRound=data.roundId;
  assert.equal((await post(env,'/api/votes',{rankings:ranks('F'),roundId:ACTIVE_ROUND},p.cookie)).status,409);
  data=await (await post(env,'/api/votes',{rankings:ranks('F'),roundId:newRound},p.cookie)).json();assert.ok(data.teachers.every(t=>t.total===1&&t.counts.F===1));assert.ok(data.overall.every(t=>t.total===2&&t.counts.A===1&&t.counts.F===1));assert.equal(data.weeks[0].voters,1);
  const extra=await person(env,'2appai');await post(env,'/api/classes',{classId:'2appai',teacherNames:p.data.teacherNames},extra.cookie);await post(env,'/api/votes',{classId:'2appai',rankings:ranks('B'),roundId:extra.data.roundId},extra.cookie);
  data=await (await post(env,'/api/admin/reset',{classId:'2appai',confirm:'RESET'},admin)).json();assert.equal(data.classes.find(c=>c.classId==='2APPAI').votes,0);assert.equal(data.classes.find(c=>c.classId==='1ITF01').votes,1);
  data=await (await post(env,'/api/admin/reset',{classId:'all',confirm:'RESET'},admin)).json();assert.equal(data.classes.length,19);assert.ok(data.classes.every(c=>c.votes===0&&c.duels===0));
 }finally{env.DB.close();}
});
test('Login attempts are limited',async()=>{const env=await envForTest();try{await setup(env);for(let i=0;i<7;i++)assert.equal((await post(env,'/api/admin/login',{email,password:'wrong'})).status,401);assert.equal((await post(env,'/api/admin/login',{email,password})).status,429);}finally{env.DB.close();}});
function memoryPhotos(){const files=new Map();return {files,async put(key,bytes,options){files.set(key,{body:new Uint8Array(bytes),httpMetadata:options.httpMetadata});},async get(key){return files.get(key)||null;},async delete(key){files.delete(key);}};}
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
async function photo(env,cookie,bytes=png,type='image/png',classId='1ITF04'){const form=new FormData();form.set('classId',classId);form.set('teacherId','1');form.set('photo',new Blob([bytes],{type}),'photo.png');return worker.fetch(new Request(origin+'/api/photos',{method:'POST',headers:{origin,cookie},body:form}),env);}
test('Photos persist, share by teacher name, reject spoofed files and enforce uploader ownership',async()=>{
 const env=await envForTest();env.PHOTOS=memoryPhotos();try{
  const p=await person(env),other=await person(env);
  assert.equal((await photo(env,p.cookie,new TextEncoder().encode('<html>not a photo</html>'))).status,415);
  let response=await photo(env,p.cookie);assert.equal(response.status,200);assert.equal((await response.json()).pending,true);const admin=await setup(env);let state=await (await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie:admin}}),env)).json();const saved={url:state.pendingPhotos[0].url};assert.equal((await worker.fetch(new Request(origin+saved.url),env)).status,404);assert.equal((await post(env,'/api/admin/photos',{key:state.pendingPhotos[0].key,action:'approve'},admin)).status,200);assert.equal(env.PHOTOS.files.size,1);
  response=await worker.fetch(new Request(origin+saved.url),env);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png);
  assert.equal((await photo(env,other.cookie)).status,403);
  assert.equal((await photo(env,p.cookie,new Uint8Array(3*1024*1024+1))).status,413);
  await post(env,'/api/classes',{classId:'1ITF01',teacherNames:['Lena Dillien','Docent twee','Docent drie','Docent vier','Docent vijf','Docent zes','Docent zeven']},p.cookie);
  let data=await (await worker.fetch(new Request(origin+'/api/results?classId=1ITF01',{headers:{cookie:p.cookie}}),env)).json();assert.equal(data.photos[0].url,saved.url);assert.equal(data.photos[0].canReplace,true);
  await post(env,'/api/admin/reset',{classId:'all',confirm:'RESET'},admin);data=await (await worker.fetch(new Request(origin+'/api/results',{headers:{cookie:p.cookie}}),env)).json();assert.equal(data.photos[0].url,saved.url);
  response=await photo(env,other.cookie+'; '+admin);assert.equal(response.status,200);assert.equal(env.PHOTOS.files.size,2);assert.equal((await response.json()).pending,true);state=await (await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie:admin}}),env)).json();const next=state.pendingPhotos[0];assert.notEqual(next.url,saved.url);await post(env,'/api/admin/photos',{key:next.key,action:'reject'},admin);data=await (await worker.fetch(new Request(origin+'/api/results',{headers:{cookie:p.cookie}}),env)).json();assert.equal(data.photos[0].url,saved.url);assert.equal((await worker.fetch(new Request(origin+next.url),env)).status,404);
 }finally{env.DB.close();}
});
