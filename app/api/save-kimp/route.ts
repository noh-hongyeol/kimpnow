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
      fetch('https://kimpnow.com/api/exchange', {
        cache: 'no-store',
      }),
    ]);

    const upbitData = await upbitRes.json();
    const exchangeData = await exchangeRes.json();

    const upbitUsdtPrice = Number(upbitData?.[0]?.trade_price);
    const usdFuturesPrice = Number(exchangeData?.rate);

    if (
      !Number.isFinite(upbitUsdtPrice) ||
      !Number.isFinite(usdFuturesPrice) ||
      usdFuturesPrice <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: '업비트 USDT 가격 또는 KRX 원달러선물 가격을 가져오지 못했습니다.',
          upbitData,
          exchangeData,
        },
        { status: 500 }
      );
    }

    const kimp = ((upbitUsdtPrice / usdFuturesPrice) - 1) * 100;

    const { data, error } = await supabase
      .from('kimp_history')
      .insert([
        {
          kimp,
          upbit_price: upbitUsdtPrice,
          binance_price: null,
          exchange_rate: usdFuturesPrice,
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
        usd_futures_price: usdFuturesPrice,
        kimp,
        exchangeData,
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