import './globals.css';

import type { Metadata } from 'next';
import localFont from 'next/font/local';

import { Toaster } from '@/components/ui/sonner';

const suit = localFont({
  src: './SUIT-Variable.woff2',
});

export const metadata: Metadata = {
  title: '위즈봇',
  description: '치지직 챗봇 위즈봇',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${suit.className} antialiased`}>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
