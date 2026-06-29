import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type EntryBox = {
  usd: string;
  contracts: string;
  usdt: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase env vars');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function GET() {
  const { data, error } = await supabase
    .from('position_settings')
    .select('entries, updated_at')
    .eq('id', 1)
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    entries: data?.entries ?? [],
    updated_at: data?.updated_at ?? null,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const entries = body.entries as EntryBox[];

  if (!Array.isArray(entries)) {
    return NextResponse.json(
      { success: false, error: 'entries must be an array' },
      { status: 400 }
    );
  }

  const cleanedEntries = entries.slice(0, 3).map((entry) => ({
    usd: String(entry?.usd ?? ''),
    contracts: String(entry?.contracts ?? ''),
    usdt: String(entry?.usdt ?? ''),
  }));

  while (cleanedEntries.length < 3) {
    cleanedEntries.push({ usd: '', contracts: '', usdt: '' });
  }

  const { error } = await supabase
    .from('position_settings')
    .upsert(
      {
        id: 1,
        entries: cleanedEntries,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    entries: cleanedEntries,
  });
}
