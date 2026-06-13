import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('kimp_prices')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    return NextResponse.json({ success: false, error })
  }

  return NextResponse.json({
    success: true,
    data,
  })
}