import {CLASS_IDS} from '../public/classes.js';
import {digest,authenticated,passwordHash,randomToken} from './admin.js';
export const FIRST_YEAR='2026-2027';
const featureJson=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function yearsState(db){const [rows]=await db.batch([db.prepare('SELECT year FROM school_years ORDER BY year DESC')]);const years=[...new Set([FIRST_YEAR,...rows.results.map(r=>r.year)])].sort().reverse();return {years,currentYear:years[0]};}
// Preserve legacy IDs and ballots. Later school years namespace stored class IDs;
// the API always exposes the original class IDs. Only these five tables are scoped.
export function schoolDatabase(db,year){
 const prefix=year===FIRST_YEAR?'':year+':';
 function prepare(sql,values=[]){const scoped=/\b(votes|weekly_votes|duels|class_settings|class_rounds|favorites)\b/.test(sql);let raw=db.prepare(sql);if(values.length)raw=raw.bind(...values.map(v=>scoped&&CLASS_IDS.includes(v)?prefix+v:v));return {raw,scoped,bind(...v){return prepare(sql,v);}};}
 return {prepare,async batch(statements){const rows=await db.batch(statements.map(s=>s.raw));return rows.map((r,i)=>({...r,results:!statements[i].scoped?r.results:r.results.filter(row=>!Object.hasOwn(row,'class_id')||(prefix?row.class_id.startsWith(prefix):CLASS_IDS.includes(row.class_id))).map(row=>({...row,...(Object.hasOwn(row,'class_id')?{class_id:row.class_id.slice(prefix.length)}:{})}))}));}};
}
export async function yearEnvironment(request,env,initialRound){const state=await yearsState(env.DB);const year=new URL(request.url).searchParams.get('year')||state.currentYear;if(!state.years.includes(year))throw new Error('Onbekend schooljaar.');return {...env,RAW_DB:env.DB,DB:schoolDatabase(env.DB,year),YEAR:{...state,year,archived:year!==state.currentYear,initialRound:year===FIRST_YEAR?initialRound:initialRound+':'+year}};}
export async function favoriteData(db,classId,round,voter,visible){const [mine,counts]=await db.batch([db.prepare('SELECT teacher_id FROM favorites WHERE class_id = ? AND round_id = ? AND voter_id = ?').bind(classId,round,voter),db.prepare('SELECT teacher_id, COUNT(*) AS count FROM favorites WHERE class_id = ? AND round_id = ? GROUP BY teacher_id').bind(classId,round)]);return {myFavorite:mine.results[0]?.teacher_id||null,favoriteResults:visible?counts.results:[]};}
export async function moderationState(env){const [rows]=await env.DB.batch([env.DB.prepare("SELECT object_key, teacher_name, uploaded_at FROM photo_submissions WHERE status = 'pending' ORDER BY uploaded_at")]);return rows.results.map(r=>({key:r.object_key,name:r.teacher_name,url:'/photos/'+r.object_key,uploadedAt:r.uploaded_at}));}
export async function moderatePhoto(env,body,date){
 if(!/^[a-f0-9-]{36}$/.test(body.key||'')||!['approve','reject'].includes(body.action)||Object.keys(body).some(k=>!['key','action'].includes(k)))return featureJson({error:'Kies een foto en een geldige actie.'},400);
 const [rows]=await env.DB.batch([env.DB.prepare("SELECT * FROM photo_submissions WHERE object_key = ? AND status = 'pending'").bind(body.key)]);const row=rows.results[0];if(!row)return featureJson({error:'Deze foto is al beoordeeld.'},409);
 if(body.action==='approve')await env.DB.batch([env.DB.prepare("INSERT INTO teacher_photos (name_key, object_key, owner_hash, uploaded_at) SELECT name_key, object_key, owner_hash, uploaded_at FROM photo_submissions WHERE object_key = ? AND status = 'pending' ON CONFLICT(name_key) DO UPDATE SET object_key = excluded.object_key, owner_hash = excluded.owner_hash, uploaded_at = excluded.uploaded_at").bind(body.key),env.DB.prepare("UPDATE photo_submissions SET status = 'approved' WHERE object_key = ? AND status = 'pending'").bind(body.key)]);
 else await env.DB.batch([env.DB.prepare("UPDATE photo_submissions SET status = 'rejected' WHERE object_key = ? AND status = 'pending'").bind(body.key)]);
 return featureJson({reviewed:true,pendingPhotos:await moderationState(env)});
}
function memberCookie(request){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('docente_member='))?.slice(15)||'';}
export async function memberAccount(request,env,date){const token=memberCookie(request);if(!/^[a-f0-9]{64}$/.test(token))return null;const [rows]=await env.DB.batch([env.DB.prepare('SELECT a.id, a.email FROM member_sessions s JOIN member_accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(await digest(token),Math.floor(date.getTime()/1000))]);return rows.results[0]||null;}
export async function handleMember(request,env,date){
 const url=new URL(request.url),account=await memberAccount(request,env,date),path=url.pathname;
 if(path==='/api/account/state'&&request.method==='GET')return featureJson({authenticated:!!account,...(account?{email:account.email}:{})});
 if(path==='/api/account/tierlist'&&request.method==='GET'){
  if(!account)return featureJson({error:'Log eerst in.'},401);const classId=url.searchParams.get('classId');if(!CLASS_IDS.includes(classId))return featureJson({error:'Onbekende klas.'},400);
  const [rows]=await env.DB.batch([env.DB.prepare('SELECT ranking FROM saved_tierlists WHERE account_id = ? AND school_year = ? AND class_id = ?').bind(account.id,env.YEAR.year,classId)]);return featureJson({ranking:rows.results[0]?JSON.parse(rows.results[0].ranking):null});
 }
 if(request.method!=='POST')return featureJson({error:'Gebruik POST.'},405);
 if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return featureJson({error:'Onjuiste herkomst.'},403);
 if(!(request.headers.get('content-type')||'').startsWith('application/json'))return featureJson({error:'Gebruik JSON.'},415);
 const text=await request.text();if(text.length>4096)return featureJson({error:'Invoer te groot.'},413);let body;try{body=JSON.parse(text);}catch{return featureJson({error:'Onjuiste invoer.'},400);}if(!body||typeof body!=='object'||Array.isArray(body))return featureJson({error:'Onjuiste invoer.'},400);
 const cookie=(token,age=2592000)=>`docente_member=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${url.protocol==='https:'?'; Secure':''}`;
 if(path==='/api/account/register'||path==='/api/account/login'){
  const register=path.endsWith('/register'),email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(Object.keys(body).some(k=>!['email','password'].includes(k))||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof body.password!=='string'||body.password.length>256||body.password.length<(register?12:1))return featureJson({error:'Gebruik een geldig e-mailadres en bij registratie minstens 12 tekens voor je wachtwoord.'},400);
  const seconds=Math.floor(date.getTime()/1000),window=Math.floor(seconds/900)*900,bucket=await digest('member:'+(request.headers.get('cf-connecting-ip')||'local')+':'+window);
  await env.DB.batch([env.DB.prepare('DELETE FROM admin_attempts WHERE window_start < ?').bind(window-900),env.DB.prepare('INSERT INTO admin_attempts (bucket, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1').bind(bucket,window)]);
  const [attempts]=await env.DB.batch([env.DB.prepare('SELECT attempts FROM admin_attempts WHERE bucket = ?').bind(bucket)]);if(attempts.results[0].attempts>8)return featureJson({error:'Te veel pogingen. Probeer over 15 minuten opnieuw.'},429);
  const [rows]=await env.DB.batch([env.DB.prepare('SELECT id, email, password_hash, salt FROM member_accounts WHERE email = ?').bind(email)]);let user=rows.results[0];
  if(register){if(user)return featureJson({error:'Dit e-mailadres is al geregistreerd. Log in.'},409);const salt=randomToken(),id=crypto.randomUUID();await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO member_accounts (id, email, password_hash, salt) VALUES (?, ?, ?, ?)').bind(id,email,await passwordHash(body.password,salt),salt)]);const [saved]=await env.DB.batch([env.DB.prepare('SELECT id, email FROM member_accounts WHERE email = ?').bind(email)]);user=saved.results[0];if(user.id!==id)return featureJson({error:'Dit e-mailadres is al geregistreerd.'},409);}
  else {const hash=await passwordHash(body.password,user?.salt||'0'.repeat(64));if(!user||hash!==user.password_hash)return featureJson({error:'E-mail of wachtwoord klopt niet.'},401);}
  const token=randomToken();await env.DB.batch([env.DB.prepare('DELETE FROM member_sessions WHERE expires_at <= ?').bind(seconds),env.DB.prepare('INSERT INTO member_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token),user.id,seconds+2592000)]);return featureJson({authenticated:true,email},200,{'Set-Cookie':cookie(token)});
 }
 if(path==='/api/account/logout'){await env.DB.batch([env.DB.prepare('DELETE FROM member_sessions WHERE token_hash = ?').bind(await digest(memberCookie(request)))]);return featureJson({authenticated:false},200,{'Set-Cookie':cookie('',0)});}
 if(!account)return featureJson({error:'Log eerst in.'},401);
 if(path==='/api/account/tierlist'){
  const ranks=body.ranking;if(Object.keys(body).some(k=>!['classId','ranking'].includes(k))||!CLASS_IDS.includes(body.classId)||!Array.isArray(ranks)||ranks.length!==7||new Set(ranks.map(r=>r?.teacherId)).size!==7||ranks.some(r=>!r||!Number.isInteger(r.teacherId)||r.teacherId<1||r.teacherId>7||!['S','A','B','C','D','F','unranked'].includes(r.tier)||Object.keys(r).some(k=>!['teacherId','tier'].includes(k))))return featureJson({error:'Ongeldige tierlist.'},400);
  if(env.YEAR.archived)return featureJson({error:'Dit schooljaar is gearchiveerd.'},409);
  await env.DB.batch([env.DB.prepare('INSERT INTO saved_tierlists (account_id, school_year, class_id, ranking) VALUES (?, ?, ?, ?) ON CONFLICT(account_id, school_year, class_id) DO UPDATE SET ranking = excluded.ranking').bind(account.id,env.YEAR.year,body.classId,JSON.stringify(ranks))]);return featureJson({saved:true});
 }
 return featureJson({error:'Onbekende accountactie.'},404);
}
