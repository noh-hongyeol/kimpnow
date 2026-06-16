import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

type IntervalKey = '1m' | '5m' | '15m' | '1h' | '4h';

const config: Record<IntervalKey, { minutes: number; days: number | null; limit: number }> = {
  '1m': { minutes: 1, days: 7, limit: 10080 },
  '5m': { minutes: 5, days: 30, limit: 8640 },
  '15m': { minutes: 15, days: 180, limit: 17280 },
  '1h': { minutes: 60, days: 1095, limit: 30000 },
  '4h': { minutes: 240, days: null, limit: 50000 },
};

function getFromIso(days: number | null) {
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const interval =
      (req.nextUrl.searchParams.get('interval') as IntervalKey | null) || '1m';

    const selected = config[interval] || config['1m'];

    const { data, error } = await supabase.rpc('get_kimp_history_buckets', {
      p_interval_minutes: selected.minutes,
      p_from: getFromIso(selected.days),
      p_limit: selected.limit,
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        interval,
        count: data?.length ?? 0,
        data: data ?? [],
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
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