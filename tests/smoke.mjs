// Run against a running app with TEST_ADMIN_PASSWORD set to its admin password.
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
let cookie='';
async function call(path,method='GET',body,authenticated=false){const r=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(authenticated?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {r,data:await r.json()};}
const initial=await call('/api/notes');assert.equal(initial.r.status,200);assert.ok(initial.data.some(n=>n.id==='introduction-to-algorithms'));
assert.equal((await call('/api/notes','POST',{})).r.status,401);
assert.equal((await call('/api/improve','POST',{content:'abc'})).r.status,401);
const login=await call('/api/session','POST',{password:process.env.TEST_ADMIN_PASSWORD});assert.equal(login.r.status,200);cookie=login.r.headers.get('set-cookie').split(';')[0];assert.ok(login.r.headers.get('set-cookie').includes('HttpOnly'));
let id;
try{
 const draft={title:'Smoke test draft',subject:'OS',content:'## First concept\n\nA **test** note.',tags:['test'],published:false};
 const created=await call('/api/notes','POST',draft,true);assert.equal(created.r.status,200);id=created.data.id;
 assert.ok(!(await call('/api/notes')).data.some(n=>n.id===id));
 assert.ok((await call('/api/notes','GET',undefined,true)).data.some(n=>n.id===id));
 const ai=await call('/api/improve','POST',{content:draft.content},true);assert.equal(ai.r.status,200);assert.ok(['fallback','provider'].includes(ai.data.mode));
 assert.ok(!(await call('/api/notes')).data.some(n=>n.id===id));
 assert.equal((await call('/api/notes','POST',{...draft,id,published:true,title:'Smoke test published'},true)).r.status,200);
 assert.ok((await call('/api/notes')).data.some(n=>n.id===id&&n.title==='Smoke test published'));
 const csrf=await fetch(base+'/api/notes',{method:'POST',headers:{Origin:'https://evil.invalid',Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(draft)});assert.equal(csrf.status,401);
 assert.equal((await call('/api/notes','POST',{...draft,subject:'NO'},true)).r.status,400);
}finally{if(id)assert.equal((await call('/api/notes?id='+id,'DELETE',undefined,true)).r.status,200);}
assert.equal((await call('/api/session','DELETE',undefined,true)).r.status,200);
console.log('PASS: seed, unauthorized access, login, HttpOnly session, private drafts, AI review separation, publish, CSRF protection, validation and delete.');
