import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function ageSeconds(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  return Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000);
}

function getLevel(age: number | null, greenSec: number, yellowSec: number) {
  if (age === null) return 'none';
  if (age <= greenSec) return 'green';
  if (age <= yellowSec) return 'yellow';
  return 'red';
}

function getKrxLevel(exchangeData: any) {
  if (!exchangeData) return 'none';
  if (!exchangeData.tradable) return 'closed';
  if (exchangeData.isStale) return 'red';
  return 'green';
}

export async function GET() {
  try {
    const exchangeRes = await axios.get('https://kimpnow.com/api/exchange', {
      params: { t: Date.now() },
      headers: { 'Cache-Control': 'no-cache' },
    });

    const exchangeData = exchangeRes.data;

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
      yellowSec = 300
    ) => {
      const age = ageSeconds(updatedAt);

      return {
        id,
        label,
        age,
        level: getLevel(age, greenSec, yellowSec),
        updatedAt: updatedAt ?? null,
      };
    };

    return NextResponse.json({
      success: true,
      items: [
        {
          id: 'krx_live',
          label: exchangeData?.tradable ? 'KRX LIVE' : 'KRX CLOSED',
          age: ageSeconds(exchangeData?.lastUpdatedAt),
          level: getKrxLevel(exchangeData),
          updatedAt: exchangeData?.lastUpdatedAt ?? null,
          market: exchangeData?.market ?? null,
          source: exchangeData?.source ?? null,
          rate: exchangeData?.rate ?? null,
        },
        make('kimp_save', 'KIMP SAVE', kimp?.created_at, 150, 300),
        make('alert_cron', 'ALERT CRON', hb.get('check_alert')?.updated_at, 150, 300),
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