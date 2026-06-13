import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3001'

    const [upbitRes, exchangeRes] = await Promise.all([
      fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT', {
        cache: 'no-store',
      }),
      fetch(`${baseUrl}/api/exchange`, {
        cache: 'no-store',
      }),
    ])

    const upbitData = await upbitRes.json()
    const exchangeData = await exchangeRes.json()

    const upbitUsdtPrice = upbitData?.[0]?.trade_price
    const exchangeRate =
      exchangeData?.rate ??
      exchangeData?.exchangeRate ??
      exchangeData?.price

    if (!upbitUsdtPrice || !exchangeRate) {
      return NextResponse.json({
        success: false,
        message: '가격 또는 환율을 가져오지 못했습니다.',
        upbitData,
        exchangeData,
      })
    }

    const kimp = ((upbitUsdtPrice / exchangeRate) - 1) * 100
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('kimp_prices')
      .insert([
        {
          kimp,
          upbit_price: upbitUsdtPrice,
          exchange_rate: exchangeRate,
          binance_price: null,
        },
      ])
      .select()

    if (error) {
      return NextResponse.json({ success: false, error })
    }

    return NextResponse.json({
      success: true,
      data,
      calculated: {
        upbit_usdt_price: upbitUsdtPrice,
        exchange_rate: exchangeRate,
        kimp,
      },
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      message: err?.message ?? String(err),
    })
  }
}