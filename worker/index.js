import {yearEnvironment,FIRST_YEAR,favoriteData,handleMember,memberAccount} from './features.js';
import {handleTickets} from './tickets.js';
import {voterCookie,voterCookieHeader,scopedVoter,votingMembership,membershipData,handleMembership,membershipForVote,guardedVote,votingLinkStatements,membershipStillCurrent} from './membership.js';
import {handleAdmin,activeRounds} from './admin.js';
import {CLASS_IDS,DEFAULT_CLASS,DEFAULT_TEACHER_NAMES,validTeacherNames,resolveClass} from '../public/classes.js';
const TIERS=['S','A','B','C','D','F'];
export const CLASSES=CLASS_IDS;
const DEFAULT_NAMES=DEFAULT_TEACHER_NAMES;
export const ACTIVE_ROUND='round-2026-10-07-reset-1';
function database(env){if(!env.DB)throw new Error('Stemmenopslag niet beschikbaar.');return env.DB;}
function json(data,status=200,headers={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
function normalizeName(name){return name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('nl-BE');}
async function classNames(db){const [settings]=await db.batch([db.prepare('SELECT class_id, teacher_names FROM class_settings')]);return new Map([[DEFAULT_CLASS,DEFAULT_NAMES],...settings.results.map(r=>[r.class_id,JSON.parse(r.teacher_names)])]);}
export function weekStart(now){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=name=>parts.find(p=>p.type===name).value;
  const date=new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);
}
function emptyTeachers(length){return Array.from({length},(_,i)=>({id:i+1,total:0,counts:Object.fromEntries(TIERS.map(t=>[t,0]))}));}
function countTeachers(rows,length){const teachers=emptyTeachers(length);for(const row of rows){const t=teachers[row.teacher_id-1];if(!t||!TIERS.includes(row.tier))continue;t.counts[row.tier]=row.count;t.total+=row.count;}return teachers;}
export function disagreement(teacher){
  if(teacher.total<2)return null;
  const mean=TIERS.reduce((s,t,i)=>s+(5-i)*teacher.counts[t],0)/teacher.total;
  const variance=TIERS.reduce((s,t,i)=>s+((5-i)-mean)**2*teacher.counts[t],0)/teacher.total;
  return Math.sqrt(variance)/2.5*100;
}
async function results(env,voter,now,classId,membership){
  const db=database(env);
  const rounds=await activeRounds(db,CLASSES,env.YEAR.initialRound),round=rounds.get(classId);
  const names=await classNames(db),teacherNames=names.get(classId)||null;const teacherCount=teacherNames?.length||0;
  const [mine,ownDuels,weeklyMine]=await db.batch([
    db.prepare("SELECT teacher_id, tier FROM votes WHERE voter_id = ? AND round_id = ? AND class_id = ? AND tier IN ('S','A','B','C','D','F') ORDER BY teacher_id").bind(voter,round,classId),
    db.prepare('SELECT left_id, right_id, winner_id FROM duels WHERE voter_id = ? AND round_id = ? AND class_id = ? ORDER BY left_id, right_id').bind(voter,round,classId),
    db.prepare('SELECT COUNT(*) AS count FROM weekly_votes WHERE voter_id = ? AND round_id = ? AND week = ? AND class_id = ?').bind(voter,round,weekStart(now),classId),
  ]);
  const myRanking=mine.results.map(r=>({teacherId:r.teacher_id,tier:r.tier}));
  const readOnly=!!membership?.classId&&membership.classId!==classId;
  const canVote=!!membership?.classId&&membership.classId===classId&&!membership.needsSync&&!env.YEAR.archived;
  const favorite=await favoriteData(db,classId,round,voter,myRanking.length===teacherCount||env.YEAR.archived||readOnly);
  const base={...env.YEAR,...favorite,membership:membership?membershipData(membership):null,canVote,readOnly,classId,teacherNames,configured:!!teacherNames,roundId:round,currentWeek:weekStart(now),votedThisWeek:teacherCount>0&&weeklyMine.results[0].count===teacherCount,myRanking,myDuels:ownDuels.results.map(r=>({leftId:r.left_id,rightId:r.right_id,winnerId:r.winner_id}))};
  if(!teacherNames||(myRanking.length!==teacherCount&&!env.YEAR.archived&&!readOnly))return {...base,blind:true,teachers:null,overall:[],matchScore:null,weeks:[],duelResults:[]};
  const [counts,weeks,duelCounts,allCounts]=await db.batch([
    db.prepare("SELECT teacher_id, tier, COUNT(*) AS count FROM votes WHERE round_id = ? AND class_id = ? AND tier IN ('S','A','B','C','D','F') GROUP BY teacher_id, tier").bind(round,classId),
    db.prepare('SELECT week, teacher_id, tier, COUNT(*) AS count FROM weekly_votes WHERE round_id = ? AND class_id = ? GROUP BY week, teacher_id, tier ORDER BY week DESC').bind(round,classId),
    db.prepare('SELECT left_id, right_id, winner_id, COUNT(*) AS count FROM duels WHERE round_id = ? AND class_id = ? GROUP BY left_id, right_id, winner_id').bind(round,classId),
    db.prepare("SELECT v.class_id, v.teacher_id, v.tier, COUNT(*) AS count FROM votes v LEFT JOIN class_rounds r ON r.class_id = v.class_id WHERE v.round_id = COALESCE(r.round_id, ?) AND v.tier IN ('S','A','B','C','D','F') GROUP BY v.class_id, v.teacher_id, v.tier").bind(env.YEAR.initialRound),
  ]);
  const teachers=countTeachers(counts.results,teacherCount).map(t=>({...t,name:teacherNames[t.id-1],disagreement:disagreement(t)}));
  const combined=new Map();
  for(const row of allCounts.results){const name=names.get(row.class_id)?.[row.teacher_id-1];if(!name)continue;const id=normalizeName(name);if(!combined.has(id))combined.set(id,{id,name,total:0,counts:Object.fromEntries(TIERS.map(t=>[t,0])),classes:[]});const t=combined.get(id);t.total+=row.count;t.counts[row.tier]+=row.count;if(!t.classes.includes(row.class_id))t.classes.push(row.class_id);}
  const overall=[...combined.values()].map(t=>({...t,disagreement:disagreement(t)}));
  const comparable=teachers.filter(t=>t.total>1);
  const matchScore=myRanking.length===teacherCount&&comparable.length?comparable.reduce((sum,t)=>sum+(t.counts[myRanking.find(r=>r.teacherId===t.id).tier]-1)/(t.total-1),0)/comparable.length*100:null;
  const weekly=[...new Set(weeks.results.map(r=>r.week))].map(week=>{
    const ranked=countTeachers(weeks.results.filter(r=>r.week===week),teacherCount);const most=Math.max(...ranked.map(t=>t.counts.S));
    return {week,voters:Math.max(...ranked.map(t=>t.total)),leaders:most?ranked.filter(t=>t.counts.S===most).map(t=>({id:t.id,sVotes:t.counts.S,total:t.total})):[]};
  });
  return {...base,blind:false,teachers,overall,matchScore,weeks:weekly,duelResults:duelCounts.results.map(r=>({leftId:r.left_id,rightId:r.right_id,winnerId:r.winner_id,count:r.count}))};
}
function validateRanking(body,teacherCount){
  if(!body || typeof body!=='object' || Object.keys(body).some(k=>!['rankings','roundId','classId'].includes(k)) || !Array.isArray(body.rankings) || body.rankings.length!==teacherCount)return false;
  const ids=new Set();
  for(const row of body.rankings){if(!row || Object.keys(row).some(k=>!['teacherId','tier'].includes(k)) || !Number.isInteger(row.teacherId) || row.teacherId<1 || row.teacherId>teacherCount || !TIERS.includes(row.tier) || ids.has(row.teacherId))return false;ids.add(row.teacherId);}
  return body.rankings.filter(row=>row.tier==='S').length<=1;
}
function validateDuel(body,teacherCount){return body && Object.keys(body).every(k=>['leftId','rightId','winnerId','roundId','classId'].includes(k)) && Number.isInteger(body.leftId) && Number.isInteger(body.rightId) && body.leftId>=1 && body.rightId<=teacherCount && body.leftId<body.rightId && [body.leftId,body.rightId].includes(body.winnerId);}
export function createWorker(assets,now=()=>new Date()){return {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/photos/')||url.pathname==='/api/photos'||url.pathname==='/api/admin/photos')return new Response('Pagina niet gevonden',{status:404,headers:{'Cache-Control':'no-store'}});
  if(url.pathname.startsWith('/api/')){try{env=await yearEnvironment(request,env,ACTIVE_ROUND);}catch(error){return json({error:env.DB?error.message:'Stemmen tijdelijk niet beschikbaar.'},env.DB?400:503);}}
  if(url.pathname==='/api/membership'){try{return await handleMembership(request,env,now());}catch(error){console.error('Klaskeuze:',error.message);return json({error:'Je klaskeuze is tijdelijk niet beschikbaar. Probeer opnieuw.'},503);}}
  if(url.pathname.startsWith('/api/account/')){try{return await handleMember(request,env,now());}catch(error){console.error('Account:',error.message);return json({error:'Account tijdelijk niet beschikbaar.'},503);}}
  if(url.pathname==='/api/tickets'||url.pathname.startsWith('/api/tickets/')||url.pathname==='/api/admin/tickets'||url.pathname.startsWith('/api/admin/tickets/'))return handleTickets(request,env,now());
  if(url.pathname.startsWith('/api/admin/'))return handleAdmin(request,env,now(),CLASSES,env.YEAR.initialRound);
  if(['/api/results','/api/votes','/api/duels','/api/classes','/api/favorites'].includes(url.pathname)){
    try{
      if(url.pathname==='/api/results'){
        if(request.method!=='GET')return json({error:'Gebruik GET.'},405,{Allow:'GET'});
        const classId=resolveClass(url.searchParams.get('classId')??DEFAULT_CLASS);if(!classId)return json({error:'Onbekende klas.'},400);
        const existing=voterCookie(request);const id=existing||crypto.randomUUID();
        const headers=existing?{}:{'Set-Cookie':voterCookieHeader(id,url)},date=now(),membership=await votingMembership(request,env,date,id);
        return json(await results(env,await scopedVoter(id,classId,env.YEAR.year),date,classId,membership),200,headers);
      }
      if(request.method!=='POST')return json({error:'Gebruik POST.'},405,{Allow:'POST'});
      if(env.YEAR.archived)return json({error:'Dit schooljaar is gearchiveerd. Je kunt de resultaten bekijken.'},409);
      if(request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Deze stem komt niet van deze website.'},403);
      if(!(request.headers.get('content-type')||'').startsWith('application/json'))return json({error:'Onjuiste invoer.'},415);
      const text=await request.text();if(text.length>4096)return json({error:'Inzending te groot.'},413);
      let body;try{body=JSON.parse(text);}catch{return json({error:'Onjuiste invoer.'},400);}
      if(!body || typeof body!=='object' || Array.isArray(body))return json({error:'Onjuiste invoer.'},400);
      const classId=resolveClass(body.classId??DEFAULT_CLASS);if(!classId)return json({error:'Onbekende klas.'},400);
      const id=voterCookie(request);if(!id)return json({error:'Laad de resultaten opnieuw en probeer nogmaals.'},409);
      const hash=await scopedVoter(id,classId,env.YEAR.year),db=database(env),date=now();
      const round=(await activeRounds(db,CLASSES,env.YEAR.initialRound)).get(classId);
      const names=await classNames(db);
      if(url.pathname==='/api/classes'){
        if(Object.keys(body).some(k=>!['classId','teacherNames'].includes(k)) || !validTeacherNames(body.teacherNames))return json({error:'Vul 1 tot 30 verschillende docentnamen in, maximaal 50 tekens per naam.'},400);
        if(names.has(classId))return json({error:'De docenten van deze klas zijn al ingesteld. Vernieuw de pagina.'},409);
        const requested=body.teacherNames.map(n=>n.normalize('NFC').trim().replace(/\s+/g,' '));
        await db.batch([db.prepare('INSERT OR IGNORE INTO class_settings (class_id, teacher_names) VALUES (?, ?)').bind(classId,JSON.stringify(requested))]);
        const actual=(await classNames(db)).get(classId);if(JSON.stringify(actual)!==JSON.stringify(requested))return json({error:'Iemand heeft de docentnamen net ingesteld. Vernieuw de pagina.'},409);
        return json(await results(env,hash,date,classId,await votingMembership(request,env,date)));
      }
      if(!names.has(classId))return json({error:'Stel eerst de docentnamen van deze klas in.'},409);
      const teacherCount=names.get(classId).length;
      if(url.pathname==='/api/favorites'){
        if(Object.keys(body).some(k=>!['classId','roundId','teacherId'].includes(k))||!Number.isInteger(body.teacherId)||body.teacherId<1||body.teacherId>teacherCount)return json({error:'Kies een geldige favoriete docent.'},400);
        if(body.roundId!==round)return json({error:'Er is een nieuwe stemronde. Vernieuw de pagina.'},409);
        const allowed=await membershipForVote(request,env,date,classId);if(allowed.error)return json({error:allowed.error},allowed.status);const membership=allowed.context;
        await db.batch([...votingLinkStatements(env,membership,classId,hash),guardedVote(db,membership,'INSERT INTO favorites (class_id, round_id, voter_id, teacher_id) VALUES (?, ?, ?, ?) ON CONFLICT(class_id, round_id, voter_id) DO UPDATE SET teacher_id = excluded.teacher_id',[classId,round,hash,body.teacherId])]);
        if(!await membershipStillCurrent(request,env,date,membership))return json({error:'Je klaskeuze is intussen gewijzigd. Vernieuw de pagina.'},409);return json(await results(env,hash,date,classId,membership));
      }
      const isDuel=url.pathname==='/api/duels';
      if(!isDuel&&Array.isArray(body.rankings)&&body.rankings.filter(row=>row?.tier==='S').length>1)return json({error:'Je kunt maximaal één docent S geven.'},400);
      if(!(isDuel?validateDuel(body,teacherCount):validateRanking(body,teacherCount)))return json({error:isDuel?'Kies een docent uit een geldig duel.':'Plaats alle docenten van je klas in een geldige tier.'},400);
      if(body.roundId!==round)return json({error:'Er is een nieuwe stemronde gestart. Vernieuw de pagina en stuur je ranking opnieuw in.'},409);
      const allowed=await membershipForVote(request,env,date,classId);if(allowed.error)return json({error:allowed.error},allowed.status);const membership=allowed.context;
      let accountSaved=false;
      if(isDuel){
        await db.batch([...votingLinkStatements(env,membership,classId,hash),guardedVote(db,membership,'INSERT INTO duels (voter_id, round_id, left_id, right_id, winner_id, class_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(voter_id, round_id, left_id, right_id) DO UPDATE SET winner_id = excluded.winner_id',[hash,round,body.leftId,body.rightId,body.winnerId,classId])]);
      }else{
        const week=weekStart(date),account=membership.account;
        const statements=body.rankings.flatMap(row=>[
          guardedVote(db,membership,'INSERT INTO votes (voter_id, teacher_id, tier, round_id, class_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(voter_id, teacher_id) DO UPDATE SET tier = excluded.tier, round_id = excluded.round_id',[hash,row.teacherId,row.tier,round,classId]),
          guardedVote(db,membership,'INSERT INTO weekly_votes (voter_id, teacher_id, tier, round_id, week, class_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(voter_id, teacher_id, round_id, week) DO UPDATE SET tier = excluded.tier',[hash,row.teacherId,row.tier,round,week,classId]),
        ]);
        if(account)statements.push(guardedVote(db,membership,'INSERT INTO saved_tierlists (account_id, school_year, class_id, ranking, teacher_names) VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id, school_year, class_id) DO UPDATE SET ranking = excluded.ranking, teacher_names = excluded.teacher_names',[account.id,env.YEAR.year,classId,JSON.stringify(body.rankings),JSON.stringify(names.get(classId))]));
        await db.batch([...votingLinkStatements(env,membership,classId,hash),...statements]);accountSaved=!!account;
      }
      if(!await membershipStillCurrent(request,env,date,membership))return json({error:'Je klaskeuze is intussen gewijzigd. Vernieuw de pagina.'},409);
      return json({...await results(env,hash,date,classId,membership),accountSaved});
    }catch(error){console.error('Stemmenopslag:',error);return json({error:'De stemmen zijn tijdelijk niet beschikbaar. Probeer opnieuw.'},503);}
  }
  if(request.method!=='GET' && request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const path=url.pathname==='/'?'/index.html':['/admin','/admin/'].includes(url.pathname)?'/admin.html':url.pathname;
  if(!Object.hasOwn(assets,path))return new Response('Pagina niet gevonden',{status:404});
  const asset=assets[path],binary=typeof asset==='object',type=binary?asset.type:path.endsWith('.css')?'text/css':path.endsWith('.js')?'application/javascript':'text/html';
  const content=binary?Uint8Array.from(atob(asset.base64),char=>char.charCodeAt(0)):asset;
  return new Response(request.method==='HEAD'?null:content,{headers:{'Content-Type':type+(binary?'':'; charset=utf-8'),'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
}};}
