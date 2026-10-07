export const MAX_TEACHERS=30;
export const DEFAULT_TEACHER_NAMES=['Lena Dillien','Brent Pulmans','Michaël Cloots','Natalie Smets','Bart Portier','Stef Adriaansen','Stef Van Wolputte'];
export function validTeacherNames(names){return Array.isArray(names)&&names.length>=1&&names.length<=MAX_TEACHERS&&names.every(name=>typeof name==='string'&&name.trim().length>=1&&name.trim().length<=50)&&new Set(names.map(name=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('nl-BE'))).size===names.length;}
// Keep the existing ITF IDs so saved rankings and reset rounds stay linked.
export const CLASS_GROUPS = [
  {label:'1e jaar',classes:[
    {id:'1ITF01',label:'1itf1'},{id:'1ITF02',label:'1itf2'},
    {id:'1ITF03',label:'1itf3'},{id:'1ITF04',label:'1itf4'},
    {id:'1ITF05',label:'1itf5'},{id:'1ACS1',label:'1acs1'},{id:'1ACS2',label:'1acs2'},
  ]},
  {label:'2e jaar',classes:[
    {id:'2ACS',label:'2acs'},{id:'2APPAI',label:'2appai'},
    {id:'2CCS',label:'2ccs'},{id:'2DI',label:'2di'},
  ]},
  {label:'3e jaar',classes:[
    {id:'3ACS',label:'3acs'},{id:'3APP',label:'3app'},
    {id:'3CCS',label:'3ccs'},{id:'3DI',label:'3di'},
  ]},
  {label:'Overige',classes:[{id:'WT',label:'wt'},{id:'ALUMNI',label:'alumni'}]},
  {label:'Graduaat',classes:[{id:'1GRADUAAT',label:'1 graduaat'},{id:'2GRADUAAT',label:'2 graduaat'}]},
];
export const CLASS_IDS = CLASS_GROUPS.flatMap(group=>group.classes.map(klass=>klass.id));
export const DEFAULT_CLASS = '1ITF04';
export function classLabel(id){return CLASS_GROUPS.flatMap(group=>group.classes).find(klass=>klass.id===id)?.label||id;}
export function resolveClass(value){
  if(typeof value!=='string')return null;
  const normalized=value.trim().toLowerCase();
  return CLASS_IDS.find(id=>id.toLowerCase()===normalized||classLabel(id)===normalized)||null;
}
