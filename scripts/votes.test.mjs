import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,ACTIVE_ROUND,weekStart,disagreement} from '../worker/index.js';
import {createHash} from 'node:crypto';
import {localDatabase} from './local-db.mjs';
const origin='https://ranking.test';
const worker=createWorker({'/index.html':'<h1>Docente Ranking</h1>'});
async function visitor(env){const response=await worker.fetch(new Request(origin+'/api/results'),env);assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],data:await response.json()};}
function ranks(tier='S'){return Array.from({length:7},(_,i)=>({teacherId:i+1,tier:tier==='S'&&i>0?'A':tier}));}
async function submit(env,cookie,rankings,requestOrigin=origin,roundId=ACTIVE_ROUND){return worker.fetch(new Request(origin+'/api/votes',{method:'POST',headers:{cookie,origin:requestOrigin,'content-type':'application/json'},body:JSON.stringify({rankings,roundId})}),env);}
test('Votes from separate visitors aggregate, updates replace previous votes, and failed input is atomic',async()=>{
  const env={DB:localDatabase()};
  try{
    const first=await visitor(env);assert.equal(first.data.blind,true);assert.equal(first.data.teachers,null);
    let response=await submit(env,first.cookie,ranks());assert.equal(response.status,200);
    let data=await response.json();assert.ok(data.teachers.every(t=>t.total===1&&t.counts[t.id===1?'S':'A']===1));
    response=await submit(env,first.cookie,ranks());assert.equal(response.status,200);assert.ok((await response.json()).teachers.every(t=>t.total===1));
    const second=await visitor(env);response=await submit(env,second.cookie,ranks('A'));data=await response.json();assert.ok(data.teachers.every(t=>t.total===2&&(t.id===1?t.counts.S===1&&t.counts.A===1:t.counts.S===0&&t.counts.A===2)));
    const third=await visitor(env);response=await submit(env,third.cookie,ranks('S'));data=await response.json();assert.ok(Math.abs(data.teachers[0].counts.S/data.teachers[0].total*100-200/3)<1e-10);
    response=await submit(env,first.cookie,ranks('F'));data=await response.json();assert.ok(data.teachers.every(t=>t.total===3&&t.counts.F===1&&(t.id===1?t.counts.S===1&&t.counts.A===1:t.counts.S===0&&t.counts.A===2)));
    const bad=ranks();bad[6].teacherId=1;response=await submit(env,first.cookie,bad);assert.equal(response.status,400);
    response=await submit(env,first.cookie,ranks().slice(0,6));assert.equal(response.status,400);
    response=await submit(env,first.cookie,ranks('E'));assert.equal(response.status,400);
    response=await submit(env,first.cookie,ranks().map(row=>({...row,tier:'S'})));assert.equal(response.status,400);assert.match((await response.json()).error,/één docent S/);
    response=await submit(env,first.cookie,ranks(),'https://other.test');assert.equal(response.status,403);
    const readback=await worker.fetch(new Request(origin+'/api/results',{headers:{cookie:first.cookie}}),env);data=await readback.json();assert.ok(data.teachers.every(t=>t.total===3&&t.counts.F===1));assert.ok(data.myRanking.every(t=>t.tier==='F'));
  }finally{env.DB.close();}
});
test('Missing database returns an unavailable state',async()=>{const response=await worker.fetch(new Request(origin+'/api/results'),{});assert.equal(response.status,503);assert.ok((await response.json()).error.includes('tijdelijk'));});
test('A reset starts at zero, hides previous rankings and rejects submissions from an old round',async()=>{
  const env={DB:localDatabase()};
  try{
    const person=await visitor(env);const hash=createHash('sha256').update(person.cookie.slice('docente_voter='.length)).digest('hex');
    await env.DB.batch(ranks('S').map(r=>env.DB.prepare('INSERT INTO votes (voter_id, teacher_id, tier) VALUES (?, ?, ?)').bind(hash,r.teacherId,r.tier)));
    const fresh=await worker.fetch(new Request(origin+'/api/results',{headers:{cookie:person.cookie}}),env);const data=await fresh.json();assert.equal(data.roundId,ACTIVE_ROUND);assert.equal(data.blind,true);assert.equal(data.teachers,null);assert.deepEqual(data.myRanking,[]);
    let response=await submit(env,person.cookie,ranks('F'),origin,'initial');assert.equal(response.status,409);
    response=await submit(env,person.cookie,ranks('A'));assert.equal(response.status,200);assert.ok((await response.json()).teachers.every(t=>t.total===1&&t.counts.A===1&&t.counts.S===0));
  }finally{env.DB.close();}
});
async function duel(env,cookie,leftId,rightId,winnerId,roundId=ACTIVE_ROUND){return worker.fetch(new Request(origin+'/api/duels',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({leftId,rightId,winnerId,roundId})}),env);}
test('Blind results cannot be bypassed by duels; duel updates replace one browser choice',async()=>{
  const env={DB:localDatabase()};
  try{
    const first=await visitor(env),second=await visitor(env);
    await submit(env,first.cookie,ranks());
    let response=await duel(env,second.cookie,1,2,1);let data=await response.json();assert.equal(response.status,200);assert.equal(data.blind,true);assert.equal(data.teachers,null);assert.deepEqual(data.duelResults,[]);assert.equal(data.myDuels.length,1);
    response=await duel(env,second.cookie,1,2,2);data=await response.json();assert.equal(data.myDuels.length,1);assert.equal(data.myDuels[0].winnerId,2);
    response=await duel(env,second.cookie,2,1,1);assert.equal(response.status,400);
    response=await duel(env,second.cookie,1,2,3);assert.equal(response.status,400);
    response=await duel(env,second.cookie,1,2,1,'initial');assert.equal(response.status,409);
    data=await (await submit(env,second.cookie,ranks('A'))).json();assert.equal(data.blind,false);assert.deepEqual(data.duelResults,[{leftId:1,rightId:2,winnerId:2,count:1}]);
    await duel(env,first.cookie,1,2,1);
    data=await (await duel(env,second.cookie,1,2,1)).json();assert.deepEqual(data.duelResults,[{leftId:1,rightId:2,winnerId:1,count:2}]);
    const returning=await worker.fetch(new Request(origin+'/api/results',{headers:{cookie:second.cookie}}),env);assert.equal((await returning.json()).myDuels[0].winnerId,1);
  }finally{env.DB.close();}
});
test('Match excludes own vote and disagreement measures tier spread',async()=>{
  const env={DB:localDatabase()};
  try{
    const first=await visitor(env);let data=await (await submit(env,first.cookie,ranks())).json();assert.equal(data.matchScore,null);assert.equal(data.teachers[0].disagreement,null);
    const second=await visitor(env);data=await (await submit(env,second.cookie,ranks())).json();assert.equal(data.matchScore,100);assert.equal(data.teachers[0].disagreement,0);
    data=await (await submit(env,second.cookie,ranks('F'))).json();assert.equal(data.matchScore,0);assert.equal(data.teachers[0].disagreement,100);
    const third=await visitor(env);data=await (await submit(env,third.cookie,ranks())).json();assert.equal(data.matchScore,50);
    assert.equal(disagreement({total:2,counts:{S:0,A:1,B:1,C:0,D:0,F:0}}),20);
  }finally{env.DB.close();}
});
test('Weekly results freeze past weeks, preserve ties, and use Brussels Monday boundaries',async()=>{
  assert.equal(weekStart(new Date('2026-10-11T21:59:59Z')),'2026-10-05');
  assert.equal(weekStart(new Date('2026-10-11T22:00:00Z')),'2026-10-12');
  assert.equal(weekStart(new Date('2026-12-27T23:00:00Z')),'2026-12-28');
  const env={DB:localDatabase()};let date=new Date('2026-10-07T12:00:00Z');const timed=createWorker({},()=>date);
  const send=async(cookie,ranking)=>timed.fetch(new Request(origin+'/api/votes',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({rankings:ranking,roundId:ACTIVE_ROUND})}),env);
  try{
    const person=await visitor(env);let data=await (await send(person.cookie,ranks())).json();assert.equal(data.weeks[0].leaders.length,1);assert.equal(data.weeks[0].voters,1);assert.equal(data.votedThisWeek,true);
    const second=await visitor(env),secondRank=ranks('A');secondRank[1].tier='S';data=await (await send(second.cookie,secondRank)).json();assert.equal(data.weeks[0].leaders.length,2);
    data=await (await send(person.cookie,ranks('F'))).json();assert.equal(data.weeks[0].voters,2);assert.equal(data.weeks[0].leaders[0].id,2);
    const ranking=ranks('A');ranking[0].tier='S';data=await (await send(person.cookie,ranking)).json();assert.equal(data.weeks[0].leaders[0].id,1);
    date=new Date('2026-10-12T12:00:00Z');data=await (await timed.fetch(new Request(origin+'/api/results',{headers:{cookie:person.cookie}}),env)).json();assert.equal(data.votedThisWeek,false);assert.equal(data.currentWeek,'2026-10-12');
    data=await (await send(person.cookie,ranks('F'))).json();assert.equal(data.weeks.length,2);assert.equal(data.weeks[0].week,'2026-10-12');assert.deepEqual(data.weeks[1].leaders.map(t=>t.id),[1,2]);assert.ok(data.teachers.every(t=>t.total===2&&t.counts.F===1));
    const fresh=await visitor(env);assert.equal(fresh.data.blind,true);assert.deepEqual(fresh.data.weeks,[]);
  }finally{env.DB.close();}
});
async function classRead(env,cookie,classId){const response=await worker.fetch(new Request(origin+'/api/results?classId='+classId,{headers:{cookie}}),env);return {response,data:await response.json()};}
async function classPost(env,cookie,path,classId,body){return worker.fetch(new Request(origin+path,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({...body,classId})}),env);}
const otherNames=['Brent Pulmans',' lena   dillien ','Andere Docent 3','Andere Docent 4','Andere Docent 5','Andere Docent 6','Andere Docent 7'];
test('All 19 class labels work; new class ballots remain separate and join the overall ranking',async()=>{
  const env={DB:localDatabase()};
  const labels=['1itf1','1itf2','1itf3','1itf4','1itf5','1acs1','1acs2','2acs','2appai','2ccs','2di','3acs','3app','3ccs','3di','wt','alumni','1 graduaat','2 graduaat'];
  try{
    const person=await visitor(env),names=person.data.teacherNames;
    await submit(env,person.cookie,ranks('S'));
    for(const label of labels){
      let read=await classRead(env,person.cookie,label);assert.equal(read.response.status,200,label);
      if(label==='1itf4'){assert.equal(read.data.classId,'1ITF04');assert.deepEqual(read.data.myRanking,ranks('S'));continue;}
      assert.equal(read.data.configured,false,label);assert.deepEqual(read.data.myRanking,[]);
      const setup=await classPost(env,person.cookie,'/api/classes',label,{teacherNames:names});assert.equal(setup.status,200,label);
      const classPerson=await visitor(env);
      const vote=await classPost(env,classPerson.cookie,'/api/votes',label,{rankings:ranks('D'),roundId:read.data.roundId});assert.equal(vote.status,200,label);
      const duel=await classPost(env,classPerson.cookie,'/api/duels',label,{leftId:1,rightId:2,winnerId:2,roundId:read.data.roundId});assert.equal(duel.status,200,label);
      read=await classRead(env,classPerson.cookie,label);assert.ok(read.data.teachers.every(t=>t.total===1&&t.counts.D===1),label);assert.equal(read.data.myDuels[0].winnerId,2);
    }
    const read=await classRead(env,person.cookie,'1ITF04');assert.ok(read.data.teachers.every(t=>t.total===1&&t.counts[t.id===1?'S':'A']===1));assert.deepEqual(read.data.myDuels,[]);
    assert.ok(read.data.overall.every(t=>t.total===19&&t.counts[t.id==='lena dillien'?'S':'A']===1&&t.counts.D===18&&t.classes.length===19));
    for(const legacy of ['1ITF01','1ITF02','1ITF05'])assert.ok((await classRead(env,person.cookie,legacy)).data.teachers.every(t=>t.counts.D===1));
    assert.equal((await classRead(env,person.cookie,'unknown')).response.status,400);
  }finally{env.DB.close();}
});
test('Class setup is shared, required before voting, and cannot replace existing names',async()=>{
  const env={DB:localDatabase()};
  try{
    const person=await visitor(env);assert.equal(person.data.classId,'1ITF04');assert.equal(person.data.configured,true);assert.equal(person.data.teacherNames[0],'Lena Dillien');
    let read=await classRead(env,person.cookie,'1ITF01');assert.equal(read.data.configured,false);assert.equal(read.data.teacherNames,null);
    let response=await classPost(env,person.cookie,'/api/votes','1ITF01',{rankings:ranks(),roundId:ACTIVE_ROUND});assert.equal(response.status,409);
    response=await classPost(env,person.cookie,'/api/duels','1ITF01',{leftId:1,rightId:2,winnerId:1,roundId:ACTIVE_ROUND});assert.equal(response.status,409);
    response=await classPost(env,person.cookie,'/api/classes','1ITF01',{teacherNames:['Lena Dillien',' LENA DILLIEN ',...otherNames.slice(2)]});assert.equal(response.status,400);
    response=await classPost(env,person.cookie,'/api/classes','1ITF01',{teacherNames:otherNames});assert.equal(response.status,200);const data=await response.json();assert.equal(data.teacherNames[1],'lena dillien');
    const second=await visitor(env);read=await classRead(env,second.cookie,'1ITF01');assert.deepEqual(read.data.teacherNames,data.teacherNames);assert.equal(read.data.blind,true);
    response=await classPost(env,second.cookie,'/api/classes','1ITF01',{teacherNames:otherNames.map(n=>'Nieuw '+n)});assert.equal(response.status,409);
    response=await classPost(env,person.cookie,'/api/classes','1ITF04',{teacherNames:otherNames});assert.equal(response.status,409);
    read=await classRead(env,person.cookie,'1ITF06');assert.equal(read.response.status,400);
    response=await classPost(env,person.cookie,'/api/votes','1ITF06',{rankings:ranks(),roundId:ACTIVE_ROUND});assert.equal(response.status,400);
  }finally{env.DB.close();}
});
test('Class votes, duels and weeks remain separate; overall joins teacher names across different positions',async()=>{
  const env={DB:localDatabase()};
  try{
    const person=await visitor(env);const four=ranks('A');four[0].tier='S';let data=await (await submit(env,person.cookie,four)).json();
    await duel(env,person.cookie,1,2,1);
    await classPost(env,person.cookie,'/api/classes','1ITF01',{teacherNames:otherNames});
    const second=await visitor(env);
    const foreign=await classRead(env,person.cookie,'1ITF01');assert.equal(foreign.data.readOnly,true);assert.equal(foreign.data.blind,false);
    let read=await classRead(env,second.cookie,'1ITF01');assert.equal(read.data.blind,true);assert.deepEqual(read.data.myRanking,[]);assert.deepEqual(read.data.myDuels,[]);assert.equal(read.data.votedThisWeek,false);
    const one=ranks('F');one[1].tier='S';data=await (await classPost(env,second.cookie,'/api/votes','1ITF01',{rankings:one,roundId:ACTIVE_ROUND})).json();assert.ok(data.teachers.every(t=>t.total===1));assert.equal(data.matchScore,null);
    const lena=data.overall.find(t=>t.id==='lena dillien');assert.equal(lena.total,2);assert.equal(lena.counts.S,2);assert.deepEqual(lena.classes.sort(),['1ITF01','1ITF04']);
    assert.equal(data.overall.find(t=>t.name==='Brent Pulmans').counts.F,1);assert.equal(data.overall.find(t=>t.name==='Brent Pulmans').counts.A,1);assert.equal(data.overall.length,12);
    await classPost(env,second.cookie,'/api/duels','1ITF01',{leftId:1,rightId:2,winnerId:2,roundId:ACTIVE_ROUND});
    data=(await classRead(env,person.cookie,'1ITF04')).data;assert.deepEqual(data.myRanking,four);assert.equal(data.myDuels[0].winnerId,1);assert.equal(data.weeks[0].leaders[0].id,1);assert.equal(data.teachers[0].total,1);
    await classPost(env,second.cookie,'/api/votes','1ITF01',{rankings:ranks('D'),roundId:ACTIVE_ROUND});
    data=(await classRead(env,person.cookie,'1ITF04')).data;assert.equal(data.teachers[0].counts.S,1);assert.equal(data.overall.find(t=>t.id==='lena dillien').counts.D,1);
    data=(await classRead(env,second.cookie,'1ITF01')).data;assert.equal(data.myDuels[0].winnerId,2);assert.ok(data.myRanking.every(r=>r.tier==='D'));assert.equal(data.weeks[0].voters,1);assert.equal(data.weeks[0].leaders.length,0);
    assert.equal((await classRead(env,person.cookie,'1ITF05')).data.configured,false);
  }finally{env.DB.close();}
});
