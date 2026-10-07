import {CLASS_GROUPS,CLASS_IDS,DEFAULT_CLASS,classLabel,resolveClass} from './classes.js';
'use strict';
const tiers = ['S','A','B','C','D','F'];
const tierColors = ['#f58e98','#f3ac83','#f1cf7b','#d7e888','#99d6b7','#bcaaeb'];
const avatarColors = [['#333c51','#bbcdf8'],['#463448','#e9b1df'],['#344239','#a8d6ac'],['#493e32','#e8c196'],['#393449','#c5b6ef'],['#314347','#9dd4dc'],['#493637','#eeacaf']];
const teacherNames = ['Lena Dillien','Brent Pulmans','Michaël Cloots','Natalie Smets','Bart Portier','Stef Adriaansen','Stef Van Wolputte'];
const teachers = teacherNames.map((name,i)=>({id:i+1,name,tier:'unranked'}));
const classes=CLASS_IDS;
let preferredClass=null;try{preferredClass=localStorage.getItem('docente_class');}catch{}
let welcomeRequired=!resolveClass(preferredClass);
let selectedYear=new URLSearchParams(location.search).get('jaar')||'';
let accountState={authenticated:false},accountBusy=false,favoriteBusy=false;
const siteFetch=(path,options)=>{const url=new URL(path,location.origin);if(selectedYear)url.searchParams.set('year',selectedYear);return fetch(url,options);};
const requestedClass=new URLSearchParams(location.search).get('klas');
let activeClass=resolveClass(requestedClass)||resolveClass(preferredClass)||DEFAULT_CLASS;
let classConfigured=activeClass===DEFAULT_CLASS;
let resultScope='class';
let savingNames=false;
let uploadingPhoto=false;
const classDrafts=new Map();
let selectedId = null;
let draggedId = null;
let history = [];
let toastTimer;
let votingReady=false;
let sendingVote=false;
let resultData=null;
let submittedRanking=null;
let currentRound=null;
let loadingResults=false;
let exportUrl=null;
let sendingDuel=false;
let duelIndex=0;
const pairs=teachers.flatMap(a=>teachers.filter(b=>b.id>a.id).map(b=>({leftId:a.id,rightId:b.id})));
const $ = selector=>document.querySelector(selector);
const grip = '<svg class="grip" viewBox="0 0 12 18" aria-hidden="true" fill="currentColor" stroke="none"><circle cx="3" cy="4" r="1"/><circle cx="9" cy="4" r="1"/><circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/><circle cx="3" cy="14" r="1"/><circle cx="9" cy="14" r="1"/></svg>';
function announce(message){$('#announcement').textContent=message;}
function notify(message){const toast=$('#toast');toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},2600);}
const websiteShare={title:'Docente Ranking',text:'Wie verdient een S? Rank jouw docenten op Docente Ranking.',url:'https://docente-ranking-thomasmoregeel.eu/'};
function openShareDialog(){
  $('#share-link').value=websiteShare.url;
  $('#share-status').textContent='';
  $('#share-dialog').showModal();
}
async function shareWebsite(){
  if(typeof navigator.share!=='function'){openShareDialog();return;}
  const button=$('#native-share');button.disabled=true;
  try{await navigator.share(websiteShare);}
  catch(error){if(error.name!=='AbortError')$('#share-status').textContent='Het deelmenu is niet beschikbaar. Gebruik Link kopiëren.';}
  finally{button.disabled=false;}
}
async function copyWebsiteLink(){
  const button=$('#copy-share-link');button.disabled=true;
  try{
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(websiteShare.url);
    $('#share-status').textContent='Link gekopieerd. Plak hem in je bericht.';
    notify('Link naar de website gekopieerd.');
  }catch{
    $('#share-link').focus();$('#share-link').select();
    $('#share-status').textContent='Kopiëren lukt niet automatisch. Kopieer de geselecteerde link of houd hem ingedrukt op je telefoon.';
  }finally{button.disabled=false;}
}
$('#native-share').hidden=typeof navigator.share!=='function';
$('#share-website').addEventListener('click',openShareDialog);
$('#native-share').addEventListener('click',shareWebsite);
$('#close-share').addEventListener('click',()=>$('#share-dialog').close());
$('#copy-share-link').addEventListener('click',copyWebsiteLink);
$('#share-link').addEventListener('click',()=>$('#share-link').select());
function snapshot(){history.push(teachers.map(t=>({...t})));if(history.length>50)history.shift();}
function renderClassControls(){
  const archived=!!resultData?.archived;
  $('#year-select').disabled=loadingResults||sendingVote||sendingDuel||savingNames||uploadingPhoto||favoriteBusy||accountBusy;
  $('#year-status').textContent=archived?'Archief · '+selectedYear+' · Je kunt de resultaten bekijken. Stemmen en wijzigen zijn gesloten.':'';
  const busy=loadingResults || sendingVote || sendingDuel || savingNames || uploadingPhoto||favoriteBusy||accountBusy;
  $('#ranking-main').hidden=welcomeRequired;$('#welcome-screen').hidden=!welcomeRequired;$('#open-account').hidden=welcomeRequired;
  $('#class-select').value=activeClass;$('#class-select').disabled=busy;
  $('#current-class').textContent=classLabel(activeClass);
  $('#class-setup').hidden=classConfigured;
  ['.intro','#teacher-photos','.workspace','.submit-bar','.duel-section','.results-section','#favorite-section','.account-tierlist'].forEach(s=>$(s).hidden=!classConfigured);
  $('#setup-heading').textContent='Docenten van '+classLabel(activeClass);
  $('#setup-teachers').disabled=archived||!votingReady || busy;
  $('#setup-status').textContent=loadingResults?'Klas laden…':!votingReady?'De klas kon niet worden geladen. Probeer opnieuw.':'';
  $('#retry-class').hidden=votingReady || loadingResults;
  $('#edit-names').hidden=true;
  $('#scope-class').textContent='Klas '+classLabel(activeClass);
  $('#scope-class').setAttribute('aria-selected',String(resultScope==='class'));
  $('#scope-overall').setAttribute('aria-selected',String(resultScope==='overall'));
  $('#scope-class').tabIndex=resultScope==='class'?0:-1;$('#scope-overall').tabIndex=resultScope==='overall'?0:-1;
  $('#results-eyebrow').textContent=resultScope==='class'?'KLASKLASSEMENT · '+classLabel(activeClass):'IT FACTORY · ALLE KLASSEN';
  $('#results-description').textContent=resultScope==='class'?'Stempercentages van '+classLabel(activeClass)+'. Gesorteerd op de meeste S-stemmen.':'Stemmen uit alle '+classes.length+' klassen samen. Docenten met dezelfde volledige naam worden samengevoegd.';
  $('#vote-note').textContent=resultScope==='class'?'Eén inzending per browser per klas. Opnieuw insturen vervangt je vorige stem voor die klas.':'Inzendingen per klas tellen mee. Het IT Factory-klassement combineert dezelfde docentnamen; hoofdletters en extra spaties maken geen verschil.';
  $('#class-insights').hidden=resultScope!=='class';$('.weekly-section').hidden=resultScope!=='class';
}
async function selectClass(classId){
  classId=resolveClass(classId);
  if(!classes.includes(classId))throw new Error('Onbekende klas.');
  if(loadingResults || sendingVote || sendingDuel || savingNames || uploadingPhoto||favoriteBusy||accountBusy)throw new Error('Wacht tot de huidige bewerking klaar is.');
  if(classId===activeClass)return {classId:activeClass,configured:classConfigured};
  classDrafts.set(activeClass,{teachers:teachers.map(t=>({...t})),history,duelIndex,round:currentRound});
  activeClass=classId;try{localStorage.setItem('docente_class',classId);}catch{};resultScope='class';selectedId=null;draggedId=null;resultData=null;submittedRanking=null;votingReady=false;classConfigured=classId===DEFAULT_CLASS;
  const draft=classDrafts.get(classId);teachers.splice(0,7,...(draft?.teachers||teacherNames.map((name,i)=>({id:i+1,name,tier:'unranked'}))));history=draft?.history||[];duelIndex=draft?.duelIndex||0;currentRound=draft?.round||null;
  const url=new URL(location.href);url.searchParams.set('klas',classLabel(classId));window.history.replaceState(null,'',url);
  $('#community-content').hidden=true;$('#blind-message').hidden=false;$('#results-table').replaceChildren();$('#results-status').textContent='Stemmen van '+classLabel(classId)+' laden…';
  render();await fetchResults(!draft);announce('Klas '+classLabel(classId)+' geselecteerd.');return {classId:activeClass,configured:classConfigured};
}
function applyClassData(data){
  if(data.classId!==activeClass)throw new Error('De resultaten horen bij een andere klas.');
  classConfigured=data.configured;
  if(data.teacherNames)teachers.forEach((t,i)=>t.name=data.teacherNames[i]);
}
function photoForTeacher(id){return resultData?.photos?.find(p=>p.teacherId===id);}
function renderPhotos(){
  const grid=$('#photo-grid');grid.replaceChildren();
  if(!classConfigured)return;
  teachers.forEach(t=>{const tile=element('article','photo-tile');const photo=photoForTeacher(t.id);if(photo){const image=element('img');image.src=photo.url;image.alt='Foto van '+t.name;image.loading='lazy';tile.append(image);}else{tile.append(element('div','photo-placeholder',t.name.split(/\s+/).map(w=>w[0]).slice(0,2).join('')));}
    tile.append(element('strong','',t.name));if(!resultData?.archived&&(!photo||photo.canReplace)){const label=element('label','photo-upload',photo?'Foto vervangen':'Foto uploaden');const input=element('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-label','Foto uploaden voor '+t.name);input.disabled=uploadingPhoto||loadingResults||!votingReady;input.addEventListener('change',()=>{if(input.files[0])uploadTeacherPhoto(t.id,input.files[0]).catch(()=>{});});label.append(input);tile.append(label);}else tile.append(element('span','feature-note','Foto toegevoegd'));grid.append(tile);});
}
async function uploadTeacherPhoto(teacherId,file){
  if(uploadingPhoto||loadingResults||!votingReady||!classConfigured)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){$('#photo-status').textContent='Kies een JPG-, PNG- of WebP-foto van maximaal 10 MB.';return;}
  uploadingPhoto=true;updateVotingControls();renderPhotos();$('#photo-status').textContent='Foto verwerken en uploaden…';
  try{
    const bitmap=await createImageBitmap(file);const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(!blob)throw new Error('De afbeelding kon niet worden verwerkt.');
    const form=new FormData();form.set('photo',blob,'docent.webp');form.set('classId',activeClass);form.set('teacherId',teacherId);
    const response=await siteFetch('/api/photos',{method:'POST',credentials:'same-origin',body:form});const data=await response.json();if(!response.ok)throw new Error(data.error||'Upload mislukt.');
    $('#photo-status').textContent='Foto ingestuurd voor '+teacherName(teacherId)+'. Een admin keurt hem eerst goed.';render();
  }catch(error){$('#photo-status').textContent=error.message||'Foto uploaden mislukt. Probeer opnieuw.';throw error;}
  finally{uploadingPhoto=false;updateVotingControls();renderPhotos();}
}
function openNames(){
  if(classConfigured || !votingReady)return;
  $('#names-heading').textContent='Docenten van '+classLabel(activeClass);$('#names-error').textContent='';
  const fields=$('#name-fields');fields.replaceChildren();
  teachers.forEach(t=>{const row=element('div','name-field');const label=element('label','',String(t.id).padStart(2,'0'));label.htmlFor='name-'+t.id;const input=element('input');input.id=label.htmlFor;input.name=label.htmlFor;input.maxLength=50;input.required=true;input.placeholder='Volledige naam';input.setAttribute('aria-label','Naam van docent '+t.id);row.append(label,input);fields.append(row);});
  $('#names-dialog').showModal();
}
async function saveClassNames(names){
  if(classConfigured || !votingReady || savingNames || loadingResults)throw new Error('Deze klas kan nu niet worden ingesteld.');
  if(!Array.isArray(names)||names.length!==7||names.some(n=>typeof n!=='string'||!n.trim()||n.trim().length>50))throw new Error('Vul zeven volledige docentnamen in.');
  savingNames=true;updateVotingControls();$('#save-names').disabled=true;let refresh=false;
  try{
    const response=await siteFetch('/api/classes',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({classId:activeClass,teacherNames:names})});
    const data=await response.json();refresh=response.status===409;if(!response.ok)throw new Error(data.error||'Opslaan mislukt.');
    applyClassData(data);resultData=data;currentRound=data.roundId;teachers.forEach(t=>t.tier='unranked');history=[];render();$('#names-dialog').close();notify('Docenten opgeslagen voor '+classLabel(activeClass)+'. Iedereen kan nu stemmen.');return {saved:true,classId:activeClass,teacherNames:data.teacherNames};
  }catch(error){$('#names-error').textContent=error.message;throw error;}
  finally{savingNames=false;$('#save-names').disabled=false;updateVotingControls();if(refresh){await fetchResults();if(classConfigured)$('#names-dialog').close();}}
}
function moveTeacher(id,tier){
  const teacher=teachers.find(t=>t.id===id);
  if(!teacher || ![...tiers,'unranked'].includes(tier))throw new Error('Onbekende docent of tier.');
  if(teacher.tier===tier){selectedId=null;render();return;}
  snapshot();teacher.tier=tier;selectedId=null;render();
  const message=tier==='unranked'?`${teacher.name} staat weer bij Nog te ranken.`:`${teacher.name} staat nu in ${tier}.`;
  announce(message);notify(message);
}
function card(teacher){
  const button=document.createElement('button');button.type='button';button.className='teacher'+(teacher.id===selectedId?' selected':'');button.draggable=true;button.dataset.id=teacher.id;
  button.setAttribute('aria-pressed',String(teacher.id===selectedId));button.setAttribute('aria-label',`${teacher.name}, ${teacher.tier==='unranked'?'nog te ranken':'tier '+teacher.tier}. Selecteer om te verplaatsen.`);
  const avatar=document.createElement('span');avatar.className='avatar';const words=teacher.name.trim().split(/\s+/);avatar.textContent=(words[0][0]+(words.length>1?words[words.length-1][0]:'')).toLocaleUpperCase('nl-NL');avatar.setAttribute('aria-hidden','true');avatar.style.setProperty('--avatar-bg',avatarColors[teacher.id-1][0]);avatar.style.setProperty('--avatar-color',avatarColors[teacher.id-1][1]);
  const name=document.createElement('span');name.className='teacher-name';name.textContent=teacher.name;
  const photo=photoForTeacher(teacher.id);if(photo){const img=document.createElement('img');img.src=photo.url;img.alt='';avatar.replaceChildren(img);}
  button.append(avatar,name);button.insertAdjacentHTML('beforeend',grip);
  button.addEventListener('click',event=>{event.stopPropagation();selectedId=selectedId===teacher.id?null:teacher.id;render();document.querySelector(`.teacher[data-id="${teacher.id}"]`)?.focus({preventScroll:true});announce(selectedId?`${teacher.name} geselecteerd. Kies een tier.`:'Selectie opgeheven.');});
  button.addEventListener('dragstart',event=>{draggedId=teacher.id;event.dataTransfer.setData('text/plain',String(teacher.id));event.dataTransfer.effectAllowed='move';button.classList.add('dragging');document.querySelectorAll('.tier-target').forEach(b=>b.disabled=false);});
  button.addEventListener('dragend',()=>{draggedId=null;button.classList.remove('dragging');document.querySelectorAll('.drop-over').forEach(el=>el.classList.remove('drop-over'));render();});
  return button;
}
function bindDrop(element,tier){
  element.addEventListener('dragover',event=>{if(draggedId===null)return;event.preventDefault();event.dataTransfer.dropEffect='move';element.classList.add('drop-over');});
  element.addEventListener('dragleave',event=>{if(!element.contains(event.relatedTarget))element.classList.remove('drop-over');});
  element.addEventListener('drop',event=>{event.preventDefault();element.classList.remove('drop-over');if(draggedId===null)return;const id=draggedId;draggedId=null;moveTeacher(id,tier);});
}
function render(){
  const board=$('#board');board.replaceChildren();
  tiers.forEach((tier,index)=>{
    const row=document.createElement('div');row.className='tier-row'+(selectedId?' can-place':'');row.dataset.tier=tier;row.style.setProperty('--tier-color',tierColors[index]);
    const target=document.createElement('button');target.className='tier-target';target.type='button';target.disabled=selectedId===null;target.setAttribute('aria-label',`Plaats geselecteerde docent in tier ${tier}`);target.addEventListener('click',()=>{if(selectedId!==null){moveTeacher(selectedId,tier);document.querySelector(`.tier-row[data-tier="${tier}"] .teacher:last-child`)?.focus({preventScroll:true});}});
    const label=document.createElement('span');label.className='tier-label';label.textContent=tier;label.setAttribute('aria-hidden','true');
    const content=document.createElement('div');content.className='tier-content';
    const placed=teachers.filter(t=>t.tier===tier);placed.forEach(t=>content.append(card(t)));
    if(placed.length===0){const hint=document.createElement('span');hint.className='drop-hint';hint.textContent=selectedId?'Plaats hier':'Sleep hier een docent';content.append(hint);}
    const count=document.createElement('span');count.className='row-count';count.textContent=String(placed.length);count.setAttribute('aria-label',`${placed.length} docenten in tier ${tier}`);
    row.append(target,label,content,count);bindDrop(row,tier);board.append(row);
  });
  const pool=$('#pool');pool.replaceChildren();const pending=teachers.filter(t=>t.tier==='unranked');pending.forEach(t=>pool.append(card(t)));
  if(!pending.length){const empty=document.createElement('div');empty.className='pool-empty';empty.innerHTML='<strong>Iedereen een plek.</strong>Je ranking is compleet.';pool.append(empty);}
  if(selectedId && teachers.find(t=>t.id===selectedId).tier!=='unranked'){const back=document.createElement('button');back.className='return-button';back.textContent='Terug naar Nog te ranken';back.addEventListener('click',()=>moveTeacher(selectedId,'unranked'));pool.append(back);}
  const ranked=7-pending.length;$('#pool-count').textContent=pending.length;$('#ranked-count').textContent=ranked;$('#progress-fill').style.width=`${ranked/7*100}%`;$('#progress-label').textContent=ranked===7?'ranking compleet':'docenten gerankt';$('#reset').disabled=!ranked;$('#undo').disabled=!history.length;
  const hint=$('#selection-hint');hint.replaceChildren();if(selectedId){hint.textContent=`${teachers.find(t=>t.id===selectedId).name} geselecteerd. Kies een tier.`;}else{hint.append('Jouw mening telt.',document.createElement('br'));const span=document.createElement('span');span.textContent='Pak een docent en geef een plek.';hint.append(span);}
  updateVotingControls();
  renderPhotos();
  if(resultData)renderResults();
  renderFavorite();
}
function currentRanking(){return teachers.map(t=>({teacherId:t.id,tier:t.tier}));}
function updateVotingControls(){
  renderClassControls();
  renderAccount();
  const complete=teachers.every(t=>tiers.includes(t.tier));
  const matches=submittedRanking && JSON.stringify(currentRanking())===JSON.stringify(submittedRanking);
  const counted=matches && resultData?.votedThisWeek;
  $('#submit-vote').disabled=!!resultData?.archived||!classConfigured || !complete || !votingReady || sendingVote || sendingDuel || savingNames || uploadingPhoto || loadingResults || counted;
  $('#export-ranking').disabled=!teachers.some(t=>tiers.includes(t.tier));
  $('#submit-vote').textContent=sendingVote?'Versturen…':matches&&!counted?'Meetellen deze week':submittedRanking?'Stem bijwerken':'Ranking insturen';
  $('#vote-status').textContent=!votingReady?'Stemmen laden. Bij een fout kun je opnieuw vernieuwen.':!complete?'Rank alle zeven docenten om je stem in te sturen.':counted?'Je ranking telt mee, ook voor deze week.':matches?'Laat deze ranking ook voor de huidige week meetellen.':submittedRanking?'Je hebt je ranking aangepast. Werk je stem bij om deze te laten meetellen.':'Je ranking is klaar om mee te tellen. Daarna verschijnen de resultaten.';
  renderDuels();
  renderPhotos();
}
function percentageLabel(count,total){if(!total)return '—';const value=count/total*100;return new Intl.NumberFormat('nl-NL',{maximumFractionDigits:1}).format(value)+'%';}
function teacherName(id){return teachers.find(t=>t.id===id).name;}
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function renderDuels(){
  const pair=pairs[duelIndex],mine=resultData?.myDuels||[];
  const vote=mine.find(d=>d.leftId===pair.leftId && d.rightId===pair.rightId);
  $('#duel-progress').textContent=`${mine.length} / 21 gekozen`;
  for(const [selector,id] of [['#duel-left',pair.leftId],['#duel-right',pair.rightId]]){
    const button=$(selector);button.replaceChildren();button.disabled=!votingReady || sendingDuel || sendingVote || loadingResults;
    button.disabled=button.disabled || !!resultData?.archived||!classConfigured || savingNames || uploadingPhoto;button.setAttribute('aria-pressed',String(vote?.winnerId===id));button.classList.toggle('duel-picked',vote?.winnerId===id);
    button.append(element('span','duel-number',String(id).padStart(2,'0')),element('strong','',teacherName(id)),element('span','duel-prompt',vote?.winnerId===id?'Jouw keuze':'Kies deze docent'));
  }
  $('#duel-prev').disabled=duelIndex===0 || sendingDuel;
  $('#duel-next').disabled=duelIndex===pairs.length-1 || sendingDuel;
  const counts=(resultData?.duelResults||[]).filter(d=>d.leftId===pair.leftId && d.rightId===pair.rightId);
  const total=counts.reduce((s,d)=>s+d.count,0),left=counts.find(d=>d.winnerId===pair.leftId)?.count||0;
  $('#duel-status').textContent=sendingDuel?'Keuze opslaan…':!votingReady?'Duels laden. Vernieuw bij een fout.':`Duel ${duelIndex+1} van 21${vote?' · jouw keuze: '+teacherName(vote.winnerId):''}${total?' · '+percentageLabel(left,total)+' / '+percentageLabel(total-left,total):''}`;
  const board=$('#duel-leaderboard');board.replaceChildren();board.hidden=!resultData || resultData.blind;
  if(board.hidden)return;
  const totals=teachers.map(t=>({id:t.id,wins:0,total:0}));
  for(const d of resultData.duelResults){totals[d.leftId-1].total+=d.count;totals[d.rightId-1].total+=d.count;totals[d.winnerId-1].wins+=d.count;}
  board.append(element('h3','','Duelklassement'));
  if(!totals.some(t=>t.total)){board.append(element('p','feature-note','Nog geen duelstemmen. Maak de eerste keuze.'));return;}
  totals.filter(t=>t.total).sort((a,b)=>b.wins/b.total-a.wins/a.total || b.wins-a.wins || a.id-b.id).forEach(t=>{
    const row=element('div','duel-standing');row.append(element('strong','',teacherName(t.id)),element('span','',`${percentageLabel(t.wins,t.total)} gewonnen · ${t.wins}/${t.total} duelstemmen`));board.append(row);
  });
}
async function chooseDuel(winnerId){
  const pair=pairs[duelIndex];
  if(![pair.leftId,pair.rightId].includes(winnerId))throw new Error('Kies één van de twee docenten in dit duel.');
  if(!classConfigured || !votingReady || sendingDuel || sendingVote || loadingResults || savingNames || uploadingPhoto)throw new Error('Stel de docenten in en wacht tot de stemmen geladen zijn.');
  sendingDuel=true;updateVotingControls();let stale=false;
  try{
    const response=await siteFetch('/api/duels',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({...pair,winnerId,roundId:currentRound,classId:activeClass})});
    const data=await response.json();stale=response.status===409;if(!response.ok)throw new Error(data.error||'Keuze opslaan mislukt.');
    resultData=data;submittedRanking=data.myRanking.length===7?data.myRanking:null;
    const next=pairs.findIndex((p,i)=>i>duelIndex && !data.myDuels.some(d=>d.leftId===p.leftId && d.rightId===p.rightId));
    const first=pairs.findIndex(p=>!data.myDuels.some(d=>d.leftId===p.leftId && d.rightId===p.rightId));
    if(next>=0)duelIndex=next;else if(first>=0)duelIndex=first;
    renderResults();notify(data.myDuels.length===21?'Alle 21 duels gekozen! Je kunt je keuzes nog aanpassen.':'Keuze opgeslagen: '+teacherName(winnerId));
    return {saved:true,winnerId,completed:data.myDuels.length};
  }catch(error){notify(error.message);throw error;}
  finally{sendingDuel=false;updateVotingControls();if(stale)await fetchResults();}
}
function weekLabel(week){const start=new Date(week+'T12:00:00Z'),end=new Date(start);end.setUTCDate(end.getUTCDate()+6);const format=new Intl.DateTimeFormat('nl-BE',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});return format.format(start)+' – '+format.format(end);}
function renderInsights(){
  const score=resultData.matchScore;
  $('#match-value').textContent=score===null?'—':percentageLabel(score,100);
  $('#match-bar').style.width=(score||0)+'%';
  $('#match-detail').textContent=score===null?'Wacht op een tweede stemmer voor je matchscore.':'Gemiddeld kiest dit percentage andere stemmers dezelfde tier als jij. Jouw eigen stem telt niet mee in deze vergelijking.';
  const ranked=resultData.teachers.filter(t=>t.disagreement!==null).sort((a,b)=>b.disagreement-a.disagreement || a.id-b.id);
  const most=ranked[0];const tied=most?ranked.filter(t=>Math.abs(t.disagreement-most.disagreement)<1e-8):[];
  $('#divided-name').textContent=!most?'Nog te weinig stemmen':most.disagreement<1e-8?'Iedereen is het eens':tied.length===1?teacherName(most.id):`${tied.length} docenten gelijk`;
  $('#divided-detail').textContent=!most?'Vanaf twee stemmen per docent.':(tied.length>1&&most.disagreement>1e-8?tied.map(t=>teacherName(t.id)).join(', ')+' · ':'')+'Verdeeldheid: '+percentageLabel(most.disagreement,100);
  const history=$('#weekly-history');history.replaceChildren();
  const weeks=resultData.weeks.some(w=>w.week===resultData.currentWeek)?resultData.weeks:[{week:resultData.currentWeek,voters:0,leaders:[]},...resultData.weeks];
  weeks.forEach(w=>{
    const row=element('article','week-card');const title=element('div','week-title');title.append(element('strong','',weekLabel(w.week)),element('span','feature-tag',w.week===resultData.currentWeek?'Deze week · voorlopig':'Afgerond'));
    row.append(title);
    if(!w.voters)row.append(element('p','','Nog geen inzendingen deze week. Laat jouw tierlist meetellen.'));
    else if(!w.leaders.length)row.append(element('p','','Nog geen S-stemmen deze week.'));
    else {row.append(element('p','week-winner',w.leaders.map(t=>teacherName(t.id)).join(' · ')));row.append(element('span','feature-note',`${w.leaders.length>1?'Gedeelde winnaars · ':''}${w.leaders[0].sVotes} ${w.leaders[0].sVotes===1?'S-stem':'S-stemmen'} · ${w.voters} ${w.voters===1?'inzending':'inzendingen'}`));}
    history.append(row);
  });
}
function renderPodium(ordered){
  const podium=$('#podium');podium.replaceChildren();
  const favorites=ordered.filter(t=>t.counts.S>0);
  if(!favorites.length){const empty=document.createElement('p');empty.textContent='Nog geen S-stemmen. Wie komt op het podium?';podium.append(empty);return;}
  favorites.slice(0,3).forEach((t,i)=>{
    const rank=favorites.findIndex(other=>other.counts.S===t.counts.S)+1;
    const shared=favorites.filter(other=>other.counts.S===t.counts.S).length>1;
    const card=document.createElement('article');card.className='podium-card'+(rank===1?' podium-first':'');
    const position=document.createElement('span');position.className='podium-position';position.textContent=(shared?'Gedeeld ':'')+'#'+rank;
    const name=document.createElement('strong');name.className='podium-name';name.textContent=t.name;
    const value=document.createElement('span');value.className='podium-value';value.textContent=percentageLabel(t.counts.S,t.total);
    const detail=document.createElement('span');detail.className='podium-detail';detail.textContent=`${t.counts.S} ${t.counts.S===1?'S-stem':'S-stemmen'} · ${t.total} totaal`;
    card.append(position,name,value,detail);podium.append(card);
  });
}
async function downloadRanking(){
  const button=$('#export-ranking');button.disabled=true;button.textContent='Afbeelding maken…';
  try{
    await document.fonts.ready;
    const width=1400,margin=56,labelWidth=90,cardWidth=260,cardHeight=70,gap=14;
    const columns=Math.floor((width-margin*2-labelWidth-24)/(cardWidth+gap));
    const rows=[...tiers,...(teachers.some(t=>t.tier==='unranked')?['unranked']:[])].map(tier=>{const items=teachers.filter(t=>t.tier===tier);return {tier,items,height:Math.max(96,Math.ceil(items.length/columns)*(cardHeight+gap)+22)};});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=194+rows.reduce((sum,row)=>sum+row.height,0)+88;
    const context=canvas.getContext('2d');if(!context)throw new Error('Afbeeldingen maken is niet beschikbaar in deze browser.');
    const rect=(x,y,w,h,r,color)=>{context.fillStyle=color;context.beginPath();context.roundRect(x,y,w,h,r);context.fill();};
    const text=(value,x,y,font,color)=>{context.font=font;context.fillStyle=color;context.fillText(value,x,y);};
    rect(0,0,width,canvas.height,0,'#101114');
    text('DOCENTE RANKING',margin,85,"700 44px 'Space Grotesk',sans-serif",'#f3f3f5');
    text(classLabel(activeClass)+' · Mijn tierlist · S, A, B, C, D en F',margin,124,"400 21px 'DM Sans',sans-serif",'#a0a4b0');
    rect(width-margin-206,61,206,47,9,'#d4f75b');text('MIJN RANKING',width-margin-185,92,"700 19px 'DM Sans',sans-serif",'#1b2110');
    let y=174;
    for(const row of rows){
      const index=tiers.indexOf(row.tier);const color=index>=0?tierColors[index]:'#626774';
      rect(margin,y,width-margin*2,row.height-2,10,'#191b21');rect(margin,y,labelWidth,row.height-2,10,color);
      text(row.tier==='unranked'?'?':row.tier,margin+30,y+row.height/2+13,"700 40px 'Space Grotesk',sans-serif",'#202126');
      row.items.forEach((teacher,i)=>{
        const x=margin+labelWidth+18+(i%columns)*(cardWidth+gap),cy=y+12+Math.floor(i/columns)*(cardHeight+gap);
        rect(x,cy,cardWidth,cardHeight,9,'#282b33');
        rect(x+12,cy+14,42,42,8,avatarColors[teacher.id-1][0]);
        const words=teacher.name.trim().split(/\s+/),initials=(words[0][0]+(words.length>1?words.at(-1)[0]:'')).toLocaleUpperCase('nl-NL');
        text(initials,x+20,cy+41,"600 17px 'Space Grotesk',sans-serif",avatarColors[teacher.id-1][1]);
        context.font="500 17px 'DM Sans',sans-serif";const lines=[];let line='';
        for(const word of words){const next=line?line+' '+word:word;if(context.measureText(next).width>cardWidth-78 && line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
        lines.slice(0,2).forEach((part,j)=>text(part,x+66,cy+(lines.length>1?29:41)+j*22,"500 17px 'DM Sans',sans-serif",'#f3f3f5'));
      });
      y+=row.height;
    }
    text('docente-ranking.maxdepoesgames.chatgpt.site',margin,y+44,"400 18px 'DM Sans',sans-serif",'#a0a4b0');
    if(rows.some(r=>r.tier==='unranked'))text('?: nog te ranken',width-margin-156,y+44,"400 18px 'DM Sans',sans-serif",'#a0a4b0');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Download maken is mislukt. Probeer opnieuw.');
    if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(blob);$('#export-image').src=exportUrl;$('#save-image').href=exportUrl;$('#export-dialog').showModal();return {ready:true,filename:'mijn-docente-ranking.png'};
  }catch(error){notify(error.message||'De download is mislukt.');throw error;}
  finally{button.textContent='Download tierlist';updateVotingControls();}
}
function renderResults(){
  renderClassControls();
  $('#blind-message').hidden=!resultData.blind;
  $('#community-content').hidden=resultData.blind;
  renderDuels();
  if(resultData.blind){$('#results-table').replaceChildren();$('#results-table').hidden=true;return;}
  renderInsights();
  const table=$('#results-table');table.replaceChildren();table.hidden=false;
  const header=document.createElement('div');header.className='result-row result-head';
  const title=document.createElement('span');title.textContent='Docent';header.append(title);
  tiers.forEach((tier,i)=>{const cell=document.createElement('span');cell.textContent=tier;cell.style.setProperty('--tier-color',tierColors[i]);header.append(cell);});table.append(header);
  const ordered=[...(resultScope==='overall'?resultData.overall:resultData.teachers)].sort((a,b)=>b.counts.S-a.counts.S || (b.total?b.counts.S/b.total:0)-(a.total?a.counts.S/a.total:0) || a.name.localeCompare(b.name,'nl'));
  const largest=Math.max(...ordered.map(t=>t.counts.S));
  renderPodium(ordered);
  ordered.forEach(t=>{
    const row=document.createElement('div');row.className='result-row';
    const label=document.createElement('div');label.className='result-name';
    const name=document.createElement('strong');name.textContent=t.name;
    const count=document.createElement('span');count.textContent=`${t.total} ${t.total===1?'stem':'stemmen'} · ${t.counts.S}× S`;
    label.append(name,count);if(largest>0 && t.counts.S===largest){const badge=document.createElement('span');badge.className='leader-badge';badge.textContent='Meeste S';label.append(badge);}
    const mine=resultScope==='class'?submittedRanking?.find(r=>r.teacherId===t.id):null;if(mine){const own=document.createElement('span');own.className='your-vote';own.style.setProperty('--tier-color',tierColors[tiers.indexOf(mine.tier)]);own.textContent='Jouw stem: '+mine.tier;label.append(own);}row.append(label);
    if(resultScope==='overall'){const klasses=document.createElement('span');klasses.textContent=t.classes.map(classLabel).join(' · ');label.append(klasses);}
    if(t.disagreement!==null){const spread=document.createElement('span');spread.textContent='Verdeeldheid: '+percentageLabel(t.disagreement,100);label.append(spread);}
    tiers.forEach((tier,i)=>{const cell=document.createElement('div');cell.className='percentage-cell';cell.style.setProperty('--tier-color',tierColors[i]);const value=document.createElement('span');value.textContent=percentageLabel(t.counts[tier],t.total);const bar=document.createElement('div');bar.className='percentage-track';const fill=document.createElement('i');fill.style.width=(t.total?t.counts[tier]/t.total*100:0)+'%';bar.append(fill);cell.append(value,bar);cell.setAttribute('aria-label',`${tier}: ${t.counts[tier]} van ${t.total} stemmen, ${value.textContent}`);row.append(cell);});table.append(row);
  });
}
async function fetchResults(restore=false,silent=false){
  if(loadingResults || sendingVote || sendingDuel || savingNames || uploadingPhoto||favoriteBusy||accountBusy)return;
  loadingResults=true;updateVotingControls();
  $('#refresh-results').disabled=true;
  try{
    if(location.protocol==='file:')throw new Error('local-file');
    const response=await siteFetch('/api/results?classId='+encodeURIComponent(activeClass),{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error('offline');
    const data=await response.json();if(!Array.isArray(data.myRanking) || (!data.blind && (!Array.isArray(data.teachers) || data.teachers.length!==7)))throw new Error('invalid-results');
    applyClassData(data);
    const newRound=currentRound!==null && currentRound!==data.roundId;
    selectedYear=data.year;const yearSelect=$('#year-select');yearSelect.replaceChildren();for(const year of data.years){const option=element('option','',year+(year===data.currentYear?' · actief':' · archief'));option.value=year;yearSelect.append(option);}yearSelect.value=selectedYear;
    currentRound=data.roundId;resultData=data;votingReady=true;submittedRanking=data.myRanking.length===7?data.myRanking:null;
    if(newRound){teachers.forEach(t=>t.tier='unranked');selectedId=null;history=[];duelIndex=0;render();notify('Een nieuwe stemronde is gestart. Iedereen begint opnieuw.');}
    if(restore && submittedRanking && teachers.every(t=>t.tier==='unranked')){teachers.forEach(t=>t.tier=submittedRanking.find(row=>row.teacherId===t.id).tier);render();}
    render();updateVotingControls();$('#results-status').textContent=data.blind?'Blind stemmen: stuur je ranking voor '+classLabel(activeClass)+' in om de uitslag te zien.':'De ingestuurde stemmen zijn bijgewerkt.';
  }catch{
    if(!resultData){$('#results-status').textContent=location.protocol==='file:'?'Open de online website om de stemmen van iedereen te zien.':'De stemmen zijn tijdelijk niet beschikbaar. Klik op Vernieuwen om opnieuw te proberen.';}
    else $('#results-status').textContent='Bijwerken mislukt. Je ziet de laatst geladen resultaten.';
    votingReady=false;updateVotingControls();
  }finally{loadingResults=false;$('#refresh-results').disabled=false;updateVotingControls();}
}
async function submitVote(){
  if(!classConfigured || !votingReady || sendingVote || sendingDuel || loadingResults || savingNames || uploadingPhoto || teachers.some(t=>!tiers.includes(t.tier)))return;
  const sent=currentRanking();let refreshRound=false;sendingVote=true;updateVotingControls();
  try{
    const response=await siteFetch('/api/votes',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({rankings:sent,roundId:currentRound,classId:activeClass})});
    const data=await response.json();refreshRound=response.status===409;if(!response.ok)throw new Error(data.error||'Je stem kon niet worden opgeslagen.');
    submittedRanking=sent;resultData=data;renderResults();$('#results-status').textContent='Alle ingestuurde stemmen tellen mee.';notify('Je ranking is meegeteld.');announce('Je ranking is meegeteld in de percentages.');return {saved:true,results:data};
  }catch(error){notify(error.message||'Versturen mislukt. Probeer opnieuw.');$('#results-status').textContent='Versturen mislukt. Je ranking blijft staan; probeer opnieuw.';return {saved:false,error:error.message};}
  finally{sendingVote=false;updateVotingControls();if(refreshRound)await fetchResults();}
}
bindDrop($('#pool'),'unranked');
$('#undo').addEventListener('click',()=>{if(!history.length)return;const prior=history.pop();teachers.splice(0,7,...prior);selectedId=null;render();notify('Laatste wijziging ongedaan gemaakt.');});
$('#reset').addEventListener('click',()=>{if(!teachers.some(t=>t.tier!=='unranked'))return;snapshot();teachers.forEach(t=>t.tier='unranked');selectedId=null;render();notify('Iedereen staat weer klaar. Je kunt dit ongedaan maken.');});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && !$('#names-dialog').open){const previous=selectedId;selectedId=null;render();if(previous)document.querySelector(`.teacher[data-id="${previous}"]`)?.focus({preventScroll:true});}});
$('#setup-teachers').addEventListener('click',openNames);
$('#retry-class').addEventListener('click',()=>fetchResults(true));
['#close-names','#cancel-names'].forEach(selector=>$(selector).addEventListener('click',()=>$('#names-dialog').close()));
$('#names-form').addEventListener('submit',event=>{event.preventDefault();saveClassNames(teachers.map(t=>$('#name-'+t.id).value.trim())).catch(error=>$('#names-error').textContent=error.message);});
for(const group of CLASS_GROUPS){const options=document.createElement('optgroup');options.label=group.label;for(const klass of group.classes){const option=document.createElement('option');option.value=klass.id;option.textContent=klass.label;options.append(option);}$('#class-select').append(options);}
$('#class-select').addEventListener('change',()=>selectClass($('#class-select').value).catch(error=>{renderClassControls();notify(error.message);}));
function selectScope(scope){resultScope=scope;renderClassControls();if(resultData)renderResults();
  renderFavorite();}
$('#scope-class').addEventListener('click',()=>selectScope('class'));
$('#scope-overall').addEventListener('click',()=>selectScope('overall'));
['#scope-class','#scope-overall'].forEach(selector=>$(selector).addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const scope=event.key==='Home'?'class':event.key==='End'?'overall':resultScope==='class'?'overall':'class';selectScope(scope);$('#scope-'+scope).focus();}));
render();
$('#submit-vote').addEventListener('click',submitVote);
$('#refresh-results').addEventListener('click',()=>fetchResults());
$('#duel-left').addEventListener('click',()=>chooseDuel(pairs[duelIndex].leftId).catch(()=>{}));
$('#duel-right').addEventListener('click',()=>chooseDuel(pairs[duelIndex].rightId).catch(()=>{}));
$('#duel-prev').addEventListener('click',()=>{duelIndex=Math.max(0,duelIndex-1);renderDuels();});
$('#duel-next').addEventListener('click',()=>{duelIndex=Math.min(pairs.length-1,duelIndex+1);renderDuels();});
$('#export-ranking').addEventListener('click',()=>downloadRanking().catch(()=>{}));
$('#close-export').addEventListener('click',()=>$('#export-dialog').close());
$('#export-dialog').addEventListener('close',()=>{if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=null;$('#export-image').removeAttribute('src');$('#save-image').removeAttribute('href');});
document.addEventListener('keydown',event=>{if(event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.target.matches('input,textarea,select,[contenteditable]') || document.querySelector('dialog[open]'))return;const tier=event.key.toUpperCase();if(selectedId!==null && tiers.includes(tier)){event.preventDefault();moveTeacher(selectedId,tier);}});
const liveTimer=setInterval(()=>{if(!welcomeRequired&&document.visibilityState==='visible' && !$('#names-dialog').open && !$('#export-dialog').open)fetchResults(false,true);},30000);
document.addEventListener('visibilitychange',()=>{if(!welcomeRequired&&document.visibilityState==='visible')fetchResults(false,true);});
window.addEventListener('pagehide',()=>clearInterval(liveTimer),{once:true});
if(!welcomeRequired)fetchResults(true);
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const lifecycle=new AbortController();
  const readRanking=()=>({classId:activeClass,configured:classConfigured,teachers:teachers.map(t=>({...t})),ranked:teachers.filter(t=>t.tier!=='unranked').length});
  const tools=[
    {name:'select_class',title:'Klas kiezen',description:'Kies één van de 19 klassen en laad de eigen docenten en stemmen. Bewaart het tijdelijke rankingontwerp van de vorige klas.',inputSchema:{type:'object',properties:{classId:{type:'string',enum:classes}},required:['classId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='classId')||!classes.includes(input.classId))throw new Error('Kies een geldige klas.');return selectClass(input.classId);}},
    {name:'setup_class_teachers',title:'Klasdocenten opslaan',description:'Sla eenmalig de zeven verschillende, volledige docentnamen van de geselecteerde nog lege klas op. De namen worden gedeeld met iedereen die deze klas kiest.',inputSchema:{type:'object',properties:{teacherNames:{type:'array',minItems:7,maxItems:7,items:{type:'string',minLength:1,maxLength:50}}},required:['teacherNames'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='teacherNames'))throw new Error('Geef zeven docentnamen.');return saveClassNames(input.teacherNames);}},
    {name:'read_ranking',title:'Ranking bekijken',description:'Lees de zeven docenten en hun huidige tier op dit rankingbord.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>readRanking()},
    {name:'rank_teachers',title:'Docenten ranken',description:'Verplaats één of meer docenten op het zichtbare rankingbord naar S, A, B, C, D, F of unranked. Wijzigt alleen deze geopende pagina.',inputSchema:{type:'object',properties:{placements:{type:'array',minItems:1,maxItems:7,items:{type:'object',properties:{teacherId:{type:'integer',minimum:1,maximum:7},tier:{type:'string',enum:[...tiers,'unranked']}},required:['teacherId','tier'],additionalProperties:false}}},required:['placements'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{
      if(!classConfigured)throw new Error('Stel eerst de docenten van deze klas in.');
      if(!input || typeof input!=='object' || Object.keys(input).some(k=>k!=='placements') || !Array.isArray(input.placements) || input.placements.length<1 || input.placements.length>7)throw new Error('Geef één tot zeven plaatsingen op.');
      const ids=new Set();
      for(const p of input.placements){if(!p || Object.keys(p).some(k=>!['teacherId','tier'].includes(k)) || !Number.isInteger(p.teacherId) || !teachers.some(t=>t.id===p.teacherId) || ![...tiers,'unranked'].includes(p.tier) || ids.has(p.teacherId))throw new Error('Elke plaatsing vereist een unieke docent van 1 tot 7 en een geldige tier.');ids.add(p.teacherId);}
      input.placements.forEach(p=>moveTeacher(p.teacherId,p.tier));return readRanking();
    }},
    {name:'read_vote_results',title:'Stempercentages bekijken',description:'Lees het klassement van de geselecteerde klas, het algemene IT Factory-klassement, de matchscore en weekwinnaars. Alleen beschikbaar na een tierlist-inzending voor deze klas.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async()=>{await fetchResults();if(!votingReady)throw new Error('Stemmen zijn niet beschikbaar.');if(resultData.blind)throw new Error('Stuur eerst je eigen ranking voor deze klas in om resultaten te zien.');return {classId:activeClass,teachers:resultData.teachers.map(t=>({...t,percentages:Object.fromEntries(tiers.map(tier=>[tier,t.total?t.counts[tier]/t.total*100:null]))})),overall:resultData.overall,matchScore:resultData.matchScore,weeks:resultData.weeks};}},
    {name:'read_current_duel',title:'Huidig docentduel bekijken',description:'Lees de twee docenten in het zichtbare duel en je eerdere keuze voor dat paar.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({pair:pairs[duelIndex],teachers:[pairs[duelIndex].leftId,pairs[duelIndex].rightId].map(id=>({id,name:teacherName(id)})),myChoice:resultData?.myDuels.find(d=>d.leftId===pairs[duelIndex].leftId&&d.rightId===pairs[duelIndex].rightId)?.winnerId||null})},
    {name:'submit_duel_choice',title:'Duelkeuze insturen',description:'Sla je keuze op voor één van de twee docenten in het zichtbare duel. Vervangt je eerdere keuze voor dit paar en gaat naar het volgende onbeantwoorde duel.',inputSchema:{type:'object',properties:{winnerId:{type:'integer',minimum:1,maximum:7}},required:['winnerId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='winnerId')||!Number.isInteger(input.winnerId))throw new Error('Geef een geldig winnerId.');return chooseDuel(input.winnerId);}},
    {name:'submit_ranking',title:'Ranking insturen',description:'Sla de complete huidige ranking van zeven docenten op als stem. Vervangt de vorige inzending van deze browser en werkt de gezamenlijke percentages bij.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async()=>{if(!votingReady || sendingVote || teachers.some(t=>!tiers.includes(t.tier)))throw new Error('Rank alle zeven docenten en laad de resultaten voordat je instuurt.');const result=await submitVote();if(!result?.saved)throw new Error(result?.error||'Stem niet opgeslagen.');return result;}},
    {name:'create_tierlist_image',title:'Tierlist-afbeelding maken',description:'Maak een PNG-afbeelding van de huidige persoonlijke tierlist en toon het voorbeeld met een downloadlink. Slaat nog geen bestand op.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async()=>{if(!teachers.some(t=>tiers.includes(t.tier)))throw new Error('Plaats eerst een docent in een tier.');return downloadRanking();}}
  ];
  for(const tool of tools){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

function renderFavorite(){
 const select=$('#favorite-select');select.replaceChildren();const placeholder=element('option','','Kies een docent');placeholder.value='';select.append(placeholder);teachers.forEach(t=>{const option=element('option','',t.name);option.value=t.id;select.append(option);});select.value=resultData?.myFavorite||'';select.disabled=!votingReady||favoriteBusy||!!resultData?.archived;$('#save-favorite').disabled=select.disabled||!classConfigured;
 const rows=resultData?.favoriteResults||[],total=rows.reduce((s,r)=>s+r.count,0);$('#favorite-results').replaceChildren();if(resultData?.blind){$('#favorite-results').textContent='Stuur je tierlist in om de publieksprijs te bekijken.';return;}
 rows.slice().sort((a,b)=>b.count-a.count||a.teacher_id-b.teacher_id).forEach(r=>{const card=element('article','favorite-result');card.append(element('strong','',teacherName(r.teacher_id)),element('span','',r.count+' stemmen · '+percentageLabel(r.count,total)));$('#favorite-results').append(card);});if(!total)$('#favorite-results').textContent='Nog geen favorieten gekozen.';
}
$('#favorite-form').addEventListener('submit',async e=>{e.preventDefault();if(favoriteBusy||!$('#favorite-select').value)return;favoriteBusy=true;const id=Number($('#favorite-select').value);renderFavorite();try{const response=await siteFetch('/api/favorites',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({classId:activeClass,roundId:currentRound,teacherId:id})});const data=await response.json();if(!response.ok)throw new Error(data.error);resultData=data;render();$('#favorite-status').textContent='Jouw favoriet: '+teacherName(id)+'.';}catch(error){$('#favorite-status').textContent=error.message;}finally{favoriteBusy=false;renderFavorite();}});
$('#year-select').addEventListener('change',async()=>{selectedYear=$('#year-select').value;classDrafts.clear();currentRound=null;resultData=null;submittedRanking=null;teachers.forEach(t=>t.tier='unranked');history=[];duelIndex=0;const url=new URL(location.href);url.searchParams.set('jaar',selectedYear);window.history.replaceState(null,'',url);await fetchResults(true);});
for(const group of CLASS_GROUPS){const section=element('section','welcome-group');section.append(element('h2','',group.label));const buttons=element('div','welcome-grid');for(const klass of group.classes){const button=element('button','welcome-class',klass.label);button.addEventListener('click',async()=>{welcomeRequired=false;try{localStorage.setItem('docente_class',klass.id);}catch{};if(activeClass===klass.id){renderClassControls();await fetchResults(true);}else await selectClass(klass.id);const url=new URL(location.href);url.searchParams.set('klas',klass.label);window.history.replaceState(null,'',url);});buttons.append(button);}section.append(buttons);$('#welcome-classes').append(section);}
async function accountRequest(path,body){const response=await siteFetch('/api/account/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Accountactie mislukt.');return data;}
function renderAccount(){ $('#account-form').hidden=accountState.authenticated;$('#account-signed-in').hidden=!accountState.authenticated;$('#account-identity').textContent=accountState.email||'';$('#open-account').textContent=accountState.authenticated?'Mijn tierlists':'Inloggen';$('#save-tierlist').disabled=accountBusy||!votingReady||!!resultData?.archived;$('#load-tierlist').disabled=accountBusy||!votingReady;}
$('#open-account').addEventListener('click',()=>{$('#account-dialog').showModal();});$('#close-account').addEventListener('click',()=>$('#account-dialog').close());
async function authenticateMember(path){if(accountBusy)return;if(!$('#account-form').reportValidity())return;accountBusy=true;$('#account-status').textContent='Even wachten…';try{accountState=await accountRequest(path,{email:$('#account-email').value,password:$('#account-password').value});$('#account-password').value='';$('#account-status').textContent='Je bent ingelogd. Je kunt je tierlist nu bewaren.';renderAccount();}catch(error){$('#account-status').textContent=error.message;}finally{accountBusy=false;renderAccount();}}
$('#account-form').addEventListener('submit',e=>{e.preventDefault();authenticateMember('login');});$('#register-account').addEventListener('click',()=>authenticateMember('register'));
$('#logout-account').addEventListener('click',async()=>{try{accountState=await accountRequest('logout',{});renderAccount();$('#account-status').textContent='Uitgelogd.';}catch(error){$('#account-status').textContent=error.message;}});
$('#save-tierlist').addEventListener('click',async()=>{if(!accountState.authenticated){$('#account-dialog').showModal();return;}accountBusy=true;renderAccount();try{await accountRequest('tierlist',{classId:activeClass,ranking:currentRanking()});$('#tierlist-status').textContent='Tierlist bewaard voor '+classLabel(activeClass)+' · '+selectedYear+'. Je stem is niet gewijzigd.';}catch(error){$('#tierlist-status').textContent=error.message;}finally{accountBusy=false;renderAccount();}});
$('#load-tierlist').addEventListener('click',async()=>{if(!accountState.authenticated){$('#account-dialog').showModal();return;}accountBusy=true;renderAccount();try{const data=await accountRequest('tierlist?classId='+encodeURIComponent(activeClass));if(!data.ranking){$('#tierlist-status').textContent='Nog geen tierlist bewaard voor deze klas en dit schooljaar.';return;}snapshot();teachers.forEach(t=>t.tier=data.ranking.find(r=>r.teacherId===t.id).tier);render();$('#tierlist-status').textContent='Bewaarde tierlist geladen. Gebruik Ranking insturen om ermee te stemmen.';}catch(error){$('#tierlist-status').textContent=error.message;}finally{accountBusy=false;renderAccount();}});
accountRequest('state').then(data=>{accountState=data;renderAccount();}).catch(()=>{$('#account-status').textContent='Account kon niet worden geladen. Vernieuw de pagina om opnieuw te proberen.';});renderAccount();
