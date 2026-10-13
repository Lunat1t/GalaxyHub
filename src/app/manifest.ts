import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Galaxy Hub', short_name: 'Galaxy Hub',
    description: 'Кампус для встреч, общения и исследования пространства.',
    start_url: '/campus/hall', scope: '/', display: 'standalone',
    background_color: '#352b26', theme_color: '#352b26', lang: 'ru',
    icons: [
      { src: '/app-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
