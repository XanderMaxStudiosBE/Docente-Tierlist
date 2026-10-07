import {yearsState,classTeachers} from './features.js';
import {DEFAULT_CLASS,DEFAULT_TEACHER_NAMES,validTeacherNames,resolveClass} from '../public/classes.js';
const adminCookieName='docente_admin';
const authJson=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export async function digest(value){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function randomToken(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
export async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(salt.match(/../g).map(v=>parseInt(v,16))),iterations:100000},key,256));}
function cookieValue(request){return request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(adminCookieName+'='))?.slice(adminCookieName.length+1)||'';}
function authCookie(request,token,maxAge=86400){return `${adminCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function activeRounds(db,classes,initialRound){const [rows]=await db.batch([db.prepare('SELECT class_id, round_id FROM class_rounds')]);return new Map(classes.map(id=>[id,rows.results.find(r=>r.class_id===id)?.round_id||initialRound]));}
export async function authenticated(request,env,now){const token=cookieValue(request);if(!/^[a-f0-9]{64}$/.test(token))return false;const [sessions]=await env.DB.batch([env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').bind(await digest(token),Math.floor(now.getTime()/1000))]);return sessions.results.length===1;}
async function summary(env,date,classes,initialRound){const rounds=await activeRounds(env.DB,classes,initialRound);const [settings,counts,duels]=await env.DB.batch([env.DB.prepare('SELECT class_id, teacher_names FROM class_settings'),env.DB.prepare('SELECT class_id, round_id, COUNT(DISTINCT voter_id) AS count FROM votes GROUP BY class_id, round_id'),env.DB.prepare('SELECT class_id, round_id, COUNT(*) AS count FROM duels GROUP BY class_id, round_id')]);return classes.map(classId=>{const saved=settings.results.find(r=>r.class_id===classId),teacherNames=saved?JSON.parse(saved.teacher_names):classId===DEFAULT_CLASS?DEFAULT_TEACHER_NAMES:null;return {classId,teacherNames,teacherCount:teacherNames?.length||0,roundId:rounds.get(classId),configured:!!teacherNames,votes:counts.results.find(r=>r.class_id===classId&&r.round_id===rounds.get(classId))?.count||0,duels:duels.results.find(r=>r.class_id===classId&&r.round_id===rounds.get(classId))?.count||0};});}
export async function handleAdmin(request,env,date,classes,initialRound){
  const url=new URL(request.url);const db=env.DB;if(!db)return authJson({error:'Adminopslag tijdelijk niet beschikbaar.'},503);
  try{
    const [accountResult]=await db.batch([db.prepare('SELECT email, password_hash, salt FROM admin_account WHERE id = 1')]);const account=accountResult.results[0];
    const signedIn=await authenticated(request,env,date);
    if(url.pathname==='/api/admin/state' && request.method==='GET')return authJson({configured:!!account,authenticated:signedIn,...(signedIn?{email:account.email,classes:await summary(env,date,classes,initialRound),...env.YEAR}:{})});
    if(request.method!=='POST')return authJson({error:'Gebruik POST.'},405,{Allow:'POST'});
    if(request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site')return authJson({error:'Onjuiste herkomst.'},403);
    if(!(request.headers.get('content-type')||'').startsWith('application/json'))return authJson({error:'Gebruik JSON.'},415);
    const raw=await request.text();if(raw.length>8192)return authJson({error:'Invoer te groot.'},413);let body;try{body=JSON.parse(raw);}catch{return authJson({error:'Onjuiste invoer.'},400);}if(!body||typeof body!=='object'||Array.isArray(body))return authJson({error:'Onjuiste invoer.'},400);
    const seconds=Math.floor(date.getTime()/1000);
    if(url.pathname==='/api/admin/setup' || url.pathname==='/api/admin/login'){
      const setup=url.pathname.endsWith('/setup');
      if(setup){const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(account||!env.ADMIN_SETUP_HASH||!equal(await digest(token),env.ADMIN_SETUP_HASH))return authJson({error:'Deze instellink is ongeldig of al gebruikt.'},403);}
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      if(Object.keys(body).some(k=>!['email','password'].includes(k))||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof body.password!=='string'||body.password.length>256||body.password.length<(setup?12:1))return authJson({error:setup?'Vul een geldig e-mailadres en een wachtwoord van minstens 12 tekens in.':'Vul e-mail en wachtwoord in.'},400);
      const windowStart=Math.floor(seconds/900)*900;const bucket=await digest((request.headers.get('cf-connecting-ip')||'local')+':'+windowStart);
      await db.batch([db.prepare('DELETE FROM admin_attempts WHERE window_start < ?').bind(windowStart-900),db.prepare('INSERT INTO admin_attempts (bucket, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1').bind(bucket,windowStart)]);
      const [attempts]=await db.batch([db.prepare('SELECT attempts FROM admin_attempts WHERE bucket = ?').bind(bucket)]);if(attempts.results[0].attempts>8)return authJson({error:'Te veel inlogpogingen. Probeer over 15 minuten opnieuw.'},429,{'Retry-After':'900'});
      if(setup){const salt=randomToken();const hash=await passwordHash(body.password,salt);await db.batch([db.prepare('INSERT OR IGNORE INTO admin_account (id, email, password_hash, salt) VALUES (1, ?, ?, ?)').bind(email,hash,salt)]);const [saved]=await db.batch([db.prepare('SELECT password_hash FROM admin_account WHERE id = 1')]);if(saved.results[0].password_hash!==hash)return authJson({error:'Het adminaccount is al ingesteld.'},409);}
      else{const computed=await passwordHash(body.password,account?.salt||'0'.repeat(64));if(!account||email!==account.email||!equal(computed,account.password_hash))return authJson({error:'E-mail of wachtwoord klopt niet.'},401);}
      const token=randomToken();await db.batch([db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(seconds),db.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').bind(await digest(token),seconds+86400)]);
      return authJson({authenticated:true,email,classes:await summary(env,date,classes,initialRound)},200,{'Set-Cookie':authCookie(request,token)});
    }
    if(url.pathname==='/api/admin/logout'){const token=cookieValue(request);if(token)await db.batch([db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await digest(token))]);return authJson({authenticated:false},200,{'Set-Cookie':authCookie(request,'',0)});}
    if(!signedIn)return authJson({error:'Log eerst in als admin.'},401);
    if(url.pathname==='/api/admin/teachers'){
      if(env.YEAR.archived)return authJson({error:'De docenten van een gearchiveerd schooljaar kunnen niet worden gewijzigd.'},409);
      const classId=resolveClass(body.classId);
      if(!classId||Object.keys(body).some(k=>!['classId','teacherNames','roundId','confirm'].includes(k))||body.confirm!=='UPDATE_TEACHERS'||!validTeacherNames(body.teacherNames))return authJson({error:'Kies 1 tot 30 verschillende docentnamen en bevestig de nieuwe stemronde.'},400);
      const current=(await activeRounds(db,classes,initialRound)).get(classId);
      if(body.roundId!==current)return authJson({error:'De klas is intussen gewijzigd. Vernieuw het adminpaneel.'},409);
      const oldNames=await classTeachers(db,classId),names=body.teacherNames.map(n=>n.normalize('NFC').trim().replace(/\s+/g,' '));
      if(JSON.stringify(oldNames)===JSON.stringify(names))return authJson({updated:false,classes:await summary(env,date,classes,initialRound)});
      const round='round-'+crypto.randomUUID();
      // The round guard prevents an older admin form from overwriting a newer edit.
      const guard='? = COALESCE((SELECT round_id FROM class_rounds WHERE class_id = ?), ?)';
      await db.batch([
        db.prepare('UPDATE saved_tierlists SET teacher_names = ? WHERE school_year = ? AND class_id = ? AND teacher_names IS NULL').bind(JSON.stringify(oldNames),env.YEAR.year,classId),
        db.prepare(`INSERT INTO class_settings (class_id, teacher_names) SELECT ?, ? WHERE ${guard} ON CONFLICT(class_id) DO UPDATE SET teacher_names = excluded.teacher_names`).bind(classId,JSON.stringify(names),current,classId,initialRound),
        db.prepare(`INSERT INTO class_rounds (class_id, round_id) SELECT ?, ? WHERE ${guard} ON CONFLICT(class_id) DO UPDATE SET round_id = excluded.round_id`).bind(classId,round,current,classId,initialRound),
      ]);
      if((await activeRounds(db,classes,initialRound)).get(classId)!==round)return authJson({error:'De klas is intussen gewijzigd. Vernieuw het adminpaneel.'},409);
      return authJson({updated:true,classes:await summary(env,date,classes,initialRound)});
    }
    if(url.pathname==='/api/admin/year'){
      if(Object.keys(body).some(k=>k!=='confirm')||body.confirm!=='NEW_YEAR')return authJson({error:'Bevestig het nieuwe schooljaar.'},400);
      const state=await yearsState(env.RAW_DB);const start=Number(state.currentYear.slice(0,4))+1;const year=start+'-'+(start+1);
      if(start>2100)return authJson({error:'Geen nieuw schooljaar beschikbaar.'},400);
      await env.RAW_DB.batch([env.RAW_DB.prepare('INSERT OR IGNORE INTO school_years (year) VALUES (?)').bind(year)]);return authJson({created:true,...await yearsState(env.RAW_DB)});
    }
    if(url.pathname==='/api/admin/reset'){
      if(env.YEAR.archived)return authJson({error:'Een gearchiveerd schooljaar kan niet worden gereset.'},409);
      const classId=body.classId==='all'?'all':resolveClass(body.classId);
      if(Object.keys(body).some(k=>!['classId','confirm'].includes(k))||body.confirm!=='RESET'||!['all',...classes].includes(classId))return authJson({error:'Kies een klas en bevestig de reset.'},400);
      const chosen=classId==='all'?classes:[classId];
      await db.batch(chosen.map(classId=>db.prepare('INSERT INTO class_rounds (class_id, round_id) VALUES (?, ?) ON CONFLICT(class_id) DO UPDATE SET round_id = excluded.round_id').bind(classId,'round-'+crypto.randomUUID())));
      return authJson({reset:true,classes:await summary(env,date,classes,initialRound)});
    }
    return authJson({error:'Onbekende adminactie.'},404);
  }catch(error){console.error('Adminactie mislukt:',error.message);return authJson({error:'Adminactie tijdelijk niet beschikbaar. Probeer opnieuw.'},503);}
}
