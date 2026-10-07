import {handleAdmin,activeRounds,digest,authenticated} from './admin.js';
import {CLASS_IDS,DEFAULT_CLASS,resolveClass} from '../public/classes.js';
const TIERS=['S','A','B','C','D','F'];
export const CLASSES=CLASS_IDS;
const DEFAULT_NAMES=['Lena Dillien','Brent Pulmans','Michaël Cloots','Natalie Smets','Bart Portier','Stef Adriaansen','Stef Van Wolputte'];
export const ACTIVE_ROUND='round-2026-10-07-reset-1';
const cookieName='docente_voter';
function database(env){if(!env.DB)throw new Error('Stemmenopslag niet beschikbaar.');return env.DB;}
function json(data,status=200,headers={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
function voterCookie(request){const value=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9-]{36}$/.test(value||'')?value:null;}
async function voterHash(id){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
// Preserve existing 1ITF04 identities; other classes get independent browser votes.
function scopedVoter(id,classId){return voterHash(classId===DEFAULT_CLASS?id:id+':'+classId);}
function normalizeName(name){return name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('nl-BE');}
async function classNames(db){const [settings]=await db.batch([db.prepare('SELECT class_id, teacher_names FROM class_settings')]);return new Map([[DEFAULT_CLASS,DEFAULT_NAMES],...settings.results.map(r=>[r.class_id,JSON.parse(r.teacher_names)])]);}
export function weekStart(now){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=name=>parts.find(p=>p.type===name).value;
  const date=new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);
}
function emptyTeachers(){return Array.from({length:7},(_,i)=>({id:i+1,total:0,counts:Object.fromEntries(TIERS.map(t=>[t,0]))}));}
function countTeachers(rows){const teachers=emptyTeachers();for(const row of rows){const t=teachers[row.teacher_id-1];t.counts[row.tier]=row.count;t.total+=row.count;}return teachers;}
export function disagreement(teacher){
  if(teacher.total<2)return null;
  const mean=TIERS.reduce((s,t,i)=>s+(5-i)*teacher.counts[t],0)/teacher.total;
  const variance=TIERS.reduce((s,t,i)=>s+((5-i)-mean)**2*teacher.counts[t],0)/teacher.total;
  return Math.sqrt(variance)/2.5*100;
}
async function results(env,voter,now,classId,ownerHash){
  const db=database(env);
  const rounds=await activeRounds(db,CLASSES,ACTIVE_ROUND),round=rounds.get(classId);
  const names=await classNames(db),teacherNames=names.get(classId)||null;
  const [photoRows]=await db.batch([db.prepare('SELECT name_key, object_key, owner_hash FROM teacher_photos')]);
  const photos=(teacherNames||[]).flatMap((name,i)=>{const p=photoRows.results.find(p=>p.name_key===normalizeName(name));return p?[{teacherId:i+1,url:'/photos/'+p.object_key,canReplace:p.owner_hash===ownerHash}]:[];});
  const [mine,ownDuels,weeklyMine]=await db.batch([
    db.prepare("SELECT teacher_id, tier FROM votes WHERE voter_id = ? AND round_id = ? AND class_id = ? AND tier IN ('S','A','B','C','D','F') ORDER BY teacher_id").bind(voter,round,classId),
    db.prepare('SELECT left_id, right_id, winner_id FROM duels WHERE voter_id = ? AND round_id = ? AND class_id = ? ORDER BY left_id, right_id').bind(voter,round,classId),
    db.prepare('SELECT COUNT(*) AS count FROM weekly_votes WHERE voter_id = ? AND round_id = ? AND week = ? AND class_id = ?').bind(voter,round,weekStart(now),classId),
  ]);
  const myRanking=mine.results.map(r=>({teacherId:r.teacher_id,tier:r.tier}));
  const base={classId,teacherNames,photos,configured:!!teacherNames,roundId:round,currentWeek:weekStart(now),votedThisWeek:weeklyMine.results[0].count===7,myRanking,myDuels:ownDuels.results.map(r=>({leftId:r.left_id,rightId:r.right_id,winnerId:r.winner_id}))};
  if(myRanking.length!==7)return {...base,blind:true,teachers:null,overall:[],matchScore:null,weeks:[],duelResults:[]};
  const [counts,weeks,duelCounts,allCounts]=await db.batch([
    db.prepare("SELECT teacher_id, tier, COUNT(*) AS count FROM votes WHERE round_id = ? AND class_id = ? AND tier IN ('S','A','B','C','D','F') GROUP BY teacher_id, tier").bind(round,classId),
    db.prepare('SELECT week, teacher_id, tier, COUNT(*) AS count FROM weekly_votes WHERE round_id = ? AND class_id = ? GROUP BY week, teacher_id, tier ORDER BY week DESC').bind(round,classId),
    db.prepare('SELECT left_id, right_id, winner_id, COUNT(*) AS count FROM duels WHERE round_id = ? AND class_id = ? GROUP BY left_id, right_id, winner_id').bind(round,classId),
    db.prepare("SELECT v.class_id, v.teacher_id, v.tier, COUNT(*) AS count FROM votes v LEFT JOIN class_rounds r ON r.class_id = v.class_id WHERE v.round_id = COALESCE(r.round_id, ?) AND v.tier IN ('S','A','B','C','D','F') GROUP BY v.class_id, v.teacher_id, v.tier").bind(ACTIVE_ROUND),
  ]);
  const teachers=countTeachers(counts.results).map(t=>({...t,name:teacherNames[t.id-1],disagreement:disagreement(t)}));
  const combined=new Map();
  for(const row of allCounts.results){const name=names.get(row.class_id)?.[row.teacher_id-1];if(!name)continue;const id=normalizeName(name);if(!combined.has(id))combined.set(id,{id,name,total:0,counts:Object.fromEntries(TIERS.map(t=>[t,0])),classes:[]});const t=combined.get(id);t.total+=row.count;t.counts[row.tier]+=row.count;if(!t.classes.includes(row.class_id))t.classes.push(row.class_id);}
  const overall=[...combined.values()].map(t=>({...t,disagreement:disagreement(t)}));
  const comparable=teachers.filter(t=>t.total>1);
  const matchScore=comparable.length?comparable.reduce((sum,t)=>sum+(t.counts[myRanking.find(r=>r.teacherId===t.id).tier]-1)/(t.total-1),0)/comparable.length*100:null;
  const weekly=[...new Set(weeks.results.map(r=>r.week))].map(week=>{
    const ranked=countTeachers(weeks.results.filter(r=>r.week===week));const most=Math.max(...ranked.map(t=>t.counts.S));
    return {week,voters:Math.max(...ranked.map(t=>t.total)),leaders:most?ranked.filter(t=>t.counts.S===most).map(t=>({id:t.id,sVotes:t.counts.S,total:t.total})):[]};
  });
  return {...base,blind:false,teachers,overall,matchScore,weeks:weekly,duelResults:duelCounts.results.map(r=>({leftId:r.left_id,rightId:r.right_id,winnerId:r.winner_id,count:r.count}))};
}
function validateRanking(body){
  if(!body || typeof body!=='object' || Object.keys(body).some(k=>!['rankings','roundId','classId'].includes(k)) || !Array.isArray(body.rankings) || body.rankings.length!==7)return false;
  const ids=new Set();
  for(const row of body.rankings){if(!row || Object.keys(row).some(k=>!['teacherId','tier'].includes(k)) || !Number.isInteger(row.teacherId) || row.teacherId<1 || row.teacherId>7 || !TIERS.includes(row.tier) || ids.has(row.teacherId))return false;ids.add(row.teacherId);}
  return true;
}
function validateDuel(body){return body && Object.keys(body).every(k=>['leftId','rightId','winnerId','roundId','classId'].includes(k)) && Number.isInteger(body.leftId) && Number.isInteger(body.rightId) && body.leftId>=1 && body.rightId<=7 && body.leftId<body.rightId && [body.leftId,body.rightId].includes(body.winnerId);}
export function createWorker(assets,now=()=>new Date()){return {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/admin/'))return handleAdmin(request,env,now(),CLASSES,ACTIVE_ROUND);
  if(url.pathname.startsWith('/photos/')){
    if(!['GET','HEAD'].includes(request.method))return new Response('Gebruik GET.',{status:405});
    const key=url.pathname.slice('/photos/'.length);if(!/^[a-f0-9-]{36}$/.test(key))return new Response('Foto niet gevonden.',{status:404});
    try{if(!env.PHOTOS)return new Response('Foto-opslag tijdelijk niet beschikbaar.',{status:503});const object=await env.PHOTOS.get('teachers/'+key);if(!object)return new Response('Foto niet gevonden.',{status:404});return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable'}});}catch{return new Response('Foto tijdelijk niet beschikbaar.',{status:503});}
  }
  if(url.pathname==='/api/photos')return uploadPhoto(request,env,now());
  if(['/api/results','/api/votes','/api/duels','/api/classes'].includes(url.pathname)){
    try{
      if(url.pathname==='/api/results'){
        if(request.method!=='GET')return json({error:'Gebruik GET.'},405,{Allow:'GET'});
        const classId=resolveClass(url.searchParams.get('classId')??DEFAULT_CLASS);if(!classId)return json({error:'Onbekende klas.'},400);
        const existing=voterCookie(request);const id=existing||crypto.randomUUID();
        const headers=existing?{}:{'Set-Cookie':`${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`};
        return json(await results(env,await scopedVoter(id,classId),now(),classId,await voterHash(id)),200,headers);
      }
      if(request.method!=='POST')return json({error:'Gebruik POST.'},405,{Allow:'POST'});
      if(request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Deze stem komt niet van deze website.'},403);
      if(!(request.headers.get('content-type')||'').startsWith('application/json'))return json({error:'Onjuiste invoer.'},415);
      const text=await request.text();if(text.length>4096)return json({error:'Inzending te groot.'},413);
      let body;try{body=JSON.parse(text);}catch{return json({error:'Onjuiste invoer.'},400);}
      if(!body || typeof body!=='object' || Array.isArray(body))return json({error:'Onjuiste invoer.'},400);
      const classId=resolveClass(body.classId??DEFAULT_CLASS);if(!classId)return json({error:'Onbekende klas.'},400);
      const id=voterCookie(request);if(!id)return json({error:'Laad de resultaten opnieuw en probeer nogmaals.'},409);
      const hash=await scopedVoter(id,classId),db=database(env),date=now();
      const round=(await activeRounds(db,CLASSES,ACTIVE_ROUND)).get(classId);
      const names=await classNames(db);
      if(url.pathname==='/api/classes'){
        if(Object.keys(body).some(k=>!['classId','teacherNames'].includes(k)) || !Array.isArray(body.teacherNames) || body.teacherNames.length!==7 || body.teacherNames.some(n=>typeof n!=='string' || !n.trim() || n.trim().length>50) || new Set(body.teacherNames.map(normalizeName)).size!==7)return json({error:'Vul zeven verschillende docentnamen in, maximaal 50 tekens per naam.'},400);
        if(names.has(classId))return json({error:'De docenten van deze klas zijn al ingesteld. Vernieuw de pagina.'},409);
        const requested=body.teacherNames.map(n=>n.normalize('NFC').trim().replace(/\s+/g,' '));
        await db.batch([db.prepare('INSERT OR IGNORE INTO class_settings (class_id, teacher_names) VALUES (?, ?)').bind(classId,JSON.stringify(requested))]);
        const actual=(await classNames(db)).get(classId);if(JSON.stringify(actual)!==JSON.stringify(requested))return json({error:'Iemand heeft de docentnamen net ingesteld. Vernieuw de pagina.'},409);
        return json(await results(env,hash,date,classId,await voterHash(id)));
      }
      if(!names.has(classId))return json({error:'Stel eerst de docentnamen van deze klas in.'},409);
      const isDuel=url.pathname==='/api/duels';
      if(!(isDuel?validateDuel(body):validateRanking(body)))return json({error:isDuel?'Kies een docent uit een geldig duel.':'Plaats alle zeven docenten in een geldige tier.'},400);
      if(body.roundId!==round)return json({error:'Er is een nieuwe stemronde gestart. Vernieuw de pagina en stuur je ranking opnieuw in.'},409);
      if(isDuel){
        await db.batch([db.prepare('INSERT INTO duels (voter_id, round_id, left_id, right_id, winner_id, class_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(voter_id, round_id, left_id, right_id) DO UPDATE SET winner_id = excluded.winner_id').bind(hash,round,body.leftId,body.rightId,body.winnerId,classId)]);
      }else{
        const week=weekStart(date);
        await db.batch(body.rankings.flatMap(row=>[
          db.prepare('INSERT INTO votes (voter_id, teacher_id, tier, round_id, class_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(voter_id, teacher_id) DO UPDATE SET tier = excluded.tier, round_id = excluded.round_id').bind(hash,row.teacherId,row.tier,round,classId),
          db.prepare('INSERT INTO weekly_votes (voter_id, teacher_id, tier, round_id, week, class_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(voter_id, teacher_id, round_id, week) DO UPDATE SET tier = excluded.tier').bind(hash,row.teacherId,row.tier,round,week,classId),
        ]));
      }
      return json(await results(env,hash,date,classId,await voterHash(id)));
    }catch(error){console.error('Stemmenopslag:',error);return json({error:'De stemmen zijn tijdelijk niet beschikbaar. Probeer opnieuw.'},503);}
  }
  if(request.method!=='GET' && request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const path=url.pathname==='/'?'/index.html':['/admin','/admin/'].includes(url.pathname)?'/admin.html':url.pathname;
  if(!Object.hasOwn(assets,path))return new Response('Pagina niet gevonden',{status:404});
  const type=path.endsWith('.css')?'text/css':path.endsWith('.js')?'application/javascript':'text/html';
  return new Response(request.method==='HEAD'?null:assets[path],{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
}};}
async function uploadPhoto(request,env,date){
  const origin=new URL(request.url).origin;
  if(request.method!=='POST')return json({error:'Gebruik POST.'},405);
  if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Onjuiste herkomst.'},403);
  const id=voterCookie(request);if(!id)return json({error:'Laad eerst je klas.'},409);
  if(!(request.headers.get('content-type')||'').startsWith('multipart/form-data'))return json({error:'Kies een afbeelding.'},415);
  const maximum=4*1024*1024;if(Number(request.headers.get('content-length'))>maximum)return json({error:'De foto is te groot.'},413);
  try{
    if(!env.PHOTOS)return json({error:'Foto-opslag is tijdelijk niet beschikbaar.'},503);
    const reader=request.body.getReader(),chunks=[];let length=0;
    while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>maximum){await reader.cancel();return json({error:'De foto is te groot.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')}}).formData();
    if([...form.keys()].length!==3||[...form.keys()].some(k=>!['photo','classId','teacherId'].includes(k)))return json({error:'Onjuiste upload.'},400);
    const classId=resolveClass(form.get('classId')),teacherId=Number(form.get('teacherId')),file=form.get('photo');
    if(!CLASSES.includes(classId)||!Number.isInteger(teacherId)||teacherId<1||teacherId>7)return json({error:'Onbekende docent of klas.'},400);
    const db=database(env),names=(await classNames(db)).get(classId);if(!names)return json({error:'Stel eerst de klasdocenten in.'},409);
    if(!file||typeof file.arrayBuffer!=='function'||file.size<16||file.size>3*1024*1024)return json({error:'Kies een foto van maximaal 3 MB.'},413);
    const content=new Uint8Array(await file.arrayBuffer());const ascii=(start,end)=>String.fromCharCode(...content.slice(start,end));
    const type=content[0]===0x89&&ascii(1,4)==='PNG'&&content[4]===13&&content[5]===10&&content[6]===26&&content[7]===10?'image/png':content[0]===255&&content[1]===216&&content[2]===255?'image/jpeg':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null;
    if(!type||file.type!==type)return json({error:'Alleen echte JPG-, PNG- en WebP-foto’s zijn toegestaan.'},415);
    const nameKey=normalizeName(names[teacherId-1]),ownerHash=await voterHash(id);
    const [prior]=await db.batch([db.prepare('SELECT object_key, owner_hash, uploaded_at FROM teacher_photos WHERE name_key = ?').bind(nameKey)]);const old=prior.results[0];
    const admin=await authenticated(request,env,date);
    if(old&&old.owner_hash!==ownerHash&&!admin)return json({error:'Deze foto kan alleen door de uploader of een admin worden vervangen.'},403);
    if(old&&!admin&&date.getTime()-old.uploaded_at<30000)return json({error:'Wacht even voordat je de foto opnieuw vervangt.'},429);
    const key=crypto.randomUUID();await env.PHOTOS.put('teachers/'+key,content,{httpMetadata:{contentType:type}});
    try{await db.batch([db.prepare('INSERT INTO teacher_photos (name_key, object_key, owner_hash, uploaded_at) VALUES (?, ?, ?, ?) ON CONFLICT(name_key) DO UPDATE SET object_key = excluded.object_key, uploaded_at = excluded.uploaded_at WHERE teacher_photos.owner_hash = excluded.owner_hash OR ? = 1').bind(nameKey,key,ownerHash,date.getTime(),admin?1:0)]);const [saved]=await db.batch([db.prepare('SELECT object_key FROM teacher_photos WHERE name_key = ?').bind(nameKey)]);if(saved.results[0].object_key!==key){await env.PHOTOS.delete('teachers/'+key);return json({error:'Iemand heeft net een foto toegevoegd. Vernieuw je klas.'},409);}}catch(error){await env.PHOTOS.delete('teachers/'+key);throw error;}
    if(old)await env.PHOTOS.delete('teachers/'+old.object_key).catch(()=>{});
    return json({saved:true,photo:{teacherId,url:'/photos/'+key,canReplace:true}});
  }catch(error){console.error('Foto-upload mislukt:',error.message);return json({error:'Foto opslaan mislukt. Probeer opnieuw.'},503);}
}
