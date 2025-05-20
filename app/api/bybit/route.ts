// app/api/bybit/route.ts
export async function GET() {
  try {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
      headers: {
        'User-Agent': 'Mozilla/5.0',            // 일부 봇 차단 우회용
        'Accept': 'application/json',
      },
      cache: 'no-store',                         // Next.js 캐시 방지
    });

    if (!res.ok) {
      console.error(`Bybit API 응답 오류: ${res.status}`);
      throw new Error(`Bybit fetch failed: ${res.status}`);
    }

    const data = await res.json();
    console.log('Bybit 응답 데이터:', data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('Bybit fetch error:', error.message);
    return new Response(JSON.stringify({
      error: 'Failed to fetch from Bybit',
      detail: error.message,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
