import { NextResponse } from 'next/server';

export async function GET() {
  const res = await fetch('https://api.upbit.com/v1/market/all', {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });

  const data = await res.json();
  return NextResponse.json(data);
}
