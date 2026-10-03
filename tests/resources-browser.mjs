import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3012';
const browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'msedge'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
try{
 await page.goto(base+'/admin');await page.getByLabel('Admin password').fill(process.env.TEST_ADMIN_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'New note',exact:true}).click();
 await page.getByRole('combobox').selectOption('OS');await page.getByLabel('Lesson title').fill('Publish notification test');await page.getByLabel('Note Markdown').fill('A test lesson.');await page.getByRole('button',{name:'Publish note',exact:true}).click();
 const banner=page.locator('.banner.success');await banner.getByRole('button',{name:'Back to notes'}).waitFor();await banner.getByRole('button',{name:'New note',exact:true}).click();assert.equal(await page.getByLabel('Lesson title').inputValue(),'');assert.equal(await page.getByLabel('Note Markdown').inputValue(),'');assert.equal(await page.getByRole('combobox').inputValue(),'OS');
 await page.getByLabel('Lesson title').fill('Publish second test');await page.getByLabel('Note Markdown').fill('Second lesson.');await page.getByRole('button',{name:'Publish note',exact:true}).click();await banner.getByRole('button',{name:'Back to notes'}).click();await page.getByRole('button',{name:'Delete Publish second test',exact:true}).waitFor();
 for(const title of ['Publish notification test','Publish second test']){await page.getByRole('button',{name:'Delete '+title,exact:true}).click();await page.getByRole('button',{name:'Delete note',exact:true}).click();await page.getByRole('alertdialog').waitFor({state:'hidden'});}
 for(const subject of ['FOA','OS','IWT','DBMS','OOP']){await page.goto(base+'/subjects/'+subject);await page.getByRole('heading',{name:'Resources & PDFs'}).waitFor();await page.getByRole('button',{name:'Upload PDF'}).waitFor();}
 await page.goto(base+'/subjects/OS');await page.getByLabel('Choose PDF resource').setInputFiles({name:'OS lecture.pdf',mimeType:'application/pdf',buffer:pdf});await page.getByText('PDF uploaded.',{exact:false}).waitFor();await page.getByText('OS lecture.pdf',{exact:true}).waitFor();await page.reload();await page.getByText('OS lecture.pdf',{exact:true}).waitFor();
 const downloadUrl=await page.getByRole('link',{name:'Download',exact:true}).getAttribute('href');const anonymous=await browser.newContext();const response=await anonymous.request.get(base+downloadUrl);assert.equal(response.status(),200);assert.deepEqual(await response.body(),pdf);assert.ok(response.headers()['content-disposition'].includes('attachment'));
 assert.equal((await anonymous.request.delete(base+downloadUrl,{headers:{Origin:base}})).status(),401);
 assert.equal((await anonymous.request.post(base+'/api/resources',{headers:{Origin:base}})).status(),401);
 const invalid=await context.request.post(base+'/api/resources',{headers:{Origin:base},multipart:{subject:'OS',file:{name:'fake.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')}}});assert.equal(invalid.status(),400);
 assert.equal((await context.request.get(base+'/api/resources?subject=OS&key=../../secret')).status(),400);
 await page.screenshot({path:'test-results/resources-desktop.png',fullPage:true,caret:'initial'});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);await page.screenshot({path:'test-results/resources-mobile.png',fullPage:true,caret:'initial'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.goto(base+'/subjects/FOA');assert.equal(await page.getByText('OS lecture.pdf',{exact:true}).count(),0);
 await page.goto(base+'/subjects/OS');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete resource OS lecture.pdf',exact:true}).click();await page.getByText('PDF deleted.',{exact:false}).waitFor();assert.equal(await page.getByText('OS lecture.pdf',{exact:true}).count(),0);await anonymous.close();assert.deepEqual(errors,[]);
 console.log('PASS: publishing Back/New note actions; every subject resources section; PDF persistence, download bytes, subject isolation, admin-only changes, invalid file rejection, mobile layout and deletion.');
}finally{await browser.close();}


