import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
export function localPhotos(directory){
  const resolve=key=>{if(!/^teachers\/[a-f0-9-]{36}$/.test(key))throw new Error('Invalid photo key');return path.join(directory,key.slice(9));};
  return {async put(key,bytes,options){await mkdir(directory,{recursive:true});const file=resolve(key);await writeFile(file,bytes);await writeFile(file+'.json',JSON.stringify(options.httpMetadata));},async get(key){const file=resolve(key);try{return {body:await readFile(file),httpMetadata:JSON.parse(await readFile(file+'.json','utf8'))};}catch(error){if(error.code==='ENOENT')return null;throw error;}},async delete(key){const file=resolve(key);await Promise.all([unlink(file).catch(()=>{}),unlink(file+'.json').catch(()=>{})]);}};
}
