// /app/api/bybit/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  try {
    const res = await axios.get('https://api.bybit.com/v5/market/tickers?category=linear');
    const tickers = res.data.result.list.map((item: any) => ({
      symbol: item.symbol,
      price: item.lastPrice,
    }));
    return NextResponse.json(tickers);
  } catch (error) {
    console.error('❌ Bybit API 실패:', error);
    return NextResponse.json({ error: 'Bybit API 실패' }, { status: 500 });
  }
}
