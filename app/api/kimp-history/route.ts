import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getFromDate(range: string) {
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "1m";
    const fromTime = getFromDate(range);

    // 1분봉은 원본 데이터 그대로 가져옴
    if (range === "1m") {
      const { data, error } = await supabase
        .from("kimp_history")
        .select("created_at, kimp")
        .gte("created_at", fromTime)
        .order("created_at", { ascending: true })
        .limit(20000);

      if (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(
        (data || []).map((row) => ({
          time: row.created_at,
          kimp: row.kimp,
        }))
      );
    }

    // 5분봉 이상은 bucket 함수 사용
    const bucketMinutes = getBucketMinutes(range);

    const { data, error } = await supabase.rpc("get_kimp_history_buckets", {
      bucket_minutes: bucketMinutes,
      from_time: fromTime,
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      (data || []).map((row) => ({
        time: row.bucket_time,
        kimp: row.avg_kimp,
      }))
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}