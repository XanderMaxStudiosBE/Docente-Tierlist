import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/index.js';
import {localDatabase} from './local-db.mjs';
const membershipOrigin='https://ranking.test',membershipWorker=createWorker({});
const sampleRanking=tier=>Array.from({length:7},(_,i)=>({teacherId:i+1,tier:tier==='S'&&i>0?'A':tier}));
const requestGet=(env,path,cookie='')=>membershipWorker.fetch(new Request(membershipOrigin+path,{headers:{cookie}}),env);
const requestPost=(env,path,body,cookie='',origin=membershipOrigin)=>membershipWorker.fetch(new Request(membershipOrigin+path,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)}),env);
async function guest(env,account=''){const response=await requestGet(env,'/api/membership',account);return {cookie:[account,response.headers.get('set-cookie')?.split(';')[0]].filter(Boolean).join('; '),state:await response.json()};}
async function choose(env,cookie,classId,confirm=false,snapshot=null,suffix=''){const state=snapshot||await (await requestGet(env,'/api/membership'+suffix,cookie)).json();return requestPost(env,'/api/membership'+suffix,{classId,confirm,revision:state.revision,browserRevision:state.browserRevision},cookie);}
async function configure(env,cookie,classId,suffix=''){const defaults=await (await requestGet(env,'/api/results'+suffix,cookie)).json();await requestPost(env,'/api/classes'+suffix,{classId,teacherNames:defaults.teacherNames},cookie);return (await requestGet(env,'/api/results'+(suffix?suffix+'&':'?')+'classId='+classId,cookie)).json();}
async function ballot(env,cookie,classId,tier='S',suffix=''){const data=await (await requestGet(env,'/api/results'+(suffix?suffix+'&':'?')+'classId='+classId,cookie)).json();return requestPost(env,'/api/votes'+suffix,{classId,roundId:data.roundId,rankings:sampleRanking(tier)},cookie);}
async function rows(env,table){return (await env.DB.batch([env.DB.prepare('SELECT * FROM '+table)]) )[0].results;}

test('Guests keep one class without an account, can read other classes, and cannot vote there by API',async()=>{
  const env={DB:localDatabase()};try{
    const a=await guest(env);assert.equal(a.state.authenticated,false);assert.equal(a.state.classId,null);
    const selected=await choose(env,a.cookie,'1itf4');assert.equal(selected.status,200);
    assert.equal((await (await requestGet(env,'/api/membership',a.cookie)).json()).classId,'1ITF04');
    assert.equal((await ballot(env,a.cookie,'1ITF04')).status,200);
    await configure(env,a.cookie,'1ITF01');const b=await guest(env);await choose(env,b.cookie,'1ITF01');await ballot(env,b.cookie,'1ITF01','D');
    const other=await (await requestGet(env,'/api/results?classId=1ITF01',a.cookie)).json();assert.equal(other.blind,false);assert.equal(other.readOnly,true);assert.equal(other.canVote,false);assert.ok(other.teachers.every(t=>t.total===1&&t.counts.D===1));assert.deepEqual(other.myRanking,[]);
    assert.equal((await ballot(env,a.cookie,'1ITF01','F')).status,403);
    for(const [path,body] of [['duels',{leftId:1,rightId:2,winnerId:2}],['favorites',{teacherId:1}]])assert.equal((await requestPost(env,'/api/'+path,{classId:'1ITF01',roundId:other.roundId,...body},a.cookie)).status,403);
    assert.equal((await rows(env,'member_accounts')).length,0);assert.equal((await rows(env,'votes')).length,14);
  }finally{env.DB.close();}
});

test('A confirmed class switch atomically removes only this visitor’s old votes, weekly choices, duels and favorite',async()=>{
  const env={DB:localDatabase()};try{
    const a=await guest(env),b=await guest(env);await choose(env,a.cookie,'1ITF04');await choose(env,b.cookie,'1ITF04');
    await ballot(env,a.cookie,'1ITF04','S');await ballot(env,b.cookie,'1ITF04','F');
    const old=await (await requestGet(env,'/api/results',a.cookie)).json();
    await requestPost(env,'/api/duels',{classId:'1ITF04',roundId:old.roundId,leftId:1,rightId:2,winnerId:1},a.cookie);await requestPost(env,'/api/favorites',{classId:'1ITF04',roundId:old.roundId,teacherId:1},a.cookie);
    await configure(env,a.cookie,'1ITF01');const before=await (await requestGet(env,'/api/membership',a.cookie)).json();
    assert.equal((await choose(env,a.cookie,'1ITF01',false,before)).status,409);assert.equal((await rows(env,'votes')).length,14);
    assert.equal((await requestPost(env,'/api/membership',{classId:'1ITF01',confirm:true,revision:before.revision,browserRevision:before.browserRevision},a.cookie,'https://outside.test')).status,403);
    assert.equal((await choose(env,a.cookie,'wrong',true,before)).status,400);
    assert.equal((await choose(env,a.cookie,'1ITF01',true,before)).status,200);
    assert.equal((await choose(env,a.cookie,'1ITF05',true,before)).status,409);
    assert.equal((await ballot(env,a.cookie,'1ITF04')).status,403);
    assert.equal((await rows(env,'votes')).length,7);assert.equal((await rows(env,'weekly_votes')).length,7);assert.equal((await rows(env,'duels')).length,0);assert.equal((await rows(env,'favorites')).length,0);
    const left=await (await requestGet(env,'/api/results',a.cookie)).json();assert.equal(left.readOnly,true);assert.ok(left.teachers.every(t=>t.total===1&&t.counts.F===1));assert.equal(left.weeks[0].voters,1);
    assert.equal((await ballot(env,a.cookie,'1ITF01','A')).status,200);assert.equal((await rows(env,'votes')).length,14);
  }finally{env.DB.close();}
});

