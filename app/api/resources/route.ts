import { isAdmin, sameOrigin } from '@/lib/auth';
import { listResources, uploadResource, downloadResource, deleteResource, prepareResourceUpload, completeResourceUpload, signedResourceDownload } from '@/lib/resources';
import { requireSubject } from '@/lib/curriculum';
import { InputError } from '@/lib/errors';
import { cloudConfigured } from '@/lib/supabase-repository';
import { MAX_PDF_BYTES, validSubject, validResourceKey, validatePdf } from '@/lib/resources-model';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const fail=()=>Response.json({error:'Resources unavailable. Check Supabase Storage and run supabase/resources.sql.'},{status:503});
// The subject must exist in the curriculum (the format check alone only keeps the id safe).
async function gate(subject:string){try{await requireSubject(subject);return null;}catch(e){return e instanceof InputError?Response.json({error:e.message},{status:400}):fail();}}
export async function GET(req:Request) {
  const params=new URL(req.url).searchParams,subject=params.get('subject')||'',key=params.get('key');
  if(!validSubject(subject)||(key!==null&&!validResourceKey(key)))return Response.json({error:'Invalid resource.'},{status:400});
  {const bad=await gate(subject);if(bad)return bad;}
  try {
    if(key){
      const resource=(await listResources(subject)).find(item=>item.key===key);
      if(!resource)return Response.json({error:'Resource not found.'},{status:404});
      if(cloudConfigured()&&resource.size>4*1024*1024)return Response.redirect(await signedResourceDownload(subject,key),302);
      const data=await downloadResource(subject,key);
      return new Response(new Blob([Buffer.from(data)],{type:'application/pdf'}),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${key.slice(38)}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
    }
    return Response.json(await listResources(subject),{headers:{'Cache-Control':'no-store'}});
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return Response.json({error:'Resource not found.'},{status:404});return fail();}
}
export async function POST(req:Request) {
  if(!sameOrigin(req)||!await isAdmin())return Response.json({error:'Administrator login required.'},{status:401});
  if((req.headers.get('content-type')||'').includes('application/json')){
    let body:{action?:string;subject?:string;name?:string;key?:string;size?:number};
    try{const raw=await req.text();if(raw.length>4096)return Response.json({error:'Request too large.'},{status:413});const parsed:unknown=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return Response.json({error:'Invalid request.'},{status:400});body=parsed as typeof body;}catch{return Response.json({error:'Invalid request.'},{status:400});}
    const subject=String(body.subject||'');
    if(!validSubject(subject))return Response.json({error:'Invalid subject.'},{status:400});
    {const bad=await gate(subject);if(bad)return bad;}
    if(body.action==='prepare-upload'){
      if(typeof body.name!=='string'||typeof body.size!=='number')return Response.json({error:'Choose a subject and PDF file.'},{status:400});
      if(!/\.pdf$/i.test(body.name))return Response.json({error:'Choose a PDF file.'},{status:400});
      if(!Number.isSafeInteger(body.size)||body.size<=0)return Response.json({error:'PDF is empty or has an invalid size.'},{status:400});
      if(body.size>MAX_PDF_BYTES)return Response.json({error:'PDFs must be 50 MB or smaller.'},{status:400});
      try{const prepared=await prepareResourceUpload(subject,body.name,body.size);return Response.json(prepared?{direct:true,...prepared}:{direct:false});}
      catch{return fail();}
    }
    if(body.action==='complete-upload'){
      if(typeof body.key!=='string'||!validResourceKey(body.key)||typeof body.size!=='number')return Response.json({error:'Invalid PDF upload.'},{status:400});
      if(!Number.isSafeInteger(body.size)||body.size<=0||body.size>MAX_PDF_BYTES)return Response.json({error:'Invalid PDF size.'},{status:400});
      try{return Response.json(await completeResourceUpload(subject,body.key,body.size));}
      catch(e){const message=e instanceof Error?e.message:'';if(message==='The uploaded PDF could not be verified.'||message==='This file is not a valid PDF.'||message==='The uploaded PDF size does not match.')return Response.json({error:message},{status:400});return fail();}
    }
    return Response.json({error:'Invalid request.'},{status:400});
  }
  if(Number(req.headers.get('content-length'))>MAX_PDF_BYTES+65536)return Response.json({error:'PDFs must be 50 MB or smaller.'},{status:413});
  let subject:string,file:File,bytes:Uint8Array;
  try {const form=await req.formData();subject=String(form.get('subject')||'');const value=form.get('file');if(!validSubject(subject)||!(value instanceof File))throw Error('Choose a subject and PDF file.');file=value;if(file.size>MAX_PDF_BYTES)throw Error('PDFs must be 50 MB or smaller.');bytes=new Uint8Array(await file.arrayBuffer());validatePdf(file.name,bytes);}catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid upload.'},{status:400});}
  {const bad=await gate(subject);if(bad)return bad;}
  try{return Response.json(await uploadResource(subject,file.name,bytes),{status:201});}catch{return fail();}
}
export async function DELETE(req:Request) {
  if(!sameOrigin(req)||!await isAdmin())return Response.json({error:'Administrator login required.'},{status:401});
  const params=new URL(req.url).searchParams,subject=params.get('subject')||'',key=params.get('key')||'';
  if(!validSubject(subject)||!validResourceKey(key))return Response.json({error:'Invalid resource.'},{status:400});
  {const bad=await gate(subject);if(bad)return bad;}
  try{await deleteResource(subject,key);return Response.json({ok:true});}catch{return fail();}
}
