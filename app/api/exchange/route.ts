import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getKstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function getThirdMonday(year: number, month: number) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;

  while (true) {
    if (d.getUTCDay() === 1) {
      count += 1;
      if (count === 3) return d;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function isExpired(year: number, month: number, nowKst: Date) {
  const expiry = getThirdMonday(year, month);

  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth() + 1;
  const d = nowKst.getUTCDate();
  const h = nowKst.getUTCHours();
  const min = nowKst.getUTCMinutes();

  const ey = expiry.getUTCFullYear();
  const em = expiry.getUTCMonth() + 1;
  const ed = expiry.getUTCDate();

  if (y > ey) return true;
  if (y === ey && m > em) return true;
  if (y === ey && m === em && d > ed) return true;

  if (y === ey && m === em && d === ed) {
    if (h > 11) return true;
    if (h === 11 && min >= 30) return true;
  }

  return false;
}

function makeUsdFuturesCode(year: number, month: number) {
  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');
  return `A75${yy}${mm}`;
}

function getCandidateCodes() {
  const nowKst = getKstNow();
  const codes: string[] = [];

  let year = nowKst.getUTCFullYear();
  let month = nowKst.getUTCMonth() + 1;

  for (let i = 0; i < 6; i++) {
    const y = year + Math.floor((month - 1) / 12);
    const m = ((month - 1) % 12) + 1;

    if (!isExpired(y, m, nowKst)) {
      codes.push(makeUsdFuturesCode(y, m));
    }

    month += 1;
  }

  return codes;
}

async function getKisToken(): Promise<string> {
  const now = new Date();
  const safeExpire = new Date(Date.now() + 10 * 60 * 1000);

  const { data: saved } = await supabase
    .from('kis_tokens')
    .select('access_token, expires_at')
    .eq('id', 'main')
    .maybeSingle();

  if (saved?.access_token && new Date(saved.expires_at) > safeExpire) {
    return saved.access_token;
  }

  const tokenRes = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
  });

  const tokenJson = await tokenRes.json();

  if (!tokenJson.access_token) {
    throw new Error(tokenJson.error_description || JSON.stringify(tokenJson));
  }

  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();

  await supabase.from('kis_tokens').upsert({
    id: 'main',
    access_token: tokenJson.access_token,
    expires_at: expiresAt,
    updated_at: now.toISOString(),
  });

  return tokenJson.access_token;
}

async function fetchFuturesPrice(accessToken: string, code: string) {
  const res = await fetch(
    `${KIS_BASE_URL}/uapi/domestic-futureoption/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=CF&FID_INPUT_ISCD=${code}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
        appkey: process.env.KIS_APP_KEY!,
        appsecret: process.env.KIS_APP_SECRET!,
        tr_id: 'FHMIF10000000',
        custtype: 'P',
      },
      cache: 'no-store',
    }
  );

  const json = await res.json();
  const output = json.output1 || {};
  const price = Number(output.futs_prpr);

  return {
    price,
    name: output.hts_kor_isnm,
    raw: json,
  };
}

export async function GET() {
  try {
    const accessToken = await getKisToken();
    const codes = getCandidateCodes();

    for (const code of codes) {
      const result = await fetchFuturesPrice(accessToken, code);

      if (Number.isFinite(result.price) && result.price > 0) {
        return NextResponse.json({
          rate: result.price,
          code,
          name: result.name,
          candidates: codes,
        });
      }
    }

    return NextResponse.json(
      {
        rate: null,
        error: '선물 가격 조회 실패',
        candidates: codes,
      },
      { status: 500 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        rate: null,
        error: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}