'use client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
export function headingId(text:string){return text.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');}
export default function NoteMarkdown({content}:{content:string}){return <div className="prose"><Markdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex,rehypeHighlight]} components={{h2:({children})=><h2 id={headingId(String(children))}>{children}</h2>,h3:({children})=><h3 id={headingId(String(children))}>{children}</h3>}}>{content}</Markdown></div>;}
