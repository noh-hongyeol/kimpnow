import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type BucketRow = {
  bucket_time: string;
  avg_kimp: number | string | null;
};

function getConfig(range: string) {
  const now = new Date();

  switch (range) {
    case "1m":
      now.setDate(now.getDate() - 7);

      return {
        bucket: 1,
        from: now.toISOString(),
      };

    case "5m":
      now.setDate(now.getDate() - 30);

      return {
        bucket: 5,
        from: now.toISOString(),
      };

    case "15m":
      now.setDate(now.getDate() - 180);

      return {
        bucket: 15,
        from: now.toISOString(),
      };

    case "1h":
      now.setFullYear(now.getFullYear() - 3);

      return {
        bucket: 60,
        from: now.toISOString(),
      };

    case "4h":
      return {
        bucket: 240,
        from: "1970-01-01T00:00:00.000Z",
      };

    default:
      now.setDate(now.getDate() - 7);

      return {
        bucket: 1,
        from: now.toISOString(),
      };
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const range = searchParams.get("range") || "1m";

    const config = getConfig(range);

    let allRows: BucketRow[] = [];

    let from = 0;

    const pageSize = 1000;

    while (true) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .rpc("get_kimp_history_buckets", {
          bucket_minutes: config.bucket,
          from_time: config.from,
        })
        .range(from, to);

      if (error) {
        throw error;
      }

      const rows = (data || []) as BucketRow[];

      allRows = allRows.concat(rows);

      if (rows.length < pageSize) {
        break;
      }

      from += pageSize;

      if (from > 100000) {
        break;
      }
    }

    return NextResponse.json(
      allRows
        .filter(
          (row) =>
            row.bucket_time &&
            row.avg_kimp !== null
        )
        .map((row) => ({
          time: row.bucket_time,
          kimp: Number(row.avg_kimp),
        }))
    );
  } catch (err: any) {
    console.error(err);

    return NextResponse.json(
      {
        error: err?.message || "history api error",
      },
      {
        status: 500,
      }
    );
  }
}