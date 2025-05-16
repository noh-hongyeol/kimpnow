import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "김프 실시간 비교 | 업비트, 바이낸스, 빗썸 가격 자동 분석",
  description: "지금 바로 김치프리미엄을 비교하세요. 업비트, 빗썸, 바이낸스 실시간 가격/거래량을 자동 분석합니다. 실시간 환율 포함!",
  metadataBase: new URL("https://kimpnow.com"),
  openGraph: {
    title: "김프 실시간 | KimpNow",
    description: "실시간 김치프리미엄 비교, 업비트/빗썸/바이낸스 가격 자동 분석",
    url: "https://kimpnow.com",
    siteName: "KimpNow",
    images: [
      {
        url: "https://kimpnow.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "김프 실시간 비교",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://kimpnow.com",
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="naver-site-verification" content="4346a8b10d13c7e2c15710873affe30f3dc9e077" />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        {/* ✅ GA 추적코드 – 조건문 없이 항상 삽입 */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-NWD7ZM5M6C"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-NWD7ZM5M6C');
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

