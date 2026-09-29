import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseRepository, supabaseRequest, allowLoginAttempt, cloudRequired } from '../lib/supabase-repository.ts';

test('Supabase adapter enforces filtering, credentials, CRUD semantics and pagination',async()=>{
 const originalFetch=globalThis.fetch;
 const env={...process.env};process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 const row={id:'test-note',subject:'FOA',title:'Test',content:'Text',tags:[],published:false,updated_at:'2026-09-29T00:00:00Z'};
 let calls:{url:string;init:RequestInit}[]=[];
 globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init:init!});return Response.json([row]);};
 try{
  const db=createSupabaseRepository();assert.equal((await db.list())[0].updatedAt,row.updated_at);assert.ok(calls.at(-1)!.url.includes('published=eq.true'));
  const headers=calls[0].init.headers as Record<string,string>;assert.equal(headers.apikey,'sb_secret_test');assert.equal(headers.Authorization,undefined);assert.equal(calls[0].init.cache,'no-store');
  await db.list(true);assert.ok(!calls.at(-1)!.url.includes('published='));
  const {id,updated_at,...note}=row;await db.save(note);assert.equal(calls.at(-1)!.init.method,'POST');
  await db.save(note,id);assert.equal(calls.at(-1)!.init.method,'PATCH');assert.ok(calls.at(-1)!.url.includes('id=eq.test-note'));
  assert.equal(await db.delete(id),true);assert.equal(calls.at(-1)!.init.method,'DELETE');
  globalThis.fetch=async()=>Response.json([]);await assert.rejects(()=>db.save(note,id),/no longer exists/);assert.equal(await db.delete(id),false);
  calls=[];globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init:init!});return Response.json(calls.length===1?Array.from({length:500},()=>row):[row]);};assert.equal((await db.list()).length,501);assert.ok(calls[1].url.includes('offset=500'));
  globalThis.fetch=async()=>Response.json(false);assert.equal(await allowLoginAttempt(),false);
  globalThis.fetch=async()=>Response.json(true);assert.equal(await allowLoginAttempt(),true);
  globalThis.fetch=async()=>new Response('SECRET PROVIDER DETAILS',{status:500});await assert.rejects(()=>supabaseRequest('notes'),e=>e instanceof Error&&!e.message.includes('SECRET PROVIDER'));
  delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;process.env.VERCEL='1';assert.equal(cloudRequired(),true);await assert.rejects(()=>allowLoginAttempt(),/not configured/);
 }finally{globalThis.fetch=originalFetch;process.env=env;}
});
