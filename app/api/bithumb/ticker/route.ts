// app/api/bithumb/ticker/route.ts
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  try {
    const res = await axios.get('https://api.bithumb.com/public/ticker/ALL_KRW');
    return NextResponse.json(res.data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch from Bithumb' }, { status: 500 });
  }
}
