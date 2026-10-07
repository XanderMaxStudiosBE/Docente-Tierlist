import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/index.js';
import {digest} from '../worker/admin.js';
import {localDatabase} from './local-db.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
const origin='https://ranking.test',worker=createWorker({});
const names=count=>Array.from({length:count},(_,i)=>'Testdocent '+(i+1));
const ranks=count=>Array.from({length:count},(_,i)=>({teacherId:i+1,tier:i===0?'S':'A'}));
async function get(env,path,cookie=''){return worker.fetch(new Request(origin+path,{headers:{cookie}}),env);}
async function post(env,path,body,cookie=''){return worker.fetch(new Request(origin+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json',...(path==='/api/admin/setup'?{Authorization:'Bearer local-test-setup'}:{})},body:JSON.stringify(body)}),env);}
async function visitor(env,classId){const response=await get(env,'/api/results?classId='+classId);return {cookie:response.headers.get('set-cookie').split(';')[0],data:await response.json()};}
test('The teacher-count migration preserves existing ballots, duels, favorites and saved drafts',()=>{
 const db=new DatabaseSync(':memory:');try{
  const folder=new URL('../drizzle/',import.meta.url);for(const file of readdirSync(folder).filter(file=>file.endsWith('.sql')&&!file.startsWith('0007')).sort())db.exec(readFileSync(new URL(file,folder),'utf8'));
  db.exec("INSERT INTO votes (voter_id,teacher_id,tier,round_id,class_id) VALUES ('old',7,'E','old-round','1ITF04'); INSERT INTO weekly_votes (voter_id,teacher_id,tier,round_id,week,class_id) VALUES ('old',7,'A','old-round','2026-10-05','1ITF04'); INSERT INTO duels (voter_id,round_id,left_id,right_id,winner_id,class_id) VALUES ('old','old-round',6,7,7,'1ITF04'); INSERT INTO favorites (class_id,round_id,voter_id,teacher_id) VALUES ('1ITF04','old-round','old',7); INSERT INTO saved_tierlists (account_id,school_year,class_id,ranking) VALUES ('old','2026-2027','1ITF04','[]')");
  db.exec(readFileSync(new URL('0007_sturdy_gamma_corps.sql',folder),'utf8'));
  for(const table of ['votes','weekly_votes','duels','favorites','saved_tierlists'])assert.equal(db.prepare('SELECT COUNT(*) AS count FROM '+table).get().count,1);
  assert.equal(db.prepare('SELECT tier FROM votes').get().tier,'E');assert.equal(db.prepare('SELECT teacher_names FROM saved_tierlists').get().teacher_names,null);
  db.exec("INSERT INTO votes (voter_id,teacher_id,tier,round_id,class_id) VALUES ('new',30,'A','new-round','1ITF04')");
 }finally{db.close();}
});
test('Classes with 1, 3, 8 and 30 teachers validate exact ballots, favorites and duel boundaries',async()=>{
 const env={DB:localDatabase()};try{
  for(const [classId,count] of [['1ITF01',1],['1ITF02',3],['1ITF03',8],['1ITF05',30]]){
   const person=await visitor(env,classId),body={classId,teacherNames:names(count)};
   let response=await post(env,'/api/classes',body,person.cookie);assert.equal(response.status,200);let data=await response.json();assert.equal(data.teacherNames.length,count);assert.equal(data.blind,true);
   assert.equal((await post(env,'/api/votes',{classId,roundId:data.roundId,rankings:ranks(count+1)},person.cookie)).status,400);
   response=await post(env,'/api/votes',{classId,roundId:data.roundId,rankings:ranks(count)},person.cookie);assert.equal(response.status,200);data=await response.json();assert.equal(data.blind,false);assert.equal(data.teachers.length,count);assert.equal(data.votedThisWeek,true);assert.ok(data.teachers.every(t=>t.total===1));
   assert.equal((await post(env,'/api/favorites',{classId,roundId:data.roundId,teacherId:count},person.cookie)).status,200);
   assert.equal((await post(env,'/api/favorites',{classId,roundId:data.roundId,teacherId:count+1},person.cookie)).status,400);
   assert.equal((await post(env,'/api/duels',{classId,roundId:data.roundId,leftId:1,rightId:count+1,winnerId:1},person.cookie)).status,400);
   if(count>1)assert.equal((await post(env,'/api/duels',{classId,roundId:data.roundId,leftId:1,rightId:count,winnerId:count},person.cookie)).status,200);
  }
  const person=await visitor(env,'1ACS1');for(const teacherNames of [[],names(31),['Same',' same '],[' '.repeat(5)],['x'.repeat(51)]])assert.equal((await post(env,'/api/classes',{classId:'1ACS1',teacherNames},person.cookie)).status,400);
 }finally{env.DB.close();}
});
test('Admin teacher edits start a class round, preserve old votes and drafts, and reject stale or archived edits',async()=>{
 const env={DB:localDatabase(),ADMIN_SETUP_HASH:await digest('local-test-setup')};try{
  const person=await visitor(env,'1ITF04'),old=person.data;
  await post(env,'/api/votes',{classId:'1ITF04',roundId:old.roundId,rankings:ranks(7)},person.cookie);
  let response=await post(env,'/api/account/register',{email:'count-test@example.test',password:'local-count-password'});const member=response.headers.get('set-cookie').split(';')[0];
  await post(env,'/api/account/tierlist',{classId:'1ITF04',ranking:ranks(7)},member);
  // Simulate a pre-migration draft without a teacher snapshot.
  await env.DB.batch([env.DB.prepare('UPDATE saved_tierlists SET teacher_names = NULL')]);
  const update={classId:'1ITF04',roundId:old.roundId,teacherNames:names(8),confirm:'UPDATE_TEACHERS'};
  assert.equal((await post(env,'/api/admin/teachers',update,person.cookie)).status,401);
  response=await post(env,'/api/admin/setup',{email:'admin@example.test',password:'local-admin-password'});const admin=response.headers.get('set-cookie').split(';')[0];
  assert.equal((await post(env,'/api/admin/teachers',{...update,confirm:'NO'},admin)).status,400);
  response=await post(env,'/api/admin/teachers',update,admin);assert.equal(response.status,200);const classes=(await response.json()).classes;assert.equal(classes.find(c=>c.classId==='1ITF04').teacherCount,8);
  const current=await (await get(env,'/api/results',person.cookie)).json();assert.notEqual(current.roundId,old.roundId);assert.equal(current.blind,true);assert.deepEqual(current.myRanking,[]);
  const [oldVotes,oldDraft]=await env.DB.batch([env.DB.prepare('SELECT COUNT(*) AS count FROM votes WHERE round_id = ?').bind(old.roundId),env.DB.prepare('SELECT ranking, teacher_names FROM saved_tierlists')]);assert.equal(oldVotes.results[0].count,7);assert.deepEqual(JSON.parse(oldDraft.results[0].teacher_names),old.teacherNames);assert.deepEqual(JSON.parse(oldDraft.results[0].ranking),ranks(7));
  const saved=await (await get(env,'/api/account/tierlist?classId=1ITF04',member)).json();assert.equal(saved.outdated,true);assert.equal(saved.ranking,null);
  assert.equal((await post(env,'/api/admin/teachers',update,admin)).status,409);
  assert.equal((await post(env,'/api/votes',{classId:'1ITF04',roundId:old.roundId,rankings:ranks(8)},person.cookie)).status,409);
  assert.equal((await post(env,'/api/account/tierlist',{classId:'1ITF04',ranking:ranks(7)},member)).status,400);
  assert.equal((await post(env,'/api/account/tierlist',{classId:'1ITF04',ranking:ranks(8)},member)).status,200);
  assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',member)).json()).ranking,ranks(8));
  await post(env,'/api/votes',{classId:'1ITF04',roundId:current.roundId,rankings:ranks(8)},person.cookie);
  response=await post(env,'/api/admin/teachers',{...update,roundId:current.roundId},admin);assert.equal((await response.json()).updated,false);
  assert.equal((await (await get(env,'/api/results',person.cookie)).json()).blind,false);
  await post(env,'/api/admin/year',{confirm:'NEW_YEAR'},admin);
  assert.equal((await post(env,'/api/admin/teachers?year=2026-2027',{...update,roundId:current.roundId},admin)).status,409);
  const next=await (await get(env,'/api/results',person.cookie)).json();assert.equal(next.teacherNames.length,7);
  response=await post(env,'/api/admin/teachers',{...update,roundId:next.roundId,teacherNames:names(3)},admin);assert.equal(response.status,200);
  assert.equal((await (await get(env,'/api/results',person.cookie)).json()).teacherNames.length,3);
  assert.equal((await (await get(env,'/api/results?year=2026-2027',person.cookie)).json()).teacherNames.length,8);
 }finally{env.DB.close();}
});
