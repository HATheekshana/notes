import { cookies } from 'next/headers';
import { cookieName,isAdmin,passwordMatches,sameOrigin,sessionToken } from '@/lib/auth';
import { allowLoginAttempt } from '@/lib/supabase-repository';
export const runtime='nodejs';
export async function GET(){return Response.json({admin:await isAdmin(),configured:(process.env.ADMIN_PASSWORD?.length||0)>=12});}
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid origin'},{status:403});
 try{if(!await allowLoginAttempt())return Response.json({error:'Too many attempts. Wait one minute.'},{status:429,headers:{'Retry-After':'60'}});}catch{return Response.json({error:'Login unavailable. Check the Supabase setup.'},{status:503});}
 try{const raw=await req.text();if(raw.length>4096)throw Error('Too large');const {password}=JSON.parse(raw);if(typeof password!=='string'||!passwordMatches(password))return Response.json({error:'Incorrect password, or admin is not configured.'},{status:401});(await cookies()).set(cookieName,sessionToken(),{httpOnly:true,sameSite:'strict',secure:!!process.env.VERCEL||new URL(req.url).protocol==='https:',path:'/',maxAge:28800});return Response.json({admin:true});}catch{return Response.json({error:'Invalid request'},{status:400});}
}
export async function DELETE(req:Request){if(!sameOrigin(req))return Response.json({error:'Invalid origin'},{status:403});(await cookies()).delete(cookieName);return Response.json({ok:true});}
