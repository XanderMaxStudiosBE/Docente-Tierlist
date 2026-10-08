import {CLASS_IDS,DEFAULT_CLASS,resolveClass} from '../public/classes.js';
import {FIRST_YEAR,memberAccount} from './features.js';
import {digest} from './admin.js';

const votingCookieName='docente_voter';
export function voterCookie(request){const value=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(votingCookieName+'='))?.slice(votingCookieName.length+1);return /^[a-f0-9-]{36}$/.test(value||'')?value:null;}
export function voterCookieHeader(id,url){return `${votingCookieName}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`;}
export function scopedVoter(id,classId,year=FIRST_YEAR){const scoped=classId===DEFAULT_CLASS?id:id+':'+classId;return digest(year===FIRST_YEAR?scoped:scoped+':'+year);}
const membershipJson=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const rawMembershipDb=env=>env.RAW_DB||env.DB;
const storedClass=(classId,year)=>year===FIRST_YEAR?classId:year+':'+classId;

export async function votingMembership(request,env,date,id=voterCookie(request)){
  const account=await memberAccount(request,env,date),browserKey=id?'browser:'+await digest(id):null,memberKey=account?'member:'+account.id:null;
  const keys=[browserKey,memberKey].filter(Boolean),db=rawMembershipDb(env);
  const rows=keys.length?(await db.batch(keys.map(key=>db.prepare('SELECT class_id, revision FROM voting_memberships WHERE owner_id = ? AND school_year = ?').bind(key,env.YEAR.year)))).map(r=>r.results[0]||null):[];
  const browser=browserKey?rows[0]:null,member=memberKey?rows[browserKey?1:0]:null;
  const classId=member?.class_id||browser?.class_id||null;
  const needsSync=!!(member&&browser&&member.class_id!==browser.class_id);
  return {account,browserKey,memberKey,browser,member,id,year:env.YEAR.year,archived:env.YEAR.archived,classId,needsSync};
}
export function membershipData(context){return {classId:context.classId,browserClassId:context.browser?.class_id||null,revision:context.member?.revision||null,browserRevision:context.browser?.revision||null,authenticated:!!context.account,needsSync:context.needsSync,year:context.year,archived:context.archived};}
function rowGuard(key,row,year){return row?{sql:'EXISTS (SELECT 1 FROM voting_memberships WHERE owner_id = ? AND school_year = ? AND revision = ?)',args:[key,year,row.revision]}:{sql:'NOT EXISTS (SELECT 1 FROM voting_memberships WHERE owner_id = ? AND school_year = ?)',args:[key,year]};}
function joinGuards(guards){return {sql:guards.map(g=>'('+g.sql+')').join(' AND '),args:guards.flatMap(g=>g.args)};}
// Changing class always changes revision. Owner/year/revision guards therefore
// avoid class parameters that the legacy school-year adapter would namespace.
export function votingGuard(context){return joinGuards([context.browserKey,context.memberKey].filter(Boolean).map(key=>({sql:'EXISTS (SELECT 1 FROM voting_memberships WHERE owner_id = ? AND school_year = ? AND revision = ?)',args:[key,context.year,key===context.browserKey?context.browser?.revision:context.member?.revision]})));}
export function guardedVote(db,context,sql,values){const guard=votingGuard(context);const guarded=sql.replace(/VALUES\s*\([\s?,]+\)/,'SELECT '+values.map(()=>'?').join(', ')+' WHERE '+guard.sql);if(guarded===sql)throw new Error('Voting statement has no VALUES clause.');return db.prepare(guarded).bind(...values,...guard.args);}
export function votingLinkStatements(env,context,classId,voter){const db=env.DB,guard=votingGuard(context);return [context.browserKey,context.memberKey].filter(Boolean).map(key=>db.prepare('INSERT INTO class_voter_links (owner_id, school_year, class_id, voter_id) SELECT ?, ?, ?, ? WHERE '+guard.sql+' ON CONFLICT(owner_id, school_year, class_id, voter_id) DO NOTHING').bind(key,context.year,classId,voter,...guard.args));}

export async function changeVotingClass(request,env,date,context,classId,confirmed=false){
  const db=rawMembershipDb(env),year=context.year,token=crypto.randomUUID();
  const oldGuard=joinGuards([rowGuard(context.browserKey,context.browser,year),...(context.memberKey?[rowGuard(context.memberKey,context.member,year)]:[])]);
  const leaving=[context.browser?.class_id,context.member?.class_id].filter(id=>id&&id!==classId);
  if(leaving.length&&!confirmed)return {error:'Bij het wisselen worden je stemmen in je vorige klas verwijderd. Bevestig eerst.',status:409};
  const statements=[db.prepare('INSERT INTO voting_memberships (owner_id, school_year, class_id, revision) SELECT ?, ?, ?, ? WHERE '+oldGuard.sql+' ON CONFLICT(owner_id, school_year) DO UPDATE SET class_id = excluded.class_id, revision = excluded.revision').bind(context.browserKey,year,classId,token,...oldGuard.args)];
  const newBrowser={sql:'EXISTS (SELECT 1 FROM voting_memberships WHERE owner_id = ? AND school_year = ? AND revision = ?)',args:[context.browserKey,year,token]};
  if(context.memberKey){const guard=joinGuards([newBrowser,rowGuard(context.memberKey,context.member,year)]);statements.push(db.prepare('INSERT INTO voting_memberships (owner_id, school_year, class_id, revision) SELECT ?, ?, ?, ? WHERE '+guard.sql+' ON CONFLICT(owner_id, school_year) DO UPDATE SET class_id = excluded.class_id, revision = excluded.revision').bind(context.memberKey,year,classId,token,...guard.args));}
  const changed=joinGuards([newBrowser,...(context.memberKey?[{sql:'EXISTS (SELECT 1 FROM voting_memberships WHERE owner_id = ? AND school_year = ? AND revision = ?)',args:[context.memberKey,year,token]}]:[])]);
  const owners=[context.browserKey,context.memberKey].filter(Boolean),ownerSlots=owners.map(()=>'?').join(', ');
  for(const previous of new Set(leaving)){
    const voter=await scopedVoter(context.id,previous,year),ids='(voter_id = ? OR voter_id IN (SELECT voter_id FROM class_voter_links WHERE school_year = ? AND class_id = ? AND owner_id IN ('+ownerSlots+')))';
    for(const table of ['votes','weekly_votes','duels','favorites'])statements.push(db.prepare('DELETE FROM '+table+' WHERE class_id = ? AND '+ids+' AND '+changed.sql).bind(storedClass(previous,year),voter,year,previous,...owners,...changed.args));
    statements.push(db.prepare('DELETE FROM class_voter_links WHERE school_year = ? AND class_id = ? AND owner_id IN ('+ownerSlots+') AND '+changed.sql).bind(year,previous,...owners,...changed.args));
  }
  const voter=await scopedVoter(context.id,classId,year);
  for(const owner of owners)statements.push(db.prepare('INSERT INTO class_voter_links (owner_id, school_year, class_id, voter_id) SELECT ?, ?, ?, ? WHERE '+changed.sql+' ON CONFLICT(owner_id, school_year, class_id, voter_id) DO NOTHING').bind(owner,year,classId,voter,...changed.args));
  await db.batch(statements);
  const latest=await votingMembership(request,env,date,context.id);
  if(latest.browser?.revision!==token||(context.memberKey&&latest.member?.revision!==token))return {error:'Je klaskeuze is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.',status:409};
  return {data:{...membershipData(latest),switched:leaving.length>0}};
}
export async function handleMembership(request,env,date){
  const url=new URL(request.url),existing=voterCookie(request),id=existing||crypto.randomUUID(),headers=existing?{}:{'Set-Cookie':voterCookieHeader(id,url)};
  const context=await votingMembership(request,env,date,id);
  if(request.method==='GET')return membershipJson(membershipData(context),200,headers);
  if(request.method!=='POST')return membershipJson({error:'Gebruik GET of POST.'},405);
  if(context.archived)return membershipJson({error:'Dit schooljaar is gearchiveerd.'},409);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return membershipJson({error:'Onjuiste herkomst.'},403);
  if(!(request.headers.get('content-type')||'').startsWith('application/json'))return membershipJson({error:'Gebruik JSON.'},415);
  const text=await request.text();if(text.length>1024)return membershipJson({error:'Invoer te groot.'},413);
  let body;try{body=JSON.parse(text);}catch{return membershipJson({error:'Onjuiste invoer.'},400);}
  const classId=resolveClass(body?.classId);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['classId','revision','browserRevision','confirm'].includes(k))||!CLASS_IDS.includes(classId)||typeof body.confirm!=='boolean')return membershipJson({error:'Kies een geldige klas.'},400);
  if(body.revision!==(context.member?.revision||null)||body.browserRevision!==(context.browser?.revision||null))return membershipJson({error:'Je klaskeuze is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.'},409);
  const result=await changeVotingClass(request,env,date,context,classId,body.confirm);
  return result.error?membershipJson({error:result.error},result.status):membershipJson(result.data,200,headers);
}

export async function membershipForVote(request,env,date,classId){
  let context=await votingMembership(request,env,date);
  if(context.classId&&context.classId!==classId||context.needsSync)return {error:'Je kunt alleen stemmen in je eigen klas. Gebruik Mijn klas wijzigen als je verkeerd koos.',status:403};
  if(!context.browser||context.account&&!context.member){const result=await changeVotingClass(request,env,date,context,classId);if(result.error)return result;context=await votingMembership(request,env,date);}
  if(context.classId!==classId||context.needsSync)return {error:'Je klaskeuze is intussen gewijzigd. Vernieuw de pagina.',status:409};
  return {context};
}
export async function membershipStillCurrent(request,env,date,context){const now=await votingMembership(request,env,date);return now.classId===context.classId&&!now.needsSync&&now.browser?.revision===context.browser?.revision&&now.member?.revision===context.member?.revision;}
