import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type RawRow = {
  created_at: string;
  kimp: number | string | null;
};

type BucketRow = {
  bucket_time: string;
  avg_kimp: number | string | null;
};

function getFromTime(range: string) {
  const now = new Date();

  if (range === "1m") {
    now.setDate(now.getDate() - 7);
    return now.toISOString();
  }

  if (range === "5m") {
    now.setDate(now.getDate() - 30);
    return now.toISOString();
  }

  if (range === "15m") {
    now.setDate(now.getDate() - 180);
    return now.toISOString();
  }

  if (range === "1h") {
    now.setFullYear(now.getFullYear() - 3);
    return now.toISOString();
  }

  return "1970-01-01T00:00:00.000Z";
}

function getBucketMinutes(range: string) {
  if (range === "5m") return 5;
  if (range === "15m") return 15;
  if (range === "1h") return 60;
  if (range === "4h") return 240;
  return 1;
}

async function fetchRawHistory(fromTime: string) {
  const pageSize = 1000;
  let from = 0;
  let allRows: RawRow[] = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("kimp_history")
      .select("created_at,kimp")
      .gte("created_at", fromTime)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw error;

    const rows = (data || []) as RawRow[];
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) break;

    from += pageSize;

    if (from > 30000) break;
  }

  return allRows;
}

async function fetchBucketHistory(bucketMinutes: number, fromTime: string) {
  const pageSize = 1000;
  let from = 0;
  let allRows: BucketRow[] = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .rpc("get_kimp_history_buckets", {
        bucket_minutes: bucketMinutes,
        from_time: fromTime,
      })
      .range(from, to);

    if (error) throw error;

    const rows = (data || []) as BucketRow[];
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) break;

    from += pageSize;

    if (from > 50000) break;
  }

  return allRows;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "1m";
    const fromTime = getFromTime(range);

    if (range === "1m") {
      const rows = await fetchRawHistory(fromTime);

      return NextResponse.json(
        rows
          .filter((row) => row.created_at && row.kimp !== null)
          .map((row) => ({
            time: row.created_at,
            kimp: Number(row.kimp),
          }))
      );
    }

    const bucketMinutes = getBucketMinutes(range);
    const rows = await fetchBucketHistory(bucketMinutes, fromTime);

    return NextResponse.json(
      rows
        .filter((row) => row.bucket_time && row.avg_kimp !== null)
        .map((row) => ({
          time: row.bucket_time,
          kimp: Number(row.avg_kimp),
        }))
    );
  } catch (err: any) {
    console.error("kimp-history api error:", err);

    return NextResponse.json(
      {
        error: err?.message || "kimp-history api error",
      },
      { status: 500 }
    );
  }
}