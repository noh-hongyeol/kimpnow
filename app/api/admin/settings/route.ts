import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from('alert_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: error.message });
  }

  return NextResponse.json({
    success: true,
    settings: data,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { error } = await supabase
      .from('alert_settings')
      .update({
        cooldown_minutes: body.cooldown_minutes,
        upper_kimp: body.upper_kimp,
        lower_kimp: body.lower_kimp,
        max_alert_count: body.max_alert_count,
        alert_interval_sec: body.alert_interval_sec,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false });
  }
}