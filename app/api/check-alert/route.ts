import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  return res.json();
}

export async function GET() {
  try {
    const { data: settings, error: settingsError } = await supabase
      .from('alert_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (settingsError || !settings) {
      return NextResponse.json({
        success: false,
        error: settingsError?.message || 'No settings',
      });
    }

    const exchangeRes = await axios.get(
  'https://kimpnow.com/api/exchange'
);
    const upbitRes = await axios.get('https://api.upbit.com/v1/ticker?markets=KRW-USDT');

    const exchangeRate = Number(exchangeRes.data.rate);
    const upbitUsdtPrice = Number(upbitRes.data[0].trade_price);

    const usdtKimp = ((upbitUsdtPrice / exchangeRate) - 1) * 100;

    let direction: 'upper' | 'lower' | null = null;

    if (usdtKimp >= Number(settings.upper_kimp)) {
      direction = 'upper';
    }

    if (usdtKimp <= Number(settings.lower_kimp)) {
      direction = 'lower';
    }

    if (!direction) {
      return NextResponse.json({
        success: true,
        alerted: false,
        reason: 'No condition matched',
        usdtKimp,
        upper_kimp: settings.upper_kimp,
        lower_kimp: settings.lower_kimp,
      });
    }

    const cooldownMinutes = Number(settings.cooldown_minutes ?? 60);

    const since = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

    const { data: recentLogs, error: logError } = await supabase
      .from('alert_logs')
      .select('*')
      .eq('direction', direction)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (logError) {
      return NextResponse.json({
        success: false,
        error: logError.message,
      });
    }

    if (recentLogs && recentLogs.length >= Number(settings.max_alert_count)) {
      return NextResponse.json({
        success: true,
        alerted: false,
        reason: 'Max alert count reached during cooldown',
        usdtKimp,
        direction,
        recent_count: recentLogs.length,
      });
    }

    const message =
      direction === 'upper'
        ? `🚨 USDT 김프 상단 알림\n김프: ${usdtKimp.toFixed(3)}%\n기준: ${Number(settings.upper_kimp).toFixed(3)}% 이상\n업비트 USDT: ₩${upbitUsdtPrice.toLocaleString()}\n환율: ₩${exchangeRate.toLocaleString()}`
        : `🔵 USDT 김프 하단 알림\n김프: ${usdtKimp.toFixed(3)}%\n기준: ${Number(settings.lower_kimp).toFixed(3)}% 이하\n업비트 USDT: ₩${upbitUsdtPrice.toLocaleString()}\n환율: ₩${exchangeRate.toLocaleString()}`;

    const telegram = await sendTelegram(message);

    const { error: insertError } = await supabase.from('alert_logs').insert({
      direction,
      kimp: Number(usdtKimp.toFixed(6)),
      message,
    });

    if (insertError) {
      return NextResponse.json({
        success: false,
        error: insertError.message,
        telegram,
      });
    }

    return NextResponse.json({
      success: true,
      alerted: true,
      direction,
      usdtKimp,
      telegram,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message ?? String(error),
    });
  }
}