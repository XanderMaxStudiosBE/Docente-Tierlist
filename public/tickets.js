import {classLabel} from './classes.js';

const categories={suggestion:'Suggestie',complaint:'Klacht',bug:'Bugmelding'};
const statuses={open:'Open',in_progress:'In behandeling',closed:'Afgesloten'};
const dateLabel=value=>new Date(value).toLocaleString('nl-BE',{dateStyle:'medium',timeStyle:'short'});
const ticketLabel=ticket=>ticket.kind==='teacher'?'Docentklacht · '+ticket.teacherName:categories[ticket.category];
function node(tag,className,text){const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=text;return item;}

// Both desks use the same conversation UI; the server checks ownership and admin access.
export function createTicketDesk({root,admin=false,request,getContext=()=>({}),onLogin=()=>{},onAuthExpired=()=>{}}){
  const prefix=admin?'admin-ticket':'feedback-ticket';
  root.classList.add('ticket-desk');
  root.innerHTML=`<div class="ticket-heading"><div><div class="eyebrow">${admin?'SUPPORT':'MAAK DE WEBSITE BETER'}</div><h2>${admin?'Feedback & tickets':'Jouw feedback telt.'}</h2><p>${admin?'Beantwoord tickets uit alle klassen en schooljaren.':'Een idee, een klacht of iets dat niet werkt? Laat het ons weten.'}</p></div><span class="ticket-private">Privé · indiener & admins</span></div>
    ${admin?'':`<nav class="feedback-subtabs" role="tablist" aria-label="Feedbacktype"><button id="${prefix}-general-tab" type="button" role="tab" aria-selected="true" aria-controls="${prefix}-panel" data-kind="general">Algemene feedback</button><button id="${prefix}-teacher-tab" type="button" role="tab" aria-selected="false" aria-controls="${prefix}-panel" tabindex="-1" data-kind="teacher">Voor docenten</button></nav><div id="${prefix}-panel" role="tabpanel" aria-labelledby="${prefix}-general-tab"><div data-teacher-intro class="ticket-teacher-intro" hidden><h3>Een klacht over jouw vermelding of ranking?</h3><p>Ben je docent en wil je iets melden over je naam, vermelding of ranking op deze website? Dien hier een klacht in. Vermeld wat er speelt en wat je graag aangepast ziet.</p><p>Je klacht en de antwoorden zijn alleen zichtbaar voor jou en de admins.</p></div><div class="ticket-categories"><button type="button" data-category="suggestion"><span aria-hidden="true">✦</span><strong>Suggestie</strong><small>Een idee voor de website</small></button><button type="button" data-category="complaint"><span aria-hidden="true">!</span><strong>Klacht</strong><small>Iets melden dat je stoort</small></button><button type="button" data-category="bug"><span aria-hidden="true">⌘</span><strong>Bugmelding</strong><small>Hulp bij een fout</small></button></div>
    <div data-guest class="ticket-guest"><strong>Hou je ticket en onze antwoorden bij.</strong><p>Log in of maak een account aan om een ticket te starten. Alleen jij en de admins kunnen het lezen.</p><button data-login type="button" class="primary-button">Inloggen / account aanmaken</button></div>
    <form data-create class="ticket-form" hidden><h3>Start een ticket</h3><p data-context class="feature-note"></p><div data-teacher-name hidden><label for="${prefix}-teacher-name">Jouw docentnaam</label><input id="${prefix}-teacher-name" name="teacherName" minlength="2" maxlength="100" autocomplete="name" placeholder="Je volledige naam"></div><div class="ticket-fields"><div data-category-field><label for="${prefix}-category">Soort</label><select id="${prefix}-category" name="category"><option value="suggestion">Suggestie</option><option value="complaint">Klacht</option><option value="bug">Bugmelding</option></select></div><div><label for="${prefix}-title">Onderwerp</label><input id="${prefix}-title" name="title" minlength="3" maxlength="100" placeholder="Waar gaat je ticket over?" required></div></div><label for="${prefix}-message">Beschrijving</label><textarea id="${prefix}-message" name="message" minlength="10" maxlength="4000" rows="5" placeholder="Leg uit wat je voorstelt of wat er misgaat. Bij een bug: wat deed je en wat verwachtte je?" required></textarea><p class="feature-note">Deel geen wachtwoorden of andere geheime gegevens.</p><button class="primary-button" type="submit">Ticket starten</button><p data-create-status role="status"></p></form>`}
    <section data-inbox hidden><div class="ticket-list-heading"><h3>${admin?'Alle tickets':'Mijn tickets'}</h3><div class="ticket-filters">${admin?`<label for="${prefix}-kind-filter" class="sr-only">Filter op tickettype</label><select id="${prefix}-kind-filter"><option value="all">Alle tickettypes</option><option value="general">Algemene feedback</option><option value="teacher">Docentklachten</option></select>`:''}<label for="${prefix}-filter" class="sr-only">Filter op status</label><select id="${prefix}-filter"><option value="all">Alle statussen</option><option value="open">Open</option><option value="in_progress">In behandeling</option><option value="closed">Afgesloten</option></select><button data-refresh type="button" class="secondary-button">Vernieuwen</button></div></div><p data-list-status role="status"></p><div data-list class="ticket-list"></div><button data-more type="button" class="secondary-button" hidden>Oudere tickets laden</button></section>${admin?'':'</div>'}
    <dialog data-detail class="ticket-dialog" aria-labelledby="${prefix}-detail-title"><div class="dialog-heading"><h2 id="${prefix}-detail-title"></h2><button data-close class="icon-button" type="button" aria-label="Ticket sluiten">×</button></div><p data-detail-meta class="feature-note"></p><button data-reload class="text-button" type="button">Ticket vernieuwen</button><p data-detail-status role="status"></p><div data-messages class="ticket-messages" aria-label="Gesprek"></div><form data-reply class="ticket-form">${admin?`<label for="${prefix}-status">Status</label><select id="${prefix}-status" name="status"><option value="open">Open</option><option value="in_progress">In behandeling</option><option value="closed">Afgesloten</option></select>`:''}<label for="${prefix}-reply">${admin?'Antwoord (optioneel)':'Jouw antwoord'}</label><textarea id="${prefix}-reply" name="message" rows="4" maxlength="4000" ${admin?'':'required'}></textarea><button class="primary-button" type="submit">${admin?'Antwoord / status bewaren':'Antwoord versturen'}</button><p data-reply-status role="status"></p></form><p data-closed class="feature-note" hidden>Dit ticket is afgesloten. Start een nieuw ticket als je nog hulp nodig hebt.</p></dialog>`;
  const q=selector=>root.querySelector(selector),dialog=q('[data-detail]');
  const base=admin?'/api/admin/tickets':'/api/tickets';
  let identity='',epoch=0,listSequence=0,detailSequence=0,nextCursor=null,currentTicket=null,createBusy=false,replyBusy=false,ticketKind='general';
  const drafts=new Map();
  function applyKind(){
    if(admin)return;const teacher=ticketKind==='teacher';
    root.querySelectorAll('[data-kind]').forEach(tab=>{const selected=tab.dataset.kind===ticketKind;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;});
    q('#'+prefix+'-panel').setAttribute('aria-labelledby',prefix+'-'+ticketKind+'-tab');
    q('.ticket-heading h2').textContent=teacher?'Voor docenten':'Jouw feedback telt.';
    q('.ticket-heading p').textContent=teacher?'Een privé aanspreekpunt voor klachten over jouw vermelding of ranking.':'Een idee, een klacht of iets dat niet werkt? Laat het ons weten.';
    q('[data-teacher-intro]').hidden=!teacher;q('.ticket-categories').hidden=teacher;q('[data-teacher-name]').hidden=!teacher;
    q('#'+prefix+'-teacher-name').required=teacher;q('[data-category-field]').hidden=teacher;if(teacher)q('#'+prefix+'-category').value='complaint';
    q('[data-create] h3').textContent=teacher?'Dien je klacht in':'Start een ticket';
    q('[data-create] button[type=submit]').textContent=teacher?'Klacht insturen':'Ticket starten';
    q('#'+prefix+'-title').placeholder=teacher?'Waarover wil je een klacht indienen?':'Waar gaat je ticket over?';
    q('#'+prefix+'-message').placeholder=teacher?'Leg uit welke vermelding of ranking je bedoelt, wat het probleem is en wat je graag aangepast ziet.':'Leg uit wat je voorstelt of wat er misgaat. Bij een bug: wat deed je en wat verwachtte je?';
    q('[data-guest] strong').textContent=teacher?'Dien je klacht privé in.':'Hou je ticket en onze antwoorden bij.';
    q('[data-guest] p').textContent=teacher?'Log in of maak een account aan om je klacht in te dienen en de antwoorden te volgen. Alleen jij en de admins kunnen het lezen.':'Log in of maak een account aan om een ticket te starten. Alleen jij en de admins kunnen het lezen.';
    q('[data-inbox] h3').textContent=teacher?'Mijn docentklachten':'Mijn tickets';
  }
  function selectKind(kind){
    if(admin||createBusy||kind===ticketKind)return;const form=q('[data-create]');
    drafts.set(ticketKind,Object.fromEntries(['category','teacherName','title','message'].map(name=>[name,form.elements[name].value])));
    ticketKind=kind;form.reset();const draft=drafts.get(kind);if(draft)for(const [name,value] of Object.entries(draft))form.elements[name].value=value;
    q('[data-create-status]').textContent='';q('[data-list]').replaceChildren();nextCursor=null;listSequence++;q('[data-more]').hidden=true;applyKind();refresh();
  }
  function createControls(busy){q('[data-create] button[type=submit]').disabled=busy;root.querySelectorAll('[data-kind]').forEach(tab=>tab.disabled=busy);}
  function updateContext(){if(!admin){const context=getContext();q('[data-context]').textContent=classLabel(context.classId)+' · '+(context.year||'huidig schooljaar');}}
  function setAccount(account){
    const key=account?.authenticated?(account.email||'authenticated'):'';
    if(key===identity){updateContext();return;}
    identity=key;epoch++;listSequence++;detailSequence++;currentTicket=null;nextCursor=null;createBusy=false;replyBusy=false;
    if(dialog.open)dialog.close();q('[data-list]').replaceChildren();q('[data-messages]').replaceChildren();q('[data-reply]').reset();
    q('#'+prefix+'-detail-title').textContent='';q('[data-detail-meta]').textContent='';q('[data-detail-status]').textContent='';q('[data-reply-status]').textContent='';
    if(!admin){drafts.clear();q('[data-create]').reset();q('[data-create-status]').textContent='';createControls(false);q('[data-guest]').hidden=!!key;q('[data-create]').hidden=!key;applyKind();}
    q('[data-inbox]').hidden=!key;q('[data-list-status]').textContent='';q('[data-more]').hidden=true;q('[data-reply] button[type=submit]').disabled=false;
    updateContext();if(key)refresh();
  }
  function failure(error,target){target.textContent=error.message||'Laden mislukt. Probeer opnieuw.';if(error.status===401){setAccount({authenticated:false});onAuthExpired();if(!admin)q('[data-guest] p').textContent='Je sessie is verlopen. Log opnieuw in om je tickets te bekijken.';}}
  function ticketButton(ticket){
    const button=node('button','ticket-row');button.type='button';const content=node('span','ticket-row-content');
    content.append(node('strong','',ticket.title),node('span','ticket-row-meta',ticketLabel(ticket)+' · '+classLabel(ticket.classId)+' · '+ticket.schoolYear+' · '+dateLabel(ticket.createdAt)));
    button.append(content,node('span','ticket-status ticket-status-'+ticket.status,statuses[ticket.status]));button.addEventListener('click',()=>openTicket(ticket.id));return button;
  }
  async function refresh(more=false){
    if(!identity)return;const session=epoch,sequence=++listSequence,filter=q('#'+prefix+'-filter').value;
    const params=new URLSearchParams({status:filter,kind:admin?q('#'+prefix+'-kind-filter').value:ticketKind});if(more&&nextCursor)params.set('cursor',nextCursor);
    q('[data-list-status]').textContent='Tickets laden…';q('[data-refresh]').disabled=true;q('[data-more]').disabled=true;
    try{const data=await request(base+'?'+params);if(session!==epoch||sequence!==listSequence)return;
      if(!more)q('[data-list]').replaceChildren();for(const ticket of data.tickets)q('[data-list]').append(ticketButton(ticket));nextCursor=data.nextCursor;
      q('[data-more]').hidden=!nextCursor;q('[data-list-status]').textContent=q('[data-list]').childElementCount?'':'Nog geen tickets met deze status.';
    }catch(error){if(session===epoch&&sequence===listSequence)failure(error,q('[data-list-status]'));}
    finally{if(session===epoch&&sequence===listSequence){q('[data-refresh]').disabled=false;q('[data-more]').disabled=false;}}
  }
  function renderDetail(ticket,keepDraft=false){
    currentTicket=ticket;q('#'+prefix+'-detail-title').textContent=ticket.title;
    q('[data-detail-meta]').textContent=ticketLabel(ticket)+' · '+statuses[ticket.status]+' · '+classLabel(ticket.classId)+' · '+ticket.schoolYear;
    q('[data-messages]').replaceChildren();for(const message of ticket.messages){const item=node('article','ticket-message ticket-message-'+message.author);
      item.append(node('strong','',message.author==='admin'?'Admin':admin?'Indiener':'Jij'),node('time','',dateLabel(message.createdAt)),node('p','',message.message));q('[data-messages]').append(item);}
    if(!keepDraft)q('[data-reply]').reset();if(admin)q('#'+prefix+'-status').value=ticket.status;
    q('[data-reply]').hidden=!admin&&ticket.status==='closed';q('[data-closed]').hidden=admin||ticket.status!=='closed';
  }
  async function openTicket(id,keepDraft=false){
    if(!identity||replyBusy)return;const session=epoch,sequence=++detailSequence;
    if(!keepDraft){currentTicket=null;q('#'+prefix+'-detail-title').textContent='Ticket laden…';q('[data-detail-meta]').textContent='';q('[data-messages]').replaceChildren();q('[data-reply]').hidden=true;q('[data-closed]').hidden=true;q('[data-reply-status]').textContent='';}
    q('[data-detail-status]').textContent='Laden…';if(!dialog.open)dialog.showModal();
    try{const data=await request(base+'/'+id);if(session!==epoch||sequence!==detailSequence)return;renderDetail(data.ticket,keepDraft);q('[data-detail-status]').textContent='';if(keepDraft)q('[data-reply-status]').textContent='Ticket vernieuwd. Je tekst blijft staan.';}
    catch(error){if(session===epoch&&sequence===detailSequence)failure(error,q('[data-detail-status]'));}
  }
  q('[data-close]').addEventListener('click',()=>dialog.close());
  q('[data-reload]').addEventListener('click',()=>{if(currentTicket)openTicket(currentTicket.id,true);});
  q('[data-refresh]').addEventListener('click',()=>refresh());q('[data-more]').addEventListener('click',()=>refresh(true));
  q('#'+prefix+'-filter').addEventListener('change',()=>refresh());
  if(admin)q('#'+prefix+'-kind-filter').addEventListener('change',()=>refresh());
  if(!admin){
    root.querySelectorAll('[data-kind]').forEach(tab=>{tab.addEventListener('click',()=>selectKind(tab.dataset.kind));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'general':event.key==='End'?'teacher':ticketKind==='general'?'teacher':'general';selectKind(next);q('#'+prefix+'-'+ticketKind+'-tab').focus();});});
    q('[data-login]').addEventListener('click',onLogin);
    root.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{q('#'+prefix+'-category').value=button.dataset.category;if(!identity){onLogin();return;}q('#'+prefix+'-title').focus();}));
    q('[data-create]').addEventListener('submit',async event=>{
      event.preventDefault();if(createBusy||!identity)return;const form=event.currentTarget;if(!form.reportValidity())return;
      const context=getContext(),session=epoch;createBusy=true;createControls(true);q('[data-create-status]').textContent=ticketKind==='teacher'?'Klacht versturen…':'Ticket versturen…';
      const payload={kind:ticketKind,category:form.elements.category.value,title:form.elements.title.value,message:form.elements.message.value,classId:context.classId};if(ticketKind==='teacher')payload.teacherName=form.elements.teacherName.value;
      try{const data=await request(base,payload);if(session!==epoch)return;
        drafts.delete(ticketKind);form.reset();applyKind();q('[data-create-status]').textContent=ticketKind==='teacher'?'Klacht ingediend. Je kunt hier antwoorden volgen.':'Ticket gestart. Je kunt hier antwoorden volgen.';renderDetail(data.ticket);q('[data-detail-status]').textContent='';q('[data-reply-status]').textContent='';dialog.showModal();refresh();
      }catch(error){if(session===epoch)failure(error,q('[data-create-status]'));}
      finally{if(session===epoch){createBusy=false;createControls(false);}}
    });
  }
  q('[data-reply]').addEventListener('submit',async event=>{
    event.preventDefault();if(replyBusy||!identity||!currentTicket)return;const form=event.currentTarget;if(!form.reportValidity())return;
    const session=epoch,ticketId=currentTicket.id,payload={revision:currentTicket.revision,message:form.elements.message.value};if(admin)payload.status=form.elements.status.value;
    replyBusy=true;form.querySelector('button[type=submit]').disabled=true;q('[data-reply-status]').textContent='Bewaren…';
    try{const data=await request(base+'/'+ticketId,payload);if(session!==epoch)return;renderDetail(data.ticket);q('[data-reply-status]').textContent='Bewaard.';refresh();}
    catch(error){if(session===epoch)failure(error,q('[data-reply-status]'));}
    finally{if(session===epoch){replyBusy=false;form.querySelector('button[type=submit]').disabled=false;}}
  });
  applyKind();updateContext();return {setAccount,refresh,updateContext};
}
