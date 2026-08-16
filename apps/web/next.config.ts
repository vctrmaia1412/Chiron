import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Raiz do monorepo: `fileURLToPath` evita o caminho `/C:/...` no Windows.
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const nextConfig: NextConfig = {
  // Saída autocontida para a imagem Docker: o servidor sai pronto em
  // .next/standalone, sem precisar do node_modules inteiro em produção.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
