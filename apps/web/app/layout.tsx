import './globals.css';

import type { Metadata } from 'next';
import localFont from 'next/font/local';

import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

const suit = localFont({
  src: './SUIT-Variable.woff2',
  // globals.css 의 body { font-family: var(--font-suit) } 가 실제로 이 변수를 읽는다
  variable: '--font-suit',
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
    // suppressHydrationWarning: next-themes 가 렌더 전에 html 클래스를 바꾼다
    <html lang="ko" suppressHydrationWarning>
      <body className={`${suit.className} ${suit.variable} antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
