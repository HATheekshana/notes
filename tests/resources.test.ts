import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PDF_BYTES, validatePdf, validResourceKey, safePdfName } from '../lib/resources-model.ts';
import { listResources, uploadResource, downloadResource, deleteResource } from '../lib/resources.ts';
test('PDF validation rejects invalid extensions, content, size and unsafe object keys',()=>{
 const pdf=new TextEncoder().encode('%PDF-1.4\n%%EOF');validatePdf('lecture.PDF',pdf);
 assert.throws(()=>validatePdf('notes.html',pdf));assert.throws(()=>validatePdf('notes.pdf',new TextEncoder().encode('<html>')));
 assert.throws(()=>validatePdf('big.pdf',new Uint8Array(MAX_PDF_BYTES+1)));
 assert.equal(validResourceKey('../../etc/passwd'),false);
 assert.equal(validResourceKey('d5e21a94-8ea9-4b20-b898-ff8f70dd7411--slides.pdf'),true);
 assert.equal(safePdfName('../../bad<>.PDF'),'.._.._bad__.pdf');
});
test('cloud PDF adapter uses private server credentials and subject paths',async()=>{
 const originalFetch=globalThis.fetch,env={...process.env};process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 const calls:{url:string;init:RequestInit}[]=[];const pdf=new TextEncoder().encode('%PDF-1.4\n%%EOF');
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init:init!});if(String(url).includes('/object/list/'))return Response.json([{name:'d5e21a94-8ea9-4b20-b898-ff8f70dd7411--slides.pdf',created_at:'2026-10-03',metadata:{size:pdf.length}}]);if(!init?.method)return new Response(pdf);return Response.json({});};
 try{
  const uploaded=await uploadResource('OS','slides.pdf',pdf);assert.ok(calls[0].url.includes('/object/subject-resources/OS/'));assert.equal((calls[0].init.headers as Record<string,string>).apikey,'sb_secret_test');assert.equal(calls[0].init.method,'POST');
  assert.equal((await listResources('OS'))[0].name,'slides.pdf');assert.equal(JSON.parse(calls[1].init.body as string).prefix,'OS/');
  assert.deepEqual(await downloadResource('OS',uploaded.key),pdf);await deleteResource('OS',uploaded.key);assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string),{prefixes:['OS/'+uploaded.key]});
  await assert.rejects(()=>listResources('../OS'),/Invalid/);globalThis.fetch=async()=>new Response('private internal details',{status:500});await assert.rejects(()=>listResources('OS'),/Resources unavailable/);
 }finally{globalThis.fetch=originalFetch;process.env=env;}
});
