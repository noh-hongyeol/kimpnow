import { NextResponse } from 'next/server';

let cachedToken: string | null = null;
let tokenExpireAt = 0;
let tokenRetryAfter = 0;

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

function getKoreaNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function getThirdMonday(year: number, month: number) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let mondayCount = 0;

  while (true) {
    if (d.getUTCDay() === 1) {
      mondayCount += 1;
      if (mondayCount === 3) return d;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function isExpiredContract(year: number, month: number, nowKst: Date) {
  const expiry = getThirdMonday(year, month);

  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth() + 1;
  const day = nowKst.getUTCDate();
  const hour = nowKst.getUTCHours();
  const minute = nowKst.getUTCMinutes();

  const expiryY = expiry.getUTCFullYear();
  const expiryM = expiry.getUTCMonth() + 1;
  const expiryDay = expiry.getUTCDate();

  if (y > expiryY) return true;
  if (y === expiryY && m > expiryM) return true;
  if (y === expiryY && m === expiryM && day > expiryDay) return true;

  // 최종거래일은 11:30 이후 해당 월물 제외
  if (y === expiryY && m === expiryM && day === expiryDay) {
    if (hour > 11) return true;
    if (hour === 11 && minute >= 30) return true;
  }

  return false;
}

function makeUsdFuturesCode(year: number, month: number) {
  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');
  return `A75${yy}${mm}`;
}

function getCandidateCodes() {
  const nowKst = getKoreaNow();

  const candidates: string[] = [];
  let y = nowKst.getUTCFullYear();
  let m = nowKst.getUTCMonth() + 1;

  for (let i = 0; i < 6; i += 1) {
    const yy = y + Math.floor((m - 1) / 12);
    const mm = ((m - 1) % 12) + 1;

    if (!isExpiredContract(yy, mm, nowKst)) {
      candidates.push(makeUsdFuturesCode(yy, mm));
    }

    m += 1;
  }

  return candidates;
}

function getMarketSession() {
  const nowKst = getKoreaNow();
  const hour = nowKst.getUTCHours();
  const minute = nowKst.getUTCMinutes();
  const total = hour * 60 + minute;

  if (total >= 18 * 60 || total < 6 * 60) return 'night';
  return 'day';
}

async function getKisToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpireAt) return cachedToken;

  if (now < tokenRetryAfter) {
    throw new Error('KIS_TOKEN_COOLDOWN');
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
    tokenRetryAfter = now + 70 * 1000;
    throw new Error(JSON.stringify(tokenJson));
  }

  cachedToken = tokenJson.access_token;
  tokenExpireAt = now + 23 * 60 * 60 * 1000;

  return cachedToken;
}

async function fetchPrice(accessToken: string, code: string, session: 'day' | 'night') {
  // 일단 같은 REST 현재가 API로 조회.
  // 한국투자 문서상 야간은 별도 KRX야간 실시간 API가 있지만,
  // 홈페이지 5초 polling 구조에서는 현재 REST 조회값이 나오면 그대로 사용.
  const url =
    `${KIS_BASE_URL}/uapi/domestic-futureoption/v1/quotations/inquire-price` +
    `?FID_COND_MRKT_DIV_CODE=CF&FID_INPUT_ISCD=${code}`;

  const res = await fetch(url, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${accessToken}`,
      appkey: process.env.KIS_APP_KEY!,
      appsecret: process.env.KIS_APP_SECRET!,
      tr_id: 'FHMIF10000000',
      custtype: 'P',
    },
    cache: 'no-store',
  });

  const json = await res.json();
  const output = json.output1 || {};

  const price =
    Number(output.futs_prpr) ||
    Number(output.stck_prpr) ||
    Number(output.prpr) ||
    Number(output.last) ||
    0;

  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, price: null, json };
  }

  return {
    ok: true,
    price,
    json,
    name: output.hts_kor_isnm ?? null,
    session,
  };
}

export async function GET() {
  try {
    const accessToken = await getKisToken();
    const session = getMarketSession();
    const codes = getCandidateCodes();

    for (const code of codes) {
      const result = await fetchPrice(accessToken, code, session);

      if (result.ok) {
        return NextResponse.json({
          rate: result.price,
          code,
          name: result.name,
          session,
          candidates: codes,
        });
      }
    }

    return NextResponse.json(
      {
        rate: null,
        error: '선물 가격 조회 실패',
        session,
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