import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NetBypass — Cloudflare-Style Network Bypass',
  description:
    'Route your network traffic through our global edge network. Bypass WiFi restrictions, access blocked content, and protect your privacy with NetBypass.',
  keywords: ['network bypass', 'proxy', 'cloudflare', 'wifi bypass', 'privacy'],
  openGraph: {
    title: 'NetBypass — Global Network Bypass',
    description: 'Bypass WiFi restrictions through our serverless edge network.',
    type: 'website',
  },
  verification: {
    google: 'google72df8b2f8b78cfe0',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
