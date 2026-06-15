import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getKstParts() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    date: d.getUTCDate(),
    day: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

function getThirdMonday(year: number, month: number) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === 1) {
      count += 1;
      if (count === 3) return d.getUTCDate();
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function makeUsdFuturesCode(year: number, month: number) {
  const y = String(year).slice(-1);
  const mm = String(month).padStart(2, '0');
  return `A75${y}${mm}`;
}

function getMarketStatus() {
  const now = getKstParts();
  const minutes = now.hour * 60 + now.minute;

  if (now.day === 0 || now.day === 6) return { market: 'closed', tradable: false };

  if (minutes >= 8 * 60 + 45 && minutes < 15 * 60 + 30) {
    return { market: 'day', tradable: true };
  }

  if (minutes >= 15 * 60 + 30 && minutes <= 15 * 60 + 45) {
    return { market: 'closing_auction', tradable: false };
  }

  if (minutes >= 18 * 60 || minutes < 5 * 60 + 55) {
    return { market: 'night', tradable: true };
  }

  if (minutes >= 5 * 60 + 55 && minutes < 6 * 60) {
    return { market: 'night_closing', tradable: false };
  }

  return { market: 'closed', tradable: false };
}

function getCandidateCodes() {
  const now = getKstParts();
  const codes: string[] = [];
  let month = now.month;
  const year = now.year;

  for (let i = 0; i < 8; i += 1) {
    const y = year + Math.floor((month - 1) / 12);
    const m = ((month - 1) % 12) + 1;
    const expiryDay = getThirdMonday(y, m);

    if (!(now.year === y && now.month === m && now.date >= expiryDay)) {
      codes.push(makeUsdFuturesCode(y, m));
    }

    month += 1;
  }

  return codes;
}

async function getKisToken(): Promise<string> {
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
    headers: { 'content-type': 'application/json' },
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

  await supabase.from('kis_tokens').upsert({
    id: 'main',
    access_token: tokenJson.access_token,
    expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });

  return tokenJson.access_token as string;
}

function pickVolume(output: any) {
  return Number(
    output?.acml_vol ??
      output?.futs_acml_vol ??
      output?.cntg_vol ??
      output?.tvol ??
      output?.vol ??
      0
  );
}

async function fetchDayFuturesPrice(accessToken: string, code: string) {
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

  return {
    code,
    name: output.hts_kor_isnm,
    price: Number(output.futs_prpr),
    volume: pickVolume(output),
  };
}

async function getLastSavedPrice() {
  const { data } = await supabase
    .from('futures_last_price')
    .select('*')
    .eq('id', 'usd_front')
    .maybeSingle();

  return data;
}

async function saveLastPrice(row: {
  rate: number;
  code: string;
  name: string;
  market: string;
  tradable: boolean;
}) {
  await supabase.from('futures_last_price').upsert({
    id: 'usd_front',
    rate: row.rate,
    code: row.code,
    name: row.name,
    market: row.market,
    tradable: row.tradable,
    is_stale: false,
    updated_at: new Date().toISOString(),
  });
}

function isFresh(updatedAt: string | null | undefined, maxAgeSec: number) {
  if (!updatedAt) return false;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs >= 0 && ageMs <= maxAgeSec * 1000;
}

function noStoreJson(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    },
  });
}

export async function GET() {
  try {
    const status = getMarketStatus();

    if (status.market === 'night') {
      const last = await getLastSavedPrice();
      const fresh = last?.market === 'night' && isFresh(last?.updated_at, 90);

      return noStoreJson({
        rate: last ? Number(last.rate) : null,
        code: last?.code ?? null,
        name: last?.name ?? null,
        market: 'night',
        tradable: fresh,
        isStale: !fresh,
        source: fresh ? 'night_websocket_supabase' : 'night_waiting_websocket',
        reason: fresh ? 'night_live' : 'night_price_not_fresh',
        lastUpdatedAt: last?.updated_at ?? null,
      });
    }

    if (!status.tradable) {
      const last = await getLastSavedPrice();

      return noStoreJson({
        rate: last ? Number(last.rate) : null,
        code: last?.code ?? null,
        name: last?.name ?? null,
        market: status.market,
        tradable: false,
        isStale: true,
        source: 'last_saved_not_tradable',
        lastUpdatedAt: last?.updated_at ?? null,
      });
    }

    const accessToken = await getKisToken();
    const candidates = getCandidateCodes();
    const checked: any[] = [];

    for (const code of candidates) {
      const result = await fetchDayFuturesPrice(accessToken, code);

      checked.push({
        code: result.code,
        name: result.name,
        price: result.price,
        volume: result.volume,
      });

      if (
        Number.isFinite(result.price) &&
        result.price > 0 &&
        Number.isFinite(result.volume) &&
        result.volume > 0
      ) {
        await saveLastPrice({
          rate: result.price,
          code: result.code,
          name: result.name,
          market: 'day',
          tradable: true,
        });

        return noStoreJson({
          rate: result.price,
          code: result.code,
          name: result.name,
          market: 'day',
          tradable: true,
          isStale: false,
          source: 'day_rest_kis',
          volume: result.volume,
          candidates,
          checked,
        });
      }
    }

    const last = await getLastSavedPrice();

    return noStoreJson({
      rate: last ? Number(last.rate) : null,
      code: last?.code ?? null,
      name: last?.name ?? null,
      market: 'day',
      tradable: false,
      isStale: true,
      source: 'last_saved_day_no_active_contract',
      reason: 'No active contract with volume',
      candidates,
      checked,
      lastUpdatedAt: last?.updated_at ?? null,
    });
  } catch (error: any) {
    const last = await getLastSavedPrice();

    return noStoreJson(
      {
        rate: last ? Number(last.rate) : null,
        code: last?.code ?? null,
        name: last?.name ?? null,
        tradable: false,
        isStale: true,
        source: 'error_last_saved',
        error: error?.message ?? String(error),
        lastUpdatedAt: last?.updated_at ?? null,
      },
      500
    );
  }
}
