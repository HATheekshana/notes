import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PDF_BYTES, validatePdf, validResourceKey, safePdfName } from '../lib/resources-model.ts';
import { listResources, uploadResource, downloadResource, deleteResource, prepareResourceUpload, completeResourceUpload, signedResourceDownload } from '../lib/resources.ts';
test('PDF validation rejects invalid extensions, content, oversize files and unsafe object keys',()=>{
 const pdf=new TextEncoder().encode('%PDF-1.4\n%%EOF');validatePdf('lecture.PDF',pdf);
 assert.throws(()=>validatePdf('notes.html',pdf));assert.throws(()=>validatePdf('notes.pdf',new TextEncoder().encode('<html>')));
 assert.throws(()=>validatePdf('big.pdf',new Uint8Array(MAX_PDF_BYTES+1)));
 const maxPdf=new Uint8Array(MAX_PDF_BYTES);maxPdf.set(new TextEncoder().encode('%PDF-'));validatePdf('max.pdf',maxPdf);
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
test('large cloud PDFs use signed uploads and are verified before becoming available',async()=>{
 const originalFetch=globalThis.fetch,env={...process.env};process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 let key='';
 globalThis.fetch=async(url,init)=>{
  const u=String(url);
  if(u.includes('/object/upload/sign/'))return Response.json({url:'/object/upload/sign/subject-resources/OS/file.pdf?token=temporary'});
  if(u.includes('/object/list/'))return Response.json([{name:key,created_at:'2026-10-27',metadata:{size:MAX_PDF_BYTES}}]);
  if(u.includes('/object/subject-resources/OS/'))return new Response(new Uint8Array([0x25,0x50,0x44,0x46,0x2d]),{status:206,headers:{'content-range':`bytes 0-4/${MAX_PDF_BYTES}`}});
  if(u.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/subject-resources/OS/file.pdf?token=temporary'});
  throw Error('Unexpected storage request');
 };
 try{
  const prepared=await prepareResourceUpload('OS','large.pdf',MAX_PDF_BYTES);
  assert.ok(prepared);key=prepared.key;
  assert.ok(prepared.signedUrl.startsWith('https://example.supabase.co/storage/v1/object/upload/sign/'));
  const verified=await completeResourceUpload('OS',key,MAX_PDF_BYTES);
  assert.equal(verified.size,MAX_PDF_BYTES);
  const download=await signedResourceDownload('OS',key);
  assert.ok(download.startsWith('https://example.supabase.co/storage/v1/object/sign/'));
  assert.equal(new URL(download).searchParams.get('download'),'large.pdf');
 }finally{globalThis.fetch=originalFetch;process.env=env;}
});