test('Optional accounts retain their class across devices and switching removes all linked device votes while preserving saved designs',async()=>{
  const env={DB:localDatabase()};try{
    const first=await guest(env);await choose(env,first.cookie,'1ITF04');await ballot(env,first.cookie,'1ITF04');
    const registered=await requestPost(env,'/api/account/register',{email:'membership@example.test',password:'membership-test-password'});const account=registered.headers.get('set-cookie').split(';')[0],device=account+'; '+first.cookie;
    assert.equal((await choose(env,device,'1ITF04')).status,200);await ballot(env,device,'1ITF04','B');
    const second=await guest(env,account);assert.equal(second.state.classId,'1ITF04');await choose(env,second.cookie,'1ITF04');await ballot(env,second.cookie,'1ITF04','A');
    await configure(env,device,'1ITF01');assert.equal((await ballot(env,second.cookie,'1ITF01')).status,403);
    assert.equal((await choose(env,second.cookie,'1ITF01',true)).status,200);assert.equal((await rows(env,'votes')).length,0);assert.equal((await rows(env,'weekly_votes')).length,0);
    const fresh=await guest(env,account);assert.equal(fresh.state.classId,'1ITF01');
    assert.equal((await ballot(env,device,'1ITF04')).status,403);
    assert.equal((await choose(env,device,'1ITF01',true)).status,200);assert.equal((await ballot(env,device,'1ITF01','D')).status,200);
    const saved=await (await requestGet(env,'/api/account/tierlist?classId=1ITF04',account)).json();assert.deepEqual(saved.ranking,sampleRanking('A'));
    await requestPost(env,'/api/account/logout',{},account);const after=await (await requestGet(env,'/api/membership',first.cookie)).json();assert.equal(after.classId,'1ITF01');assert.equal(after.authenticated,false);
  }finally{env.DB.close();}
});

test('Class switches preserve archived school years and delete only the selected year’s prefixed vote rows',async()=>{
  const env={DB:localDatabase()};try{
    const a=await guest(env);await choose(env,a.cookie,'1ITF04');await ballot(env,a.cookie,'1ITF04');
    await env.DB.batch([env.DB.prepare('INSERT INTO school_years (year) VALUES (?)').bind('2027-2028')]);
    const suffix='?year=2027-2028';await choose(env,a.cookie,'1ITF04',false,null,suffix);await ballot(env,a.cookie,'1ITF04','F',suffix);await configure(env,a.cookie,'1ITF01',suffix);
    assert.equal((await choose(env,a.cookie,'1ITF01',true,null,suffix)).status,200);
    assert.ok((await rows(env,'votes')).every(r=>r.class_id==='1ITF04'&&r.tier===(r.teacher_id===1?'S':'A')));assert.equal((await rows(env,'votes')).length,7);
    assert.equal((await choose(env,a.cookie,'1ITF01',true,null,'?year=2026-2027')).status,409);
    assert.equal((await ballot(env,a.cookie,'1ITF01','D',suffix)).status,200);assert.equal((await rows(env,'votes')).filter(r=>r.class_id==='2027-2028:1ITF01').length,7);
  }finally{env.DB.close();}
});

test('A vote already in flight cannot reinsert old-class votes after a concurrent switch',async()=>{
  const DB=localDatabase(),env={DB};try{
    const a=await guest(env);await choose(env,a.cookie,'1ITF04');await ballot(env,a.cookie,'1ITF04');await configure(env,a.cookie,'1ITF01');
    let intercept=true;const concurrent={DB};
    env.DB={prepare(sql){const statement=DB.prepare(sql),bind=statement.bind;statement.bind=(...params)=>{const bound=bind(...params);bound.membershipSql=sql;return bound;};return statement;},async batch(statements){if(intercept&&statements.some(s=>s.membershipSql?.startsWith('INSERT INTO votes'))){intercept=false;assert.equal((await choose(concurrent,a.cookie,'1ITF01',true)).status,200);}return DB.batch(statements);}};
    assert.equal((await ballot(env,a.cookie,'1ITF04','F')).status,409);assert.equal((await rows({DB},'votes')).length,0);assert.equal((await rows({DB},'weekly_votes')).length,0);
    assert.equal((await (await requestGet({DB},'/api/membership',a.cookie)).json()).classId,'1ITF01');
  }finally{DB.close();}
});

test('A failed cleanup rolls back the class choice and retains the original ballot',async()=>{
  const DB=localDatabase(),env={DB};try{
    const a=await guest(env);await choose(env,a.cookie,'1ITF04');await ballot(env,a.cookie,'1ITF04');await configure(env,a.cookie,'1ITF01');
    const original=await (await requestGet(env,'/api/membership',a.cookie)).json();
    env.DB={prepare(sql){if(sql.startsWith('DELETE FROM duels'))return {bind:()=>DB.prepare('INSERT INTO ticket_messages (id) VALUES (?)').bind('invalid-cleanup')};return DB.prepare(sql);},batch:statements=>DB.batch(statements)};
    const log=console.error;try{console.error=()=>{};assert.equal((await choose(env,a.cookie,'1ITF01',true,original)).status,503);}finally{console.error=log;}
    assert.deepEqual(await (await requestGet({DB},'/api/membership',a.cookie)).json(),original);assert.equal((await rows({DB},'votes')).length,7);assert.equal((await rows({DB},'weekly_votes')).length,7);
  }finally{DB.close();}
});
