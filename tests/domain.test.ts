import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteTitleFromFileName, validateNote } from '../lib/model.ts';
import { fallback } from '../lib/ai.ts';
const valid={title:'A lesson',subject:'FOA',content:'## Notes\n\nSome content',tags:['math','math',' '],published:false};
test('creates note titles from uploaded file names',()=>{assert.equal(noteTitleFromFileName('week_1-notes.md'),'week 1 notes');assert.equal(noteTitleFromFileName('lecture.markdown'),'lecture');assert.equal(noteTitleFromFileName('.txt'),'Untitled note');});
test('validates notes and normalizes tags',()=>{assert.deepEqual(validateNote(valid).tags,['math']);});
test('rejects invalid subject, empty content and missing publish status',()=>{for(const patch of [{subject:'BAD'},{content:''},{published:'yes'},{title:''},{tags:['a'.repeat(41)]}])assert.throws(()=>validateNote({...valid,...patch}));});
test('fallback preserves formulas and code without inventing content',async()=>{const input='## Notes\n\n$$f(n) \\leq c g(n)$$\n\n```python\n  x = 3\n```';const r=await fallback.improve(input);assert.equal(r.mode,'fallback');assert.equal(r.content,input);});
