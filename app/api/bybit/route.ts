// 예시: app/api/bybit/route.ts
import axios from 'axios';

export async function GET() {
  try {
    const response = await axios.get('https://api.bybit.com/v5/market/tickers', {
      params: { category: 'linear' }
    });

    return new Response(JSON.stringify(response.data), {
      status: 200,
    });
  } catch (error) {
    console.error('Bybit API Error:', error);  // 콘솔에 정확한 원인 출력
    return new Response(JSON.stringify({ error: 'Failed to fetch from Bybit' }), {
      status: 500,
    });
  }
}
