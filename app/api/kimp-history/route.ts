import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
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