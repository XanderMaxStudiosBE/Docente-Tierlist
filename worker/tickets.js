import {memberAccount} from './features.js';
import {authenticated,digest} from './admin.js';
import {resolveClass} from '../public/classes.js';
const ticketJson=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const ticketCategories=['suggestion','complaint','bug'],ticketStatuses=['open','in_progress','closed'];
const ticketFields='id, account_id, category, title, class_id, school_year, status, created_at, updated_at, revision';
function ticketRecord(row){return {id:row.id,category:row.category,title:row.title,classId:row.class_id,schoolYear:row.school_year,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,revision:row.revision};}
async function ticketRate(db,account,date,action,limit){const window=Math.floor(date.getTime()/900000)*900,bucket=await digest('tickets:'+action+':'+account.id+':'+window);await db.batch([db.prepare('DELETE FROM admin_attempts WHERE window_start < ?').bind(window-900),db.prepare('INSERT INTO admin_attempts (bucket, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1').bind(bucket,window)]);const [rows]=await db.batch([db.prepare('SELECT attempts FROM admin_attempts WHERE bucket = ?').bind(bucket)]);return rows.results[0].attempts<=limit;}
async function ticketDetail(db,id,account,admin){const [rows]=await db.batch([db.prepare(`SELECT ${ticketFields} FROM support_tickets WHERE id = ?${admin?'':' AND account_id = ?'}`).bind(id,...(admin?[]:[account.id]))]);if(!rows.results[0])return null;const [messages]=await db.batch([db.prepare('SELECT id, author, message, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at, id').bind(id)]);return {...ticketRecord(rows.results[0]),messages:messages.results.map(row=>({id:row.id,author:row.author,message:row.message,createdAt:row.created_at}))};}
export async function handleTickets(request,env,date){
 const url=new URL(request.url),admin=url.pathname.startsWith('/api/admin/tickets'),base=admin?'/api/admin/tickets':'/api/tickets',suffix=url.pathname.slice(base.length),db=env.RAW_DB||env.DB;
 try{
  const account=admin?null:await memberAccount(request,env,date);
  if(admin?!await authenticated(request,env,date):!account)return ticketJson({error:admin?'Log eerst in als admin.':'Log in om je tickets te bekijken of een ticket te starten.'},401);
  if(suffix&&!/^\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(suffix))return ticketJson({error:'Ticket niet gevonden.'},404);
  const id=suffix.slice(1);
  if(request.method==='GET'){
   if(id){const ticket=await ticketDetail(db,id,account,admin);return ticket?ticketJson({ticket}):ticketJson({error:'Ticket niet gevonden.'},404);}
   const status=url.searchParams.get('status')||'all',cursor=url.searchParams.get('cursor');
   if(status!=='all'&&!ticketStatuses.includes(status)||cursor&&!/^\d{13}:[a-f0-9-]{36}$/.test(cursor))return ticketJson({error:'Ongeldige ticketfilter.'},400);
   const filters=[],bindings=[];
   if(!admin){filters.push('account_id = ?');bindings.push(account.id);}
   if(status!=='all'){filters.push('status = ?');bindings.push(status);}
   if(cursor){const [time,lastId]=cursor.split(':');filters.push('(created_at < ? OR (created_at = ? AND id < ?))');bindings.push(Number(time),Number(time),lastId);}
   const [rows]=await db.batch([db.prepare(`SELECT ${ticketFields} FROM support_tickets${filters.length?' WHERE '+filters.join(' AND '):''} ORDER BY created_at DESC, id DESC LIMIT 26`).bind(...bindings)]);
   const tickets=rows.results.slice(0,25).map(ticketRecord),last=tickets.at(-1);return ticketJson({tickets,nextCursor:rows.results.length>25?last.createdAt+':'+last.id:null});
  }
  if(request.method!=='POST')return ticketJson({error:'Gebruik GET of POST.'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return ticketJson({error:'Onjuiste herkomst.'},403);
  if(!(request.headers.get('content-type')||'').startsWith('application/json'))return ticketJson({error:'Gebruik JSON.'},415);
  const raw=await request.text();if(raw.length>10000)return ticketJson({error:'Invoer te groot.'},413);
  let body;try{body=JSON.parse(raw);}catch{return ticketJson({error:'Onjuiste invoer.'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return ticketJson({error:'Onjuiste invoer.'},400);
  const message=typeof body.message==='string'?body.message.trim():'';
  if(!id){
   if(admin)return ticketJson({error:'Start een ticket via Feedback.'},405);
   const title=typeof body.title==='string'?body.title.trim():'',classId=resolveClass(body.classId);
   if(Object.keys(body).some(key=>!['title','message','category','classId'].includes(key))||!classId||!ticketCategories.includes(body.category)||title.length<3||title.length>100||message.length<10||message.length>4000)return ticketJson({error:'Vul een onderwerp (3–100 tekens) en een beschrijving (10–4000 tekens) in.'},400);
   if(!await ticketRate(db,account,date,'create',5))return ticketJson({error:'Je hebt al 5 tickets gestart in 15 minuten. Probeer later opnieuw.'},429);
   const ticketId=crypto.randomUUID(),now=date.getTime();await db.batch([
    db.prepare('INSERT INTO support_tickets (id, account_id, category, title, class_id, school_year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(ticketId,account.id,body.category,title,classId,env.YEAR.year,now,now),
    db.prepare('INSERT INTO ticket_messages (id, ticket_id, author, message, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(),ticketId,'member',message,now),
   ]);return ticketJson({ticket:await ticketDetail(db,ticketId,account,false)},201);
  }
  const ticket=await ticketDetail(db,id,account,admin);if(!ticket)return ticketJson({error:'Ticket niet gevonden.'},404);
  if(Object.keys(body).some(key=>!(admin?['message','status','revision']:['message','revision']).includes(key))||!Number.isInteger(body.revision)||body.revision!==ticket.revision||message.length>4000)return ticketJson({error:'Dit ticket is gewijzigd of de invoer is ongeldig. Vernieuw het ticket.'},409);
  const status=admin?body.status:ticket.status;
  if(admin?!ticketStatuses.includes(status):!message)return ticketJson({error:admin?'Kies een geldige status.':'Vul een bericht in.'},400);
  if(!admin&&status==='closed')return ticketJson({error:'Dit ticket is afgesloten. Start een nieuw ticket als je nog hulp nodig hebt.'},409);
  if(message&&ticket.messages.length>=200)return ticketJson({error:'Dit ticket heeft het maximum aantal berichten. Start een nieuw ticket.'},409);
  if(!admin&&!await ticketRate(db,account,date,'reply',20))return ticketJson({error:'Te veel berichten. Probeer over 15 minuten opnieuw.'},429);
  const action=crypto.randomUUID(),now=date.getTime(),statements=[db.prepare('UPDATE support_tickets SET status = ?, updated_at = ?, revision = revision + 1, last_action = ? WHERE id = ? AND revision = ?').bind(status,now,action,id,body.revision)];
  if(message)statements.push(db.prepare('INSERT INTO ticket_messages (id, ticket_id, author, message, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM support_tickets WHERE id = ? AND last_action = ?)').bind(crypto.randomUUID(),id,admin?'admin':'member',message,now,id,action));
  statements.push(db.prepare('SELECT last_action FROM support_tickets WHERE id = ?').bind(id));const changed=await db.batch(statements);
  if(changed.at(-1).results[0].last_action!==action)return ticketJson({error:'Dit ticket is intussen gewijzigd. Vernieuw het ticket.'},409);
  return ticketJson({ticket:await ticketDetail(db,id,account,admin)});
 }catch(error){console.error('Tickets:',error.message);return ticketJson({error:'Tickets zijn tijdelijk niet beschikbaar. Je invoer blijft staan; probeer opnieuw.'},503);}
}
