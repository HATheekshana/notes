import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cloudConfigured, cloudRequired } from './supabase-repository.ts';
import { safePdfName, validResourceKey, validSubject, validatePdf, type Resource } from './resources-model.ts';
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
      result.push(...page.filter(r=>validResourceKey(r.name)).map(r=>({key:r.name,name:r.name.slice(38),size:r.metadata?.size||0,createdAt:r.created_at})));
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
