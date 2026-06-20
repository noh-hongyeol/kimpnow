import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
async function writeHeartbeat(status: string, message: string) {
  const { error } = await supabase.from('system_heartbeats').upsert({
    id: 'check_alert',
    status,
    message,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('heartbeat error:', error.message);
  }
}
export async function GET() {
  try {
    await writeHeartbeat('running', 'check-alert executed');
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

    const exchangeRes = await axios.get('https://kimpnow.com/api/exchange', {
      params: { t: Date.now() },
      headers: { 'Cache-Control': 'no-cache' },
    });

    const exchangeData = exchangeRes.data;

    if (
      !exchangeData ||
      !exchangeData.rate ||
      !exchangeData.tradable ||
      exchangeData.isStale
    ) {
      return NextResponse.json({
        success: true,
        alerted: false,
        reason: 'USD futures not live',
        market: exchangeData?.market ?? null,
        tradable: exchangeData?.tradable ?? false,
        isStale: exchangeData?.isStale ?? true,
        source: exchangeData?.source ?? null,
        lastUpdatedAt: exchangeData?.lastUpdatedAt ?? null,
      });
    }

    const exchangeRate = Number(exchangeData.rate);

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return NextResponse.json({
        success: true,
        alerted: false,
        reason: 'Invalid USD futures rate',
        exchangeRate,
      });
    }

    const upbitRes = await axios.get(
      'https://api.upbit.com/v1/ticker?markets=KRW-USDT',
      {
        headers: { 'Cache-Control': 'no-cache' },
      }
    );

    const upbitUsdtPrice = Number(upbitRes.data?.[0]?.trade_price);

    if (!Number.isFinite(upbitUsdtPrice) || upbitUsdtPrice <= 0) {
      return NextResponse.json({
        success: false,
        alerted: false,
        reason: 'Invalid Upbit USDT price',
        upbitUsdtPrice,
      });
    }

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
        market: exchangeData.market,
        source: exchangeData.source,
      });
    }

    const cooldownMinutes = Number(
      settings.cooldown_minutes ??
      settings.rearm_wait_min ??
      60
    );

    const maxAlertCount = Number(settings.max_alert_count ?? 5);
    const now = Date.now();

    const { data: logs, error: logError } = await supabase
      .from('alert_logs')
      .select('*')
      .eq('direction', direction)
      .order('created_at', { ascending: false })
      .limit(100);

    if (logError) {
      return NextResponse.json({
        success: false,
        error: logError.message,
      });
    }

    const allLogs = logs ?? [];

    const isMaxAlertLog = (message: string | null | undefined) => {
      const text = String(message ?? '');
      return (
        text.includes(`[${maxAlertCount}/${maxAlertCount}]`) ||
        text.includes('최대 알림 횟수 도달')
      );
    };

    const latestMaxLog = allLogs.find((log) => isMaxAlertLog(log.message));

    let cycleStartTime = 0;

    if (latestMaxLog?.created_at) {
      const latestMaxTime = new Date(latestMaxLog.created_at).getTime();
      const cooldownUntil = latestMaxTime + cooldownMinutes * 60 * 1000;

      if (now < cooldownUntil) {
        return NextResponse.json({
          success: true,
          alerted: false,
          reason: 'Cooldown after max alert',
          usdtKimp,
          direction,
          cooldown_until: new Date(cooldownUntil).toISOString(),
          market: exchangeData.market,
          source: exchangeData.source,
        });
      }

      cycleStartTime = cooldownUntil;
    }

    const currentCycleLogs = allLogs.filter((log) => {
      const logTime = new Date(log.created_at).getTime();
      return logTime > cycleStartTime;
    });

    const recentCount = currentCycleLogs.length;

    if (recentCount >= maxAlertCount) {
      return NextResponse.json({
        success: true,
        alerted: false,
        reason: 'Max alert count reached',
        usdtKimp,
        direction,
        recent_count: recentCount,
        max_alert_count: maxAlertCount,
        cooldown_minutes: cooldownMinutes,
        market: exchangeData.market,
        source: exchangeData.source,
      });
    }

    const alertNumber = recentCount + 1;
    const isLastAlert = alertNumber >= maxAlertCount;

    const marketLabel =
      exchangeData.market === 'day'
        ? '주간장'
        : exchangeData.market === 'night'
          ? '야간장'
          : String(exchangeData.market ?? 'unknown');

    const message =
      direction === 'upper'
        ? `🚨 [${alertNumber}/${maxAlertCount}] USDT 김프 상단 알림\n김프: ${usdtKimp.toFixed(3)}%\n기준: ${Number(settings.upper_kimp).toFixed(3)}% 이상\n업비트 USDT: ₩${upbitUsdtPrice.toLocaleString()}\nKRX USD Futures: ₩${exchangeRate.toLocaleString()}\n장 상태: ${marketLabel}\n재발송 대기: ${cooldownMinutes}분${isLastAlert ? `\n⛔ 최대 알림 횟수 도달\n${cooldownMinutes}분 후 다시 알림 가능` : ''}`
        : `🔵 [${alertNumber}/${maxAlertCount}] USDT 김프 하단 알림\n김프: ${usdtKimp.toFixed(3)}%\n기준: ${Number(settings.lower_kimp).toFixed(3)}% 이하\n업비트 USDT: ₩${upbitUsdtPrice.toLocaleString()}\nKRX USD Futures: ₩${exchangeRate.toLocaleString()}\n장 상태: ${marketLabel}\n재발송 대기: ${cooldownMinutes}분${isLastAlert ? `\n⛔ 최대 알림 횟수 도달\n${cooldownMinutes}분 후 다시 알림 가능` : ''}`;

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
      alert_number: alertNumber,
      max_alert_count: maxAlertCount,
      cooldown_minutes: cooldownMinutes,
      market: exchangeData.market,
      source: exchangeData.source,
      telegram,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message ?? String(error),
    });
  }
}