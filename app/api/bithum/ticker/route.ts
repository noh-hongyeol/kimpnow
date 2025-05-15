import { NextResponse } from 'next/server';

export async function GET() {
  const res = await fetch('https://api.bithumb.com/public/ticker/ALL_KRW', {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });

  const data = await res.json();
  return NextResponse.json(data);
}
