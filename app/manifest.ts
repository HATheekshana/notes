import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'UNINotes',
    short_name: 'UNINotes',
    description: 'Your study notes, organised by course, semester and subject, that work offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fafbfe',
    theme_color: '#7568ec',
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
