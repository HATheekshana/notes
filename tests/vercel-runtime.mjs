// Validates the built app's behavior on Vercel before credentials are supplied.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const database=resolve('../../work/must-not-create.sqlite');
assert.equal(existsSync(database),false);
const env={...process.env,VERCEL:'1',SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',ADMIN_PASSWORD:'runtime-test-password',DATABASE_PATH:database};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3011'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
try{
 await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),15000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code));});child.stdout.on('data',d=>{if(d.toString().includes('Ready')){clearTimeout(timer);done();}});});
 const base='http://127.0.0.1:3011';
 assert.equal((await fetch(base)).status,200);
 const notes=await fetch(base+'/api/notes');assert.equal(notes.status,503);assert.ok((await notes.json()).error.includes('database'));
 const login=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password:'runtime-test-password'})});assert.equal(login.status,503);
 assert.equal(existsSync(database),false);
 console.log('PASS: Vercel runtime fails safely without database credentials and never creates a local database.');
}finally{child.kill();}
