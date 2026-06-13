import { getSupabase } from './supabase'

export async function getLatestKimpData() {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('kimp_prices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Supabase error:', error)
    return null
  }

  return data?.[0] ?? null
}