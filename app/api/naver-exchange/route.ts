import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function noStoreJson(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    },
  });
}

export async function GET() {
  try {
    const res = await fetch('https://finance.naver.com/marketindex/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      },
      cache: 'no-store',
    });

    const html = await res.text();
    const match = html.match(/<span class=\"value\">([0-9,.]+)<\/span>/);

    if (!match?.[1]) {
      throw new Error('Naver USD/KRW value not found');
    }

    const rate = Number(match[1].replace(/,/g, ''));

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Invalid Naver USD/KRW value: ${match[1]}`);
    }

    return noStoreJson({
      success: true,
      rate,
      source: 'naver_marketindex',
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return noStoreJson(
      {
        success: false,
        rate: null,
        source: 'naver_marketindex_error',
        error: error?.message ?? String(error),
      },
      500
    );
  }
}
