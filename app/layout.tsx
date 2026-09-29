import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
export const metadata:Metadata={title:'RenxZero — Study workspace',description:'A personal university knowledge base for FOA, OS, IWT, DBMS and OOP.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><body>{children}</body></html>;}
