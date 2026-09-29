import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL setup, seed idempotency, permissions and durable login limit',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const sql=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query('select * from public.notes')).rows.length,1);
  const row=(await db.query<{content:string;tags:string[]}>('select content,tags from public.notes')).rows[0];assert.ok(row.content.includes('\\Theta'));assert.deepEqual(row.tags,['foundations','complexity','big-o']);
  await db.exec("update public.notes set title='Edited lesson';");await db.exec(sql);assert.equal((await db.query<{title:string}>('select title from public.notes')).rows[0].title,'Edited lesson');
  await db.exec('set role anon;');await assert.rejects(()=>db.query('select * from public.notes'),/permission denied/);await assert.rejects(()=>db.query('select public.consume_login_attempt()'),/permission denied/);await db.exec('reset role;');
  await db.exec('set role authenticated;');await assert.rejects(()=>db.query('select * from public.notes'),/permission denied/);await db.exec('reset role;');
  await db.exec('set role service_role;');assert.equal((await db.query('select * from public.notes')).rows.length,1);
  for(let i=0;i<12;i++){const r=await db.query<{allowed:boolean}>('select public.consume_login_attempt() as allowed');assert.equal(r.rows[0].allowed,i<10);}
  await db.exec("update public.renxzero_login_limit set window_start=now()-interval '2 minutes';");assert.equal((await db.query<{allowed:boolean}>('select public.consume_login_attempt() as allowed')).rows[0].allowed,true);
  await db.exec('reset role; delete from public.notes;');await db.exec(sql);assert.equal((await db.query('select * from public.notes')).rows.length,0);
 }finally{await db.close();}
});
