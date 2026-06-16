import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getFromDate(range: string) {
  const now = new Date();

  switch (range) {
    case "1m":
      now.setDate(now.getDate() - 7);
      return now.toISOString();

    case "5m":
      now.setDate(now.getDate() - 30);
      return now.toISOString();

    case "15m":
      now.setDate(now.getDate() - 180);
      return now.toISOString();

    case "1h":
      now.setFullYear(now.getFullYear() - 3);
      return now.toISOString();

    case "4h":
      return "1970-01-01T00:00:00.000Z";

    default:
      now.setDate(now.getDate() - 7);
      return now.toISOString();
  }
}

function getBucketMinutes(range: string) {
  switch (range) {
    case "5m":
      return 5;

    case "15m":
      return 15;

    case "1h":
      return 60;

    case "4h":
      return 240;

    default:
      return 1;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const range = searchParams.get("range") || "1m";

    const fromTime = getFromDate(range);

    // ===== 1분봉 =====
    if (range === "1m") {
      const { data, error } = await supabase
        .from("kimp_history")
        .select("created_at,kimp")
        .gte("created_at", fromTime)
        .order("created_at", { ascending: true })
        .limit(20000);

      if (error) {
        console.error(error);

        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        (data || []).map(
          (row: { created_at: string; kimp: number }) => ({
            time: row.created_at,
            kimp: row.kimp,
          })
        )
      );
    }

    // ===== 5분봉 이상 =====

    const bucketMinutes = getBucketMinutes(range);

    const { data, error } = await supabase.rpc(
      "get_kimp_history_buckets",
      {
        bucket_minutes: bucketMinutes,
        from_time: fromTime,
      }
    );

    if (error) {
      console.error(error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      (data || []).map(
        (row: {
          bucket_time: string;
          avg_kimp: number;
        }) => ({
          time: row.bucket_time,
          kimp: row.avg_kimp,
        })
      )
    );
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}