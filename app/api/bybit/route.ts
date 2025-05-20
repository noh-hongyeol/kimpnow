// app/api/bybit/route.ts

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const proxyUrl = 'https://corsproxy.io/?https://api.bybit.com/v5/market/tickers?category=spot';

    const res = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0', // 프록시에서도 UA 필수
      },
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`프록시 요청 실패: ${res.status}`);

    const json = await res.json();

    const list = json?.result?.list;

    if (!Array.isArray(list)) throw new Error('Bybit 응답 구조 오류');

    return NextResponse.json(list);
  } catch (error) {
    console.error('❌ Bybit API 실패:', error);
    return NextResponse.json({ error: 'Bybit API 실패' }, { status: 500 });
  }
}
