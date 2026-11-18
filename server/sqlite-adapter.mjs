/* D1-compatible adapter used only for local tests and collaboration preview. */
import {DatabaseSync} from 'node:sqlite';
export function sqliteDB(file=':memory:'){
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
 return {
  raw:db,
  prepare(sql){
   return {
    bind(...args){
     const stmt=db.prepare(sql);
     return {
      first:async()=>stmt.get(...args)||null,
      all:async()=>({results:stmt.all(...args)}),
      run:async()=>{const result=stmt.run(...args);return {meta:{changes:Number(result.changes)}};}
     };
    }
   };
  }
 };
}
