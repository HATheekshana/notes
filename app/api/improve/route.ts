import { isAdmin,sameOrigin } from '@/lib/auth';
import { improve } from '@/lib/ai';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:Request){if(!sameOrigin(req)||!await isAdmin())return Response.json({error:'Administrator login required.'},{status:401});try{const {content}=await req.json();if(typeof content!=='string'||!content.trim()||content.length>30000)return Response.json({error:'Paste 1–30,000 characters to improve.'},{status:400});return Response.json(await improve(content));}catch{return Response.json({error:'Unable to improve notes.'},{status:400});}}
