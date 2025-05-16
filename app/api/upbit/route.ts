import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const markets = searchParams.get('markets');
  if (!markets) return NextResponse.json({ error: 'Missing markets param' }, { status: 400 });

  try {
    const response = await axios.get('https://api.upbit.com/v1/ticker', {
      params: { markets },
    });
    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('Upbit API Error:', error.message);
    return NextResponse.json({ error: 'Upbit Internal Server Error' }, { status: 500 });
  }
}