import { NextResponse } from 'next/server';

let cachedToken: string | null = null;
let tokenExpireAt = 0;

async function getKisToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpireAt) {
    return cachedToken;
  }

  const tokenRes = await fetch('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
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
    throw new Error(JSON.stringify(tokenJson));
  }

  cachedToken = tokenJson.access_token;
  tokenExpireAt = now + 23 * 60 * 60 * 1000;

  return cachedToken;
}

export async function GET() {
  try {
    const accessToken = await getKisToken();
    const code = process.env.KIS_USD_FUTURES_CODE || '21A75606';

    const priceRes = await fetch(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=CF&FID_INPUT_ISCD=${code}`,
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${accessToken}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: 'FHMIF10000000',
          custtype: 'P',
        },
      }
    );

    const json = await priceRes.json();
    const price = Number(json.output1?.futs_prpr);

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({
        rate: null,
        error: '선물 가격 조회 실패',
        detail: json,
      }, { status: 500 });
    }

    return NextResponse.json({
      rate: price,
      code,
      name: json.output1?.hts_kor_isnm ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({
      rate: null,
      error: error?.message ?? String(error),
    }, { status: 500 });
  }
}