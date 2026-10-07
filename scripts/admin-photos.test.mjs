import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,ACTIVE_ROUND} from '../worker/index.js';
import {digest} from '../worker/admin.js';
import {localDatabase} from './local-db.mjs';
const origin='https://ranking.test';const worker=createWorker({});const setupToken='test-only-setup-token';const email='admin@example.test',password='Only-for-local-tests-2026';
const ranks=tier=>Array.from({length:7},(_,i)=>({teacherId:i+1,tier:tier==='S'&&i>0?'A':tier}));
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
test('Removed photo routes cannot expose files or accept uploads, and existing data remains intact',async()=>{
 const env=await envForTest();
 const key='11111111-1111-4111-8111-111111111111';
 env.PHOTOS={get(){throw new Error('Photo storage must not be accessed');},put(){throw new Error('Photo storage must not be modified');},delete(){throw new Error('Photo storage must not be deleted');}};
 try{
  await env.DB.batch([env.DB.prepare('INSERT INTO teacher_photos (name_key, object_key, owner_hash, uploaded_at) VALUES (?, ?, ?, ?)').bind('lena dillien',key,'old-owner',1)]);
  const p=await person(env),admin=await setup(env);
  for(const cookie of ['',p.cookie,admin]){
   assert.equal((await worker.fetch(new Request(origin+'/photos/'+key,{headers:{cookie}}),env)).status,404);
   assert.equal((await post(env,'/api/photos',{},cookie)).status,404);
   assert.equal((await post(env,'/api/admin/photos',{key,action:'approve'},cookie)).status,404);
  }
  assert.equal(Object.hasOwn(p.data,'photos'),false);
  const state=await (await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie:admin}}),env)).json();
  assert.equal(Object.hasOwn(state,'pendingPhotos'),false);
  const [stored]=await env.DB.batch([env.DB.prepare('SELECT object_key FROM teacher_photos')]);assert.equal(stored.results[0].object_key,key);
  const vote=await post(env,'/api/votes',{rankings:ranks('S'),roundId:p.data.roundId},p.cookie);assert.equal(vote.status,200);
  assert.ok((await vote.json()).teachers.every(t=>t.counts[t.id===1?'S':'A']===1));
 }finally{env.DB.close();}
});
