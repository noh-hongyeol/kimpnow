import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    const { data, error } = await supabase
      .from('alert_settings')
      .select('admin_password')
      .eq('id', 1)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false });
    }

    return NextResponse.json({
      success: password === data.admin_password,
    });
  } catch {
    return NextResponse.json({ success: false });
  }
}