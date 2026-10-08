import test from 'node:test';
import assert from 'node:assert/strict';
import {createTierlistRestorer,normalizeSavedRanking} from '../public/tierlist-restore.js';
const ranking=[{teacherId:1,tier:'S'},{teacherId:2,tier:'A'}];
const state=()=>({accountKey:'member:1',classId:'1ITF04',year:'2026-2027',roundId:'round1',teacherNames:['Docent 1','Docent 2'],revision:0,ready:true,pristine:true});

test('Account restore waits for account and class data, coalesces requests and never repeatedly restores a cleared board',async()=>{
  let current={...state(),accountKey:null,ready:false},calls=0,finish;
  const applied=[];
  const restorer=createTierlistRestorer({getState:()=>current,load:()=>{calls++;return new Promise(resolve=>finish=resolve);},onResult:data=>applied.push(data),onError:error=>{throw error;}});
  assert.equal(await restorer.restore(),'skipped');
  current.accountKey='member:1';assert.equal(await restorer.restore(),'skipped');
  current.ready=true;const first=restorer.restore(),second=restorer.restore();
  await Promise.resolve();assert.equal(calls,1);finish({ranking,outdated:false});
  assert.equal(await first,'loaded');assert.equal(await second,'loaded');assert.deepEqual(applied,[{kind:'loaded',ranking}]);
  assert.equal(await restorer.restore(),'skipped');assert.equal(calls,1);
});

test('A delayed saved tierlist cannot overwrite edits, a different account/class/year/round, or changed teacher names',async()=>{
  for(const change of [s=>s.pristine=false,s=>s.revision++,s=>s.accountKey=null,s=>s.accountKey='member:2',s=>s.classId='1ITF01',s=>s.year='2027-2028',s=>s.roundId='round2',s=>s.teacherNames=['Andere docent','Docent 2']]){
    let current=state(),finish;const applied=[];
    const restorer=createTierlistRestorer({getState:()=>current,load:()=>new Promise(resolve=>finish=resolve),onResult:data=>applied.push(data),onError:error=>{throw error;}});
    const task=restorer.restore();await Promise.resolve();change(current);finish({ranking});
    assert.equal(await task,'stale');assert.deepEqual(applied,[]);
  }
});

test('Empty or outdated account drafts are reported without replacing the board; failed reads may be retried',async()=>{
  for(const data of [{ranking:null,outdated:false},{ranking:null,outdated:true},{ranking:[{teacherId:1,tier:'E'}]}]){
    const applied=[];const restorer=createTierlistRestorer({getState:state,load:async()=>data,onResult:value=>applied.push(value),onError:error=>{throw error;}});
    await restorer.restore();assert.equal(applied[0].ranking,null);assert.notEqual(applied[0].kind,'loaded');
  }
  let calls=0,errors=0;const applied=[];
  const restorer=createTierlistRestorer({getState:state,load:async()=>{if(++calls===1)throw new Error('offline');return {ranking};},onResult:data=>applied.push(data),onError:()=>errors++});
  assert.equal(await restorer.restore(),'failed');assert.equal(errors,1);assert.equal(await restorer.restore(),'loaded');assert.equal(applied.length,1);
});

test('Saved rankings restore exact teacher IDs and normalize old extra S tiers without mutating stored data',()=>{
  const old=[{teacherId:2,tier:'S'},{teacherId:1,tier:'S'}];
  assert.deepEqual(normalizeSavedRanking(old,2),[{teacherId:1,tier:'unranked'},{teacherId:2,tier:'S'}]);
  assert.equal(old[1].tier,'S');
  for(const invalid of [null,[],[{teacherId:1,tier:'S'},{teacherId:1,tier:'A'}],[{teacherId:1,tier:'S'},{teacherId:3,tier:'A'}],[{teacherId:1,tier:'S'},{teacherId:2,tier:'E'}]])assert.equal(normalizeSavedRanking(invalid,2),null);
});
