import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WNY Automation Admin',
    short_name: 'WNY Admin',
    description: 'The private WNY Automation command station for tickets, portals, staging, and operations.',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f3f5f1',
    theme_color: '#10251d',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/assets/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/assets/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/assets/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/assets/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
    shortcuts: [
      {
        name: 'Tickets',
        short_name: 'Tickets',
        url: '/admin',
        description: 'Open the admin ticket board.',
      },
      {
        name: 'Staging',
        short_name: 'Staging',
        url: '/admin/staging',
        description: 'Open staging status.',
      },
      {
        name: 'Webhook Failures',
        short_name: 'Webhooks',
        url: '/admin/webhook-failures',
        description: 'Review webhook failures.',
      },
    ],
  };
}
