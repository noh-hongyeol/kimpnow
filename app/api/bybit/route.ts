import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  try {
    const res = await axios.get('https://api.bybit.com/v5/market/tickers?category=spot');
    return NextResponse.json(res.data.result.list); // 중요: list 안에 들어 있음
  } catch (error) {
    console.error('❌ Bybit API 실패:', error);
    return NextResponse.json({ error: 'Bybit API 실패' }, { status: 500 });
  }
}
