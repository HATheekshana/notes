import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
export const cookieName='renxzero_admin';
const secret=()=>process.env.ADMIN_PASSWORD || '';
export function passwordMatches(value:string){const key=secret();const a=Buffer.from(value),b=Buffer.from(key);return key.length>=12 && a.length===b.length && timingSafeEqual(a,b);}
export function sessionToken(){const expires=String(Date.now()+8*60*60*1000);return expires+'.'+createHmac('sha256',secret()).update(expires).digest('hex');}
export async function isAdmin(){if(secret().length<12)return false;const token=(await cookies()).get(cookieName)?.value; if(!token)return false;const [expires,signature]=token.split('.');if(!expires||!signature||!/^\d+$/.test(expires)||Number(expires)<Date.now()||!/^[a-f0-9]{64}$/.test(signature))return false;const expected=createHmac('sha256',secret()).update(expires).digest('hex');return timingSafeEqual(Buffer.from(signature),Buffer.from(expected));}
export function sameOrigin(req:Request){const origin=req.headers.get('origin'),host=req.headers.get('host');if(!origin||!host)return false;try{const parsed=new URL(origin);return (parsed.protocol==='http:'||parsed.protocol==='https:')&&parsed.origin===origin&&parsed.host===host;}catch{return false;}}
