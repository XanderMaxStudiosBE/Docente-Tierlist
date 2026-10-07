import { DatabaseSync } from 'node:sqlite';
import { readdirSync,readFileSync } from 'node:fs';
export function localDatabase(filename=':memory:'){
  const sqlite=new DatabaseSync(filename);
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
    sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
    if(!sqlite.prepare('SELECT name FROM local_migrations WHERE name = ?').get(file)){
      sqlite.exec('BEGIN');try{sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(file);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
    }
  }
  function statement(sql,params=[]){return {bind(...values){return statement(sql,values);},execute(){const stmt=sqlite.prepare(sql);if(/^\s*SELECT/i.test(sql))return {success:true,results:stmt.all(...params)};stmt.run(...params);return {success:true,results:[]};}};}
  return {prepare:sql=>statement(sql),async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close:()=>sqlite.close()};
}
