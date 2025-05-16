import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const markets = searchParams.get('markets');

  if (!markets) {
    return NextResponse.json({ error: 'Missing markets parameter' }, { status: 400 });
  }

  try {
    const res = await axios.get('https://api.upbit.com/v1/ticker', {
      params: { markets },
    });
    return NextResponse.json(res.data);
  } catch (error) {
    console.error('업비트 API 실패:', error);
    return NextResponse.json({ error: 'Failed to fetch from Upbit' }, { status: 500 });
  }
}
