import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import PwaRegister from '@/components/pwa-register';
import './globals.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

export const metadata: Metadata = {
  title: 'RenxZero — Study workspace',
  description: 'A personal university knowledge base, organised by course, semester and subject.',
  icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'UNINotes', statusBarStyle: 'default' },
};
export const viewport: Viewport = { themeColor: '#7568ec' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        {children}
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}