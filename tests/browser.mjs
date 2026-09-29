import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{});
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('Browser '+m.type()+': '+m.text());});
mkdirSync('test-results',{recursive:true});
try{
 await page.goto(base);await page.getByRole('link',{name:/Introduction to Algorithms/}).waitFor();
 assert.equal(await page.locator('.subject-card').count(),5);
 await page.screenshot({path:'test-results/desktop.png',fullPage:true,caret:'initial'});
 await page.getByRole('button',{name:'Switch to dark mode'}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.reload();await page.getByRole('button',{name:'Switch to light mode'}).waitFor();await page.getByRole('button',{name:'Switch to light mode'}).click();
 await page.getByLabel('Search all notes').fill('complexity');await page.getByRole('heading',{name:'Search results'}).waitFor();await page.getByRole('link',{name:/Introduction to Algorithms/}).click();
 await page.locator('.katex').first().waitFor();assert.ok(await page.locator('.hljs').count()>0);assert.equal(await page.locator('.toc>a').count(),8);
 await page.getByRole('button',{name:'Mark as complete'}).click();await page.reload();await page.getByRole('button',{name:'Completed',exact:true}).waitFor();
 await page.screenshot({path:'test-results/reading.png',fullPage:true,caret:'initial'});
 await page.goto(base+'/admin');await page.getByLabel('Admin password').fill(process.env.TEST_ADMIN_PASSWORD||'');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'New note',exact:true}).waitFor();
 await page.getByRole('button',{name:'New note',exact:true}).click();await page.getByLabel('Lesson title').fill('Browser workflow test');await page.getByLabel('Note Markdown').fill('## Test lesson\n\nA **bold** idea with $n^2$.\n\n```js\nconst n = 3;\n```');await page.getByLabel('Tags (comma-separated)').fill('test, practice');
 await page.locator('.preview-pane .katex').waitFor();await page.getByRole('button',{name:'Improve with AI'}).click();await page.getByRole('dialog').waitFor();assert.ok((await page.getByRole('dialog').innerText()).includes('Local formatting'));
 await page.getByRole('button',{name:'Accept suggestion'}).click();assert.equal(await page.getByRole('dialog').count(),0);await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft saved.',{exact:false}).waitFor();
 const anonymous=await browser.newContext();const response=await anonymous.request.get(base+'/api/notes');assert.ok(!(await response.json()).some(n=>n.title==='Browser workflow test'));await anonymous.close();
 await page.screenshot({path:'test-results/editor.png',fullPage:true,caret:'initial'});
 await page.getByRole('button',{name:'Publish note',exact:true}).click();await page.getByText('Note published.',{exact:false}).waitFor();await page.getByRole('button',{name:'All notes',exact:true}).click();
 await page.getByRole('button',{name:'Delete Browser workflow test',exact:true}).click();await page.getByRole('button',{name:'Delete note',exact:true}).click();await page.getByText('Note deleted.',{exact:false}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.goto(base);await page.locator('.subject-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('link',{name:'OS 0',exact:true}).click();await page.getByRole('heading',{name:'Operating Systems.'}).waitFor();
 await page.goto(base);await page.screenshot({path:'test-results/mobile.png',fullPage:true,caret:'initial'});assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile layout, theme persistence, search, KaTeX, code highlighting, contents, progress, login, editor preview, AI review, draft privacy, publish and delete.');
}finally{await browser.close();}

