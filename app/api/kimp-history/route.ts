import { NextResponse } from 'next/server';
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

const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

export async function GET() {
  try {
    let allRows: any[] = [];
    let from = 0;

    while (allRows.length < MAX_ROWS) {
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('kimp_history')
        .select('id, created_at, kimp, upbit_price, binance_price, exchange_rate')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) break;

      allRows = allRows.concat(data);

      if (data.length < PAGE_SIZE) break;

      from += PAGE_SIZE;
    }

    const sorted = allRows.sort(
      (a, b) =>
        new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime()
    );

    return NextResponse.json(
      {
        success: true,
        data: sorted,
        count: sorted.length,
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