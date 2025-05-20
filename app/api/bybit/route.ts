export async function GET() {
  try {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=spot', {
      headers: {
        'Accept': 'application/json',
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
