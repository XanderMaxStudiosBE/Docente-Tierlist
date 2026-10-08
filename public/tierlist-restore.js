const savedTiers=new Set(['S','A','B','C','D','F','unranked']);

export function normalizeSavedRanking(ranking,count){
  if(!Array.isArray(ranking)||ranking.length!==count||count<1)return null;
  const rows=new Map();let foundS=false;
  for(const row of ranking){
    if(!row||!Number.isInteger(row.teacherId)||row.teacherId<1||row.teacherId>count||rows.has(row.teacherId)||!savedTiers.has(row.tier))return null;
    const tier=row.tier==='S'&&foundS?'unranked':row.tier;
    if(row.tier==='S')foundS=true;
    rows.set(row.teacherId,{teacherId:row.teacherId,tier});
  }
  return Array.from({length:count},(_,i)=>rows.get(i+1));
}

// Only restore an untouched board. A late response must never replace edits,
// another class/year, changed teacher names, or another signed-in account.
export function createTierlistRestorer({getState,load,onResult,onError}){
  const completed=new Set(),pending=new Map();
  const key=state=>JSON.stringify([state.accountKey,state.classId,state.year,state.roundId,state.teacherNames]);
  const eligible=state=>state.ready&&state.accountKey&&state.pristine&&state.teacherNames.length>0;
  function restore(){
    const state=getState(),before={...state,teacherNames:[...state.teacherNames]};
    if(!eligible(before))return Promise.resolve('skipped');
    const context=key(before);
    if(pending.has(context))return pending.get(context);
    if(completed.has(context))return Promise.resolve('skipped');
    const unchanged=()=>{const now=getState();return eligible(now)&&key(now)===context&&now.revision===before.revision;};
    const task=Promise.resolve().then(()=>load(before)).then(data=>{
      if(!unchanged())return 'stale';
      completed.add(context);
      const ranking=data.outdated?null:normalizeSavedRanking(data.ranking,before.teacherNames.length);
      const kind=data.outdated?'outdated':data.ranking===null?'missing':ranking?'loaded':'invalid';
      onResult({kind,ranking},before);
      return kind;
    }).catch(error=>{
      if(unchanged())onError(error,before);
      return 'failed';
    }).finally(()=>pending.delete(context));
    pending.set(context,task);
    return task;
  }
  return {restore};
}
