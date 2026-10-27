import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cloudConfigured, cloudRequired } from './supabase-repository.ts';
import { MAX_PDF_BYTES, safePdfName, validResourceKey, validSubject, validatePdf, type Resource } from './resources-model.ts';
const bucket = 'subject-resources';
function check(subject: string, key?: string) {
  if (!validSubject(subject) || (key !== undefined && !validResourceKey(key))) throw Error('Invalid resource.');
  if (!cloudConfigured() && cloudRequired()) throw Error('Resources are not configured.');
}
function folder(subject: string) { return resolve(process.env.DATABASE_PATH ? dirname(process.env.DATABASE_PATH) : 'data', 'resources', subject); }
async function storage(path: string, init: RequestInit = {}) {
  const origin = new URL(process.env.SUPABASE_URL!);
  if (origin.protocol !== 'https:') throw Error('Invalid storage URL.');
  const key = process.env.SUPABASE_SECRET_KEY!;
  const response = await fetch(`${origin.origin}/storage/v1/${path}`, { ...init, cache:'no-store', signal:AbortSignal.timeout(25000), headers: { apikey:key, ...(key.startsWith('eyJ') ? {Authorization:`Bearer ${key}`} : {}), ...init.headers } });
  if (!response.ok) throw Error('Resources unavailable. Run supabase/resources.sql and check Supabase Storage.');
  return response;
}
export async function listResources(subject: string): Promise<Resource[]> {
  check(subject);
  if (cloudConfigured()) {
    const result: Resource[] = [];
    for (let offset=0;;offset+=100) {
      const page: {name:string;created_at:string;metadata?:{size?:number}}[] = await (await storage(`object/list/${bucket}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:subject+'/',limit:100,offset,sortBy:{column:'created_at',order:'desc'}})})).json();
      result.push(...page.filter(r=>validResourceKey(r.name)).map(r=>({key:r.name,name:r.name.slice(38),size:Number(r.metadata?.size)||0,createdAt:r.created_at})));
      if(page.length<100) return result;
    }
  }
  let names:string[];
  try { names=await readdir(folder(subject)); } catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e; }
  return (await Promise.all(names.filter(validResourceKey).map(async key=>{const s=await stat(resolve(folder(subject),key));return {key,name:key.slice(38),size:s.size,createdAt:s.birthtime.toISOString()};}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function uploadResource(subject:string,name:string,bytes:Uint8Array) {
  check(subject);validatePdf(name,bytes);
  const key=randomUUID()+'--'+safePdfName(name);
  if(cloudConfigured()) await storage(`object/${bucket}/${subject}/${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/pdf','x-upsert':'false'},body:new Blob([Buffer.from(bytes)],{type:'application/pdf'})});
  else {await mkdir(folder(subject),{recursive:true});await writeFile(resolve(folder(subject),key),bytes,{flag:'wx'});}
  return {key,name:key.slice(38),size:bytes.length,createdAt:new Date().toISOString()};
}
export async function prepareResourceUpload(subject:string,name:string,size:number) {
  check(subject);
  if(!/\.pdf$/i.test(name))throw Error('Choose a PDF file.');
  if(!Number.isSafeInteger(size)||size<=0)throw Error('PDF is empty or has an invalid size.');
  if(size>MAX_PDF_BYTES)throw Error('PDFs must be 50 MB or smaller.');
  if(!cloudConfigured())return null;
  const key=randomUUID()+'--'+safePdfName(name);
  const origin=new URL(process.env.SUPABASE_URL!);
  const result=await storage(`object/upload/sign/${bucket}/${subject}/${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
  const data=await result.json() as {url?:string};
  if(typeof data.url!=='string')throw Error('Could not prepare the PDF upload.');
  const signedUrl=new URL(`${origin.origin}/storage/v1${data.url.startsWith('/')?data.url:'/'+data.url}`);
  if(signedUrl.origin!==origin.origin)throw Error('Could not prepare the PDF upload.');
  return {key,signedUrl:signedUrl.toString()};
}
export async function completeResourceUpload(subject:string,key:string,size:number) {
  check(subject,key);
  if(!Number.isSafeInteger(size)||size<=0||size>MAX_PDF_BYTES)throw Error('Invalid PDF size.');
  const resource=(await listResources(subject)).find(item=>item.key===key);
  if(!resource)throw Error('The uploaded PDF could not be verified.');
  if(resource.size!==size){
    await deleteResource(subject,key);
    throw Error('The uploaded PDF size does not match.');
  }
  const response=await storage(`object/${bucket}/${subject}/${encodeURIComponent(key)}`,{headers:{Range:'bytes=0-4'}});
  const reader=response.body?.getReader();
  if(!reader)throw Error('The uploaded PDF could not be verified.');
  const {value}=await reader.read();
  await reader.cancel();
  if(!value||value.length<5||new TextDecoder().decode(value.slice(0,5))!=='%PDF-'){
    await deleteResource(subject,key);
    throw Error('This file is not a valid PDF.');
  }
  const range=response.headers.get('content-range');
  const actualSize=range&&Number(range.slice(range.lastIndexOf('/')+1));
  if(actualSize&&actualSize!==size){
    await deleteResource(subject,key);
    throw Error('The uploaded PDF size does not match.');
  }
  return resource;
}
export async function signedResourceDownload(subject:string,key:string) {
  check(subject,key);
  const resource=(await listResources(subject)).find(item=>item.key===key);
  if(!resource)throw Error('Resource not found.');
  const origin=new URL(process.env.SUPABASE_URL!);
  const result=await storage(`object/sign/${bucket}/${subject}/${encodeURIComponent(key)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({expiresIn:60}),
  });
  const data=await result.json() as {signedURL?:string};
  if(typeof data.signedURL!=='string')throw Error('Could not prepare the PDF download.');
  const signedUrl=new URL(`${origin.origin}/storage/v1${data.signedURL.startsWith('/')?data.signedURL:'/'+data.signedURL}`);
  if(signedUrl.origin!==origin.origin)throw Error('Could not prepare the PDF download.');
  signedUrl.searchParams.set('download',resource.name);
  return signedUrl.toString();
}
export async function downloadResource(subject:string,key:string) {
  check(subject,key);
  if(cloudConfigured())return new Uint8Array(await (await storage(`object/${bucket}/${subject}/${encodeURIComponent(key)}`)).arrayBuffer());
  return new Uint8Array(await readFile(resolve(folder(subject),key)));
}
export async function deleteResource(subject:string,key:string) {
  check(subject,key);
  if(cloudConfigured())await storage(`object/${bucket}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[subject+'/'+key]})});
  else await unlink(resolve(folder(subject),key));
}
