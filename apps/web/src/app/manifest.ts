import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CHIRON',
    short_name: 'CHIRON',
    description: 'Prontuário, agenda e gestão clínica veterinária.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f8f8',
    theme_color: '#0f766e',
    // Sem travar orientação: o atendimento no tablet é feito em paisagem.
    // Android só oferece "instalar" com PNG de 192 e 512; o "maskable" enche o
    // recorte redondo do launcher sem borda branca.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Agenda', url: '/agenda', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Atendimentos', url: '/atendimentos', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Pacientes', url: '/pacientes', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
