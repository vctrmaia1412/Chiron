import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CHIRON',
    short_name: 'CHIRON',
    description: 'Prontuário, agenda e gestão clínica veterinária.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f8f8',
    theme_color: '#0f766e',
    orientation: 'portrait-primary',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
