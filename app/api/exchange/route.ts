import { NextResponse } from 'next/server';

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

let cachedToken: string | null = null;
let tokenExpireAt = 0;
let tokenRetryAfter = 0;

// ==================== 토큰 발급 ====================

async function getKisToken(): Promise<string> {
  const now = Date.now();

  // 기존 토큰 재사용
  if (cachedToken && now < tokenExpireAt) {
    return cachedToken;
  }

  // 1분 제한 보호
  if (now < tokenRetryAfter) {
    throw new Error('KIS_TOKEN_COOLDOWN');
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
    tokenRetryAfter = now + 70 * 1000;

    throw new Error(
      tokenJson.error_description ||
        tokenJson.error_code ||
        '토큰 발급 실패'
    );
  }

  cachedToken = tokenJson.access_token;

  // 23시간 재사용
  tokenExpireAt = now + 23 * 60 * 60 * 1000;

  return cachedToken as string;
}

// ==================== 근월물 자동 선택 ====================

function getFrontMonthCode() {
  const now = new Date();

  const year = now.getFullYear();
  let month = now.getMonth() + 1;

  // 오늘이 20일 이후면 다음 월물 사용
  // (나중에 최종거래일 계산으로 고도화 가능)
  if (now.getDate() >= 20) {
    month += 1;
  }

  if (month > 12) {
    month = 1;
  }

  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');

  return `A75${yy}${mm}`;
}

// ==================== 메인 ====================

export async function GET() {
  try {
    const accessToken = await getKisToken();

    const code = getFrontMonthCode();

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

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        {
          rate: null,
          code,
          error: '선물 가격 조회 실패',
          detail: json,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      rate: price,
      code,
      name: output.hts_kor_isnm,
    });
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