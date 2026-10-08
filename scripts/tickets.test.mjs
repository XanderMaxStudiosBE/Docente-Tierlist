import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/index.js';
import {digest} from '../worker/admin.js';
import {localDatabase} from './local-db.mjs';
// Give sequential actions distinct timestamps instead of depending on whether
// a fast test happens to create and answer a ticket in the same millisecond.
let ticketTestClock=Date.now();
const origin='https://ranking.test',worker=createWorker({},()=>new Date(++ticketTestClock));
const ranks=tier=>Array.from({length:7},(_,i)=>({teacherId:i+1,tier:tier==='S'&&i>0?'A':tier}));
const cookieOf=response=>response.headers.get('set-cookie').split(';')[0];
const get=(env,path,cookie='',server=worker)=>server.fetch(new Request(origin+path,{headers:{cookie}}),env);
const post=(env,path,body,cookie='',extra={},server=worker)=>server.fetch(new Request(origin+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json',...extra},body:JSON.stringify(body)}),env);
const member=async(env,email='member@example.test')=>cookieOf(await post(env,'/api/account/register',{email,password:'test-only-password-long'}));
const ticketBody=(category='bug')=>({category,classId:'1ITF04',title:'Lokale testmelding',message:'Een beschrijving van een fout op de website.'});
const create=async(env,cookie,category)=>{const response=await post(env,'/api/tickets',ticketBody(category),cookie);assert.equal(response.status,201);return (await response.json()).ticket;};
async function admin(env){env.ADMIN_SETUP_HASH=await digest('test-setup');return cookieOf(await post(env,'/api/admin/setup',{email:'admin@example.test',password:'test-admin-password-long'},'',{Authorization:'Bearer test-setup'}));}

test('Teacher complaints stay private, require a name and appear in the separate admin filter',async()=>{
 const env={DB:localDatabase()};try{
  const owner=await member(env),other=await member(env,'other@example.test'),adminCookie=await admin(env);
  const general=await create(env,owner,'complaint');assert.equal(general.kind,'general');assert.equal(general.teacherName,null);
  const body={...ticketBody('complaint'),kind:'teacher',teacherName:'  Docent   Test  ',title:'Verzoek over mijn vermelding'};
  assert.equal((await post(env,'/api/tickets',body)).status,401);
  for(const change of [{kind:'admin'},{teacherName:''},{teacherName:'x'},{teacherName:23},{teacherName:'x'.repeat(101)},{category:'bug'},{kind:'general'},{accountId:'someone-else'}])assert.equal((await post(env,'/api/tickets',{...body,...change},owner)).status,400);
  const response=await post(env,'/api/tickets',body,owner);assert.equal(response.status,201);let teacher=(await response.json()).ticket;assert.equal(teacher.kind,'teacher');assert.equal(teacher.teacherName,'Docent Test');assert.equal(teacher.category,'complaint');
  assert.equal((await get(env,'/api/tickets/'+teacher.id,other)).status,404);assert.equal((await post(env,'/api/tickets/'+teacher.id,{revision:0,message:'Not mine'},other)).status,404);
  assert.deepEqual((await (await get(env,'/api/tickets?kind=teacher',other)).json()).tickets,[]);
  const mine=await (await get(env,'/api/tickets?kind=teacher',owner)).json();assert.deepEqual(mine.tickets.map(t=>t.id),[teacher.id]);
  const standard=await (await get(env,'/api/tickets?kind=general',owner)).json();assert.deepEqual(standard.tickets.map(t=>t.id),[general.id]);
  assert.equal((await get(env,'/api/tickets?kind=unknown',owner)).status,400);
  const admins=await (await get(env,'/api/admin/tickets?kind=teacher',adminCookie)).json();assert.deepEqual(admins.tickets.map(t=>t.id),[teacher.id]);assert.equal('account_id' in admins.tickets[0],false);
  teacher=(await (await post(env,'/api/admin/tickets/'+teacher.id,{revision:0,status:'in_progress',message:'We bekijken je verzoek.'},adminCookie)).json()).ticket;
  assert.equal(teacher.kind,'teacher');assert.equal(teacher.status,'in_progress');assert.equal(teacher.messages.at(-1).author,'admin');
  assert.equal((await (await get(env,'/api/tickets/'+teacher.id,owner)).json()).ticket.messages.length,2);
  assert.equal((await post(env,'/api/tickets/'+teacher.id,{revision:1,message:'Dank je.',kind:'general'},owner)).status,409);
 }finally{env.DB.close();}
});

test('Kind filters paginate independently and preserve legacy-style general tickets',async()=>{
 const env={DB:localDatabase()};try{
  const owner=await member(env),teacherCookie=await member(env,'teacher@example.test'),general=await create(env,owner);
  const [accounts]=await env.DB.batch([env.DB.prepare('SELECT id FROM member_accounts WHERE email = ?').bind('teacher@example.test')]);
  for(let i=0;i<27;i++)await env.DB.batch([env.DB.prepare('INSERT INTO support_tickets (id,account_id,category,kind,teacher_name,title,class_id,school_year,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),accounts.results[0].id,'complaint','teacher','Docent Test','Klacht '+i,'1ITF04','2026-2027',Date.now()+i,Date.now()+i)]);
  const first=await (await get(env,'/api/tickets?kind=teacher',teacherCookie)).json();assert.equal(first.tickets.length,25);assert.ok(first.nextCursor);
  const next=await (await get(env,'/api/tickets?kind=teacher&cursor='+first.nextCursor,teacherCookie)).json();assert.equal(next.tickets.length,2);assert.equal(next.nextCursor,null);
  assert.equal(new Set([...first.tickets,...next.tickets].map(t=>t.id)).size,27);
  assert.deepEqual((await (await get(env,'/api/tickets?kind=teacher&cursor='+first.nextCursor,owner)).json()).tickets,[]);
  assert.deepEqual((await (await get(env,'/api/tickets?kind=general',owner)).json()).tickets.map(t=>t.id),[general.id]);
 }finally{env.DB.close();}
});

test('Tickets require an account and never expose another member’s conversation or identity',async()=>{
 const env={DB:localDatabase()};try{
  assert.equal((await get(env,'/api/tickets')).status,401);assert.equal((await post(env,'/api/tickets',ticketBody())).status,401);
  const owner=await member(env),other=await member(env,'other@example.test'),ticket=await create(env,owner);
  assert.equal((await get(env,'/api/tickets/'+ticket.id,other)).status,404);
  assert.equal((await post(env,'/api/tickets/'+ticket.id,{message:'Private reply',revision:0},other)).status,404);
  assert.deepEqual((await (await get(env,'/api/tickets',other)).json()).tickets,[]);
  const detail=await (await get(env,'/api/tickets/'+ticket.id,owner)).json();assert.equal(detail.ticket.messages.length,1);
  assert.equal('account_id' in detail.ticket,false);assert.equal('email' in detail.ticket,false);assert.equal('last_action' in detail.ticket,false);
  assert.match((await get(env,'/api/tickets',owner)).headers.get('cache-control'),/no-store/);
  await post(env,'/api/account/logout',{},owner);assert.equal((await get(env,'/api/tickets/'+ticket.id,owner)).status,401);
 }finally{env.DB.close();}
});

test('Ticket validation, same-origin checks and account limits protect all three categories',async()=>{
 const env={DB:localDatabase()};try{
  const owner=await member(env);
  assert.equal((await post(env,'/api/tickets',ticketBody(),owner,{origin:'https://outside.test'})).status,403);
  assert.equal((await post(env,'/api/tickets',ticketBody(),owner,{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await post(env,'/api/tickets',ticketBody(),owner,{'content-type':'text/plain'})).status,415);
  for(const change of [{category:'public'},{classId:'UNKNOWN'},{title:'x'},{title:'x'.repeat(101)},{message:'short'},{message:'x'.repeat(4001)},{accountId:'someone-else'},{status:'closed'}])assert.equal((await post(env,'/api/tickets',{...ticketBody(),...change},owner)).status,400);
  for(const category of ['suggestion','complaint','bug'])assert.equal((await create(env,owner,category)).category,category);
  await create(env,owner);await create(env,owner);assert.equal((await post(env,'/api/tickets',ticketBody(),owner)).status,429);
  assert.equal((await get(env,'/api/tickets?status=unknown',owner)).status,400);assert.equal((await get(env,'/api/tickets?cursor=invalid',owner)).status,400);
  const future=createWorker({},()=>new Date(Date.now()+2592001000));assert.equal((await get(env,'/api/tickets',owner,future)).status,401);
 }finally{env.DB.close();}
});

test('Admins answer and close or reopen tickets; revisions reject duplicate and stale replies',async()=>{
 const env={DB:localDatabase()};try{
  const owner=await member(env),adminCookie=await admin(env),first=await create(env,owner,'suggestion'),path='/api/tickets/'+first.id,adminPath='/api/admin/tickets/'+first.id;
  assert.equal((await get(env,'/api/admin/tickets',owner)).status,401);assert.equal((await post(env,adminPath,{status:'closed',revision:0},owner)).status,401);
  let response=await post(env,adminPath,{message:'We bekijken je idee.',status:'in_progress',revision:0},adminCookie);assert.equal(response.status,200);
  let ticket=(await response.json()).ticket;assert.equal(ticket.status,'in_progress');assert.equal(ticket.messages.at(-1).author,'admin');
  assert.equal((await post(env,path,{message:'Stale reply',revision:0},owner)).status,409);
  response=await post(env,path,{message:'Bedankt voor het antwoord.',revision:1},owner);ticket=(await response.json()).ticket;assert.equal(ticket.revision,2);assert.equal(ticket.messages.length,3);
  assert.equal((await post(env,path,{message:'Bedankt voor het antwoord.',revision:1},owner)).status,409);
  response=await post(env,adminPath,{status:'closed',revision:2},adminCookie);ticket=(await response.json()).ticket;assert.equal(ticket.messages.length,3);assert.equal(ticket.status,'closed');
  assert.equal((await post(env,path,{message:'Nog een vraag',revision:3},owner)).status,409);
  response=await post(env,adminPath,{status:'open',revision:3},adminCookie);assert.equal(response.status,200);
  assert.equal((await post(env,path,{message:'Nog een vraag',revision:4},owner)).status,200);
  const closedList=await (await get(env,'/api/admin/tickets?status=closed',adminCookie)).json();assert.equal(closedList.tickets.length,0);
  assert.equal((await post(env,adminPath,{message:'Bad status',status:'public',revision:5},adminCookie)).status,400);
  assert.equal((await post(env,adminPath,{status:'open',revision:5},adminCookie,{origin:'https://outside.test'})).status,403);
  for(let i=0;i<18;i++)assert.equal((await post(env,path,{message:'Extra testantwoord '+i,revision:5+i},owner)).status,200);
  assert.equal((await post(env,path,{message:'Te veel antwoorden',revision:23},owner)).status,429);
  assert.equal((await (await get(env,path,owner)).json()).ticket.messages.length,22);
 }finally{env.DB.close();}
});

test('Ticket pagination stays private and tickets survive year changes and ranking resets',async()=>{
 const env={DB:localDatabase()};try{
  const owner=await member(env),other=await member(env,'other@example.test'),adminCookie=await admin(env),first=await create(env,owner);
  const [accounts]=await env.DB.batch([env.DB.prepare('SELECT id FROM member_accounts WHERE email = ?').bind('member@example.test')]);
  for(let i=0;i<27;i++)await env.DB.batch([env.DB.prepare('INSERT INTO support_tickets (id, account_id, category, title, class_id, school_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),accounts.results[0].id,'bug','Ticket '+i,'1ITF04','2026-2027',Date.now()+i,Date.now()+i)]);
  const page1=await (await get(env,'/api/tickets',owner)).json();assert.equal(page1.tickets.length,25);assert.ok(page1.nextCursor);
  const page2=await (await get(env,'/api/tickets?cursor='+page1.nextCursor,owner)).json();assert.equal(page2.tickets.length,3);assert.equal(page2.nextCursor,null);
  assert.equal(new Set([...page1.tickets,...page2.tickets].map(t=>t.id)).size,28);
  assert.deepEqual((await (await get(env,'/api/tickets?cursor='+page1.nextCursor,other)).json()).tickets,[]);
  await post(env,'/api/admin/reset',{classId:'1ITF04',confirm:'RESET'},adminCookie);await post(env,'/api/admin/year',{confirm:'NEW_YEAR'},adminCookie);
  const after=await (await get(env,'/api/tickets/'+first.id,owner)).json();assert.equal(after.ticket.schoolYear,'2026-2027');assert.equal(after.ticket.messages.length,1);
  assert.equal((await post(env,'/api/tickets?year=2026-2027',ticketBody(),owner)).status,201);
  assert.equal((await (await get(env,'/api/admin/tickets',adminCookie)).json()).tickets.length,25);
 }finally{env.DB.close();}
});

test('Submitting a member ranking automatically saves the correct account, class, year and names',async()=>{
 const env={DB:localDatabase()};try{
  const account=await member(env);let response=await get(env,'/api/results',account);const voter=cookieOf(response),initial=await response.json(),cookie=account+'; '+voter;
  response=await post(env,'/api/votes',{roundId:initial.roundId,rankings:ranks('S')},cookie);assert.equal(response.status,200);assert.equal((await response.json()).accountSaved,true);
  assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',account)).json()).ranking,ranks('S'));
  await post(env,'/api/votes',{roundId:initial.roundId,rankings:ranks('B')},cookie);assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',account)).json()).ranking,ranks('B'));
  let [saved]=await env.DB.batch([env.DB.prepare('SELECT * FROM saved_tierlists')]);assert.equal(saved.results.length,1);assert.deepEqual(JSON.parse(saved.results[0].teacher_names),initial.teacherNames);
  await post(env,'/api/classes',{classId:'1ITF01',teacherNames:['Eerste docent','Tweede docent','Derde docent']},cookie);
  const smaller=await (await get(env,'/api/results?classId=1ITF01',cookie)).json(),smallRanking=ranks('S').slice(0,3);
  response=await post(env,'/api/votes',{classId:'1ITF01',roundId:smaller.roundId,rankings:smallRanking},cookie);assert.equal((await response.json()).accountSaved,true);
  assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF01',account)).json()).ranking,smallRanking);
  assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',account)).json()).ranking,ranks('B'));
  const other=await member(env,'other@example.test');assert.equal((await (await get(env,'/api/account/tierlist?classId=1ITF04',other)).json()).ranking,null);
  assert.equal((await post(env,'/api/votes',{roundId:initial.roundId,rankings:ranks('S').map(r=>({...r,tier:'S'}))},cookie)).status,400);
  assert.equal((await post(env,'/api/votes',{roundId:'stale',rankings:ranks('F')},cookie)).status,409);
  assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',account)).json()).ranking,ranks('B'));
  await env.DB.batch([env.DB.prepare('INSERT INTO school_years (year) VALUES (?)').bind('2027-2028')]);const next=await (await get(env,'/api/results',cookie)).json();
  await post(env,'/api/votes',{roundId:next.roundId,rankings:ranks('F')},cookie);assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',account)).json()).ranking,ranks('F'));
  assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04&year=2026-2027',account)).json()).ranking,ranks('B'));
  await post(env,'/api/account/logout',{},account);response=await post(env,'/api/votes',{roundId:next.roundId,rankings:ranks('C')},cookie);assert.equal((await response.json()).accountSaved,false);
  [saved]=await env.DB.batch([env.DB.prepare('SELECT ranking FROM saved_tierlists WHERE school_year = ?').bind('2027-2028')]);assert.deepEqual(JSON.parse(saved.results[0].ranking),ranks('F'));
 }finally{env.DB.close();}
});

test('Automatic account save and vote storage roll back together when the save fails',async()=>{
 const DB=localDatabase(),env={DB};try{
  const account=await member(env),response=await get(env,'/api/results',account),initial=await response.json(),cookie=account+'; '+cookieOf(response);
  await post(env,'/api/votes',{roundId:initial.roundId,rankings:ranks('B')},cookie);
  let failSave=false;
  env.DB={prepare(sql){if(failSave&&sql.startsWith('INSERT INTO saved_tierlists'))return {bind:()=>DB.prepare('INSERT INTO ticket_messages (id) VALUES (?)').bind('invalid-row')};return DB.prepare(sql);},batch:statements=>DB.batch(statements)};
  failSave=true;const originalError=console.error;let failed;
  try{console.error=()=>{};failed=await post(env,'/api/votes',{roundId:initial.roundId,rankings:ranks('F')},cookie);}finally{console.error=originalError;}
  assert.equal(failed.status,503);assert.deepEqual((await (await get(env,'/api/results',cookie)).json()).myRanking,ranks('B'));
  assert.deepEqual((await (await get(env,'/api/account/tierlist?classId=1ITF04',account)).json()).ranking,ranks('B'));
  const [week]=await DB.batch([DB.prepare('SELECT tier FROM weekly_votes')]);assert.ok(week.results.every(r=>r.tier==='B'));
 }finally{DB.close();}
});
