import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'CHIRON',
    template: '%s · CHIRON',
  },
  description: 'Prontuário, agenda e gestão clínica veterinária.',
  applicationName: 'CHIRON',
  formatDetection: { telephone: false },
  // iPhone ignora o manifesto para o ícone da tela inicial e pede PNG próprio.
  icons: { apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'CHIRON', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full`}>
      <body className="app-shell min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
