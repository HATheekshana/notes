import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Note } from './model';
import { seedContent } from './seed';
export interface NotesRepository { list(): Note[]; save(note: Omit<Note,'id'|'updatedAt'>, id?:string): Note; delete(id:string): boolean; }
let instance: NotesRepository;
export function repository(): NotesRepository {
 if(instance) return instance;
 const path=process.env.DATABASE_PATH || resolve('data/renxzero.sqlite'); mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path); db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, subject TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL, published INTEGER NOT NULL, updatedAt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);');
 const decode=(r:Record<string,unknown>):Note=>({...r,tags:JSON.parse(r.tags as string),published:!!r.published}) as Note;
 instance={list:()=>db.prepare('SELECT * FROM notes ORDER BY updatedAt DESC').all().map(decode),save:(v,id)=>{const n={...v,id:id||randomUUID(),updatedAt:new Date().toISOString()};db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subject=excluded.subject,title=excluded.title,content=excluded.content,tags=excluded.tags,published=excluded.published,updatedAt=excluded.updatedAt').run(n.id,n.subject,n.title,n.content,JSON.stringify(n.tags),Number(n.published),n.updatedAt);return n;},delete:(id)=>Number(db.prepare('DELETE FROM notes WHERE id=?').run(id).changes)>0};
 if(!db.prepare("SELECT value FROM metadata WHERE key='seeded'").get()){instance.save({subject:'FOA',title:'Introduction to Algorithms',content:seedContent,tags:['foundations','complexity','big-o'],published:true},'introduction-to-algorithms');db.prepare("INSERT INTO metadata VALUES ('seeded','true')").run();}
 return instance;
}
