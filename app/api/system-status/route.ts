import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function ageSeconds(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  const diff = Date.now() - new Date(dateValue).getTime();
  return Math.floor(diff / 1000);
}

function getLevel(age: number | null, greenSec: number, yellowSec: number) {
  if (age === null) return 'none';
  if (age <= greenSec) return 'green';
  if (age <= yellowSec) return 'yellow';
  return 'red';
}

export async function GET() {
  try {
    const { data: futures } = await supabase
      .from('futures_last_price')
      .select('updated_at, market, rate, code')
      .eq('id', 'usd_front')
      .maybeSingle();

    const { data: kimp } = await supabase
      .from('kimp_history')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: heartbeats } = await supabase
      .from('system_heartbeats')
      .select('*');

    const hb = new Map((heartbeats ?? []).map((x) => [x.id, x]));

    const make = (
      id: string,
      label: string,
      updatedAt: string | null | undefined,
      greenSec = 120,
      yellowSec = 300,
      extra: any = {}
    ) => {
      const age = ageSeconds(updatedAt);
      return {
        id,
        label,
        age,
        level: getLevel(age, greenSec, yellowSec),
        updatedAt: updatedAt ?? null,
        ...extra,
      };
    };

    return NextResponse.json({
      success: true,
      items: [
        make('krx_live', 'KRX LIVE', futures?.updated_at, 90, 300, {
          market: futures?.market ?? null,
          rate: futures?.rate ?? null,
          code: futures?.code ?? null,
        }),
        make('kimp_save', 'KIMP SAVE', kimp?.created_at, 150, 300),
        make('alert_cron', 'ALERT CRON', hb.get('check_alert')?.updated_at, 150, 300),
        make('kis_ws', 'KIS WS', hb.get('kis_ws')?.updated_at, 90, 300),
        make('binance_liq', 'Binance Liq', hb.get('binance_liq')?.updated_at, 120, 300),
        make('spreadsheet', 'Spreadsheet', hb.get('spreadsheet')?.updated_at, 120, 300),
      ],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}