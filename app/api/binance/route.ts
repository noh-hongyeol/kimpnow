import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/price');
    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Binance API error:', error);
    return NextResponse.json({ error: 'Failed to fetch Binance data' }, { status: 500 });
  }
}
