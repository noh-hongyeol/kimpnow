export async function GET() {
  try {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://kimpnow.com/',
        'Origin': 'https://kimpnow.com',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Bybit fetch failed: ${res.status}`);
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Bybit fetch error:', error.message);
    return new Response(JSON.stringify({
      error: 'Failed to fetch from Bybit',
      detail: error.message,
    }), {
      status: 500,
    });
  }
}
