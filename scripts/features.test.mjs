import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/index.js';
import {digest} from '../worker/admin.js';
import {localDatabase} from './local-db.mjs';
const origin='https://ranking.test',worker=createWorker({});
const ranks=tier=>Array.from({length:7},(_,i)=>({teacherId:i+1,tier:tier==='S'&&i>0?'A':tier}));
async function get(env,path,cookie=''){return worker.fetch(new Request(origin+path,{headers:{cookie}}),env);}
async function post(env,path,body,cookie='',extra={}){return worker.fetch(new Request(origin+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json',...extra},body:JSON.stringify(body)}),env);}
test('Favorites update one choice, remain class-scoped, stay blind and reset with the round',async()=>{
 const env={DB:localDatabase(),ADMIN_SETUP_HASH:await digest('test-setup')};try{
  let response=await get(env,'/api/results');const cookie=response.headers.get('set-cookie').split(';')[0],round=(await response.json()).roundId;
  assert.equal((await post(env,'/api/favorites',{classId:'1ITF04',roundId:round,teacherId:8},cookie)).status,400);
  let data=await (await post(env,'/api/favorites',{classId:'1ITF04',roundId:round,teacherId:1},cookie)).json();assert.equal(data.myFavorite,1);assert.deepEqual(data.favoriteResults,[]);
  await post(env,'/api/favorites',{classId:'1ITF04',roundId:round,teacherId:2},cookie);
  data=await (await post(env,'/api/votes',{roundId:round,rankings:ranks('S')},cookie)).json();assert.deepEqual(data.favoriteResults,[{teacher_id:2,count:1}]);
  await post(env,'/api/classes',{classId:'1ITF01',teacherNames:data.teacherNames},cookie);data=await (await get(env,'/api/results?classId=1ITF01',cookie)).json();assert.equal(data.myFavorite,null);
  response=await post(env,'/api/admin/setup',{email:'admin@example.test',password:'test-password-long'},'',{Authorization:'Bearer test-setup'});const admin=response.headers.get('set-cookie').split(';')[0];await post(env,'/api/admin/reset',{classId:'1ITF04',confirm:'RESET'},admin);
  data=await (await get(env,'/api/results',cookie)).json();assert.equal(data.myFavorite,null);assert.equal((await post(env,'/api/favorites',{classId:'1ITF04',roundId:round,teacherId:1},cookie)).status,409);
 }finally{env.DB.close();}
});
test('School years preserve legacy ballots, isolate names and overall rankings, and protect archives',async()=>{
 const env={DB:localDatabase(),ADMIN_SETUP_HASH:await digest('test-setup')};try{
  let response=await get(env,'/api/results');const cookie=response.headers.get('set-cookie').split(';')[0];const first=await response.json();assert.equal(first.year,'2026-2027');
  await post(env,'/api/votes',{roundId:first.roundId,rankings:ranks('S')},cookie);await post(env,'/api/classes',{classId:'1ITF01',teacherNames:first.teacherNames},cookie);await post(env,'/api/votes',{classId:'1ITF01',roundId:first.roundId,rankings:ranks('A')},cookie);
  response=await post(env,'/api/admin/setup',{email:'admin@example.test',password:'test-password-long'},'',{Authorization:'Bearer test-setup'});const admin=response.headers.get('set-cookie').split(';')[0];assert.equal((await post(env,'/api/admin/year',{confirm:'NEW_YEAR'},cookie)).status,401);
  const year=await (await post(env,'/api/admin/year',{confirm:'NEW_YEAR'},admin)).json();assert.equal(year.currentYear,'2027-2028');
  let data=await (await get(env,'/api/results',cookie)).json();assert.equal(data.year,'2027-2028');assert.equal(data.myRanking.length,0);const nextRound=data.roundId;
  data=await (await post(env,'/api/votes',{roundId:nextRound,rankings:ranks('F')},cookie)).json();assert.ok(data.overall.every(t=>t.total===1&&t.counts.F===1));
  data=await (await get(env,'/api/results?year=2026-2027')).json();assert.equal(data.archived,true);assert.equal(data.blind,false);assert.ok(data.teachers.every(t=>t.counts[t.id===1?'S':'A']===1));assert.ok(data.overall.every(t=>t.total===2));
  assert.equal((await post(env,'/api/votes?year=2026-2027',{roundId:first.roundId,rankings:ranks('B')},cookie)).status,409);
  assert.equal((await post(env,'/api/admin/reset?year=2026-2027',{classId:'all',confirm:'RESET'},admin)).status,409);
  data=await (await get(env,'/api/results?classId=1ITF01',cookie)).json();assert.equal(data.configured,false);
  await post(env,'/api/classes',{classId:'1ITF01',teacherNames:['N1','N2','N3','N4','N5','N6','N7']},cookie);data=await (await get(env,'/api/results?classId=1ITF01&year=2026-2027')).json();assert.deepEqual(data.teacherNames,first.teacherNames);
  const state=await (await get(env,'/api/admin/state',admin)).json();assert.equal(state.classes.find(c=>c.classId==='1ITF04').votes,1);assert.equal(state.classes.find(c=>c.classId==='1ITF01').votes,0);
  assert.equal((await get(env,'/api/results?year=arbitrary')).status,400);
 }finally{env.DB.close();}
});
test('Accounts save drafts across sessions without casting votes and keep users/classes/years separate',async()=>{
 const env={DB:localDatabase()};try{
  const email='member@example.test',password='private-test-password';let response=await post(env,'/api/account/register',{email,password});assert.equal(response.status,200);const member=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict.*Secure/);
  assert.equal((await post(env,'/api/account/tierlist',{classId:'1ITF04',ranking:ranks('S')})).status,401);
  assert.equal((await post(env,'/api/account/tierlist',{classId:'1ITF04',ranking:ranks('unranked')},member)).status,200);
  response=await get(env,'/api/results',member);assert.equal((await response.json()).blind,true);
  const [stored]=await env.DB.batch([env.DB.prepare('SELECT password_hash FROM member_accounts')]);assert.notEqual(stored.results[0].password_hash,password);
  await post(env,'/api/account/logout',{},member);assert.equal((await get(env,'/api/account/state',member).then(r=>r.json())).authenticated,false);
  assert.equal((await post(env,'/api/account/login',{email,password:'wrong'})).status,401);
  response=await post(env,'/api/account/login',{email,password});assert.equal(response.status,200);const secondDevice=response.headers.get('set-cookie').split(';')[0];assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',secondDevice)).json()).ranking,ranks('unranked'));
  assert.equal((await (await get(env,'/api/account/tierlist?classId=1ITF01',secondDevice)).json()).ranking,null);
  const other=await post(env,'/api/account/register',{email:'other@example.test',password});assert.equal((await (await get(env,'/api/account/tierlist?classId=1ITF04',other.headers.get('set-cookie').split(';')[0])).json()).ranking,null);
  assert.equal((await post(env,'/api/account/tierlist',{classId:'1ITF04',ranking:ranks('E')},secondDevice)).status,400);
  assert.equal((await post(env,'/api/account/tierlist',{classId:'1ITF04',ranking:ranks('S').map(row=>({...row,tier:'S'}))},secondDevice)).status,400);
  assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',secondDevice)).json()).ranking,ranks('unranked'));
  assert.equal((await post(env,'/api/account/tierlist',{classId:'1ITF04',ranking:ranks('S')},secondDevice,{origin:'https://outside.test'})).status,403);
  await env.DB.batch([env.DB.prepare('INSERT INTO school_years (year) VALUES (?)').bind('2027-2028')]);assert.equal((await (await get(env,'/api/account/tierlist?classId=1ITF04',secondDevice)).json()).ranking,null);assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04&year=2026-2027',secondDevice)).json()).ranking,ranks('unranked'));assert.equal((await post(env,'/api/account/tierlist?year=2026-2027',{classId:'1ITF04',ranking:ranks('S')},secondDevice)).status,409);
  const future=createWorker({},()=>new Date(Date.now()+2592001000));assert.equal((await (await future.fetch(new Request(origin+'/api/account/state',{headers:{cookie:secondDevice}}),env)).json()).authenticated,false);
 }finally{env.DB.close();}
});
