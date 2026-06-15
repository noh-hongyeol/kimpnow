import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 토큰 발급
    const tokenRes = await fetch(
      'https://openapi.koreainvestment.com:9443/oauth2/tokenP',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: process.env.KIS_APP_KEY,
          appsecret: process.env.KIS_APP_SECRET,
        }),
      }
    );

    const tokenJson = await tokenRes.json();

    const accessToken = tokenJson.access_token;

    // 미국달러선물 시세 조회
    const res = await fetch(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-futureoption/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=CF&FID_INPUT_ISCD=${process.env.KIS_USD_FUTURES_CODE}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          appkey: process.env.KIS_APP_KEY!,
          appsecret: process.env.KIS_APP_SECRET!,
          tr_id: 'FHMIF10000000',
        },
      }
    );

    const json = await res.json();

    // 현재가
    const price = Number(json.output?.futs_prpr);

    return NextResponse.json({
      rate: price,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { rate: null },
      { status: 500 }
    );
  }
}