import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function GET() {
  try {
    const [upbitRes, exchangeRes] = await Promise.all([
      fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT', {
        cache: 'no-store',
      }),
      fetch('https://finance.naver.com/marketindex/', {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      }),
    ]);

    const upbitData = await upbitRes.json();
    const html = await exchangeRes.text();

    const upbitUsdtPrice = Number(upbitData?.[0]?.trade_price);

    const exchangeMatch = html.match(/<span class="value">([0-9,.]+)<\/span>/);
    const exchangeRate = exchangeMatch
      ? Number(exchangeMatch[1].replace(/,/g, ''))
      : null;

    if (!Number.isFinite(upbitUsdtPrice) || !exchangeRate || !Number.isFinite(exchangeRate)) {
      return NextResponse.json(
        {
          success: false,
          message: '업비트 USDT 가격 또는 원달러 환율을 가져오지 못했습니다.',
          upbitData,
          exchangeRate,
        },
        { status: 500 }
      );
    }

    const kimp = ((upbitUsdtPrice / exchangeRate) - 1) * 100;

    const { data, error } = await supabase
      .from('kimp_history')
      .insert([
        {
          kimp,
          upbit_price: upbitUsdtPrice,
          binance_price: null,
          exchange_rate: exchangeRate,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      calculated: {
        upbit_usdt_price: upbitUsdtPrice,
        exchange_rate: exchangeRate,
        kimp,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}
