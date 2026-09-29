// One-time non-destructive import. Existing cloud IDs are preserved unchanged.
import { DatabaseSync } from 'node:sqlite';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
if(!url||!key)throw Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY first.');
const origin=new URL(url);if(origin.protocol!=='https:')throw Error('HTTPS required.');
const db=new DatabaseSync(process.env.DATABASE_PATH||'data/renxzero.sqlite',{readOnly:true});
try{
 const notes=db.prepare('SELECT * FROM notes').all().map(({updatedAt,tags,published,...n})=>({...n,updated_at:updatedAt,tags:JSON.parse(tags),published:!!published}));
 for(let i=0;i<notes.length;i+=100){
  const r=await fetch(origin.origin+'/rest/v1/notes?on_conflict=id',{method:'POST',headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{}) ,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(notes.slice(i,i+100))});
  if(!r.ok)throw Error('Import failed. Check database configuration and setup.sql; existing IDs are never overwritten.');
 }
 console.log(`Import complete: ${notes.length} local notes considered; existing cloud IDs left unchanged.`);
}finally{db.close();}
