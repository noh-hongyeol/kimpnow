/*
파일명: kis_night_futures_ws_v2.js

실행:
npm install ws dotenv @supabase/supabase-js
node kis_night_futures_ws_v2.js

필수 환경변수:
KIS_APP_KEY
KIS_APP_SECRET
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
*/

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const KIS_WS_URL = 'ws://ops.koreainvestment.com:21000';

const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DAY_CODE = 'A75607';
const NIGHT_CODE = 'A75607';
const CONTRACT_NAME = '미국달러 F 202607';

if (!APP_KEY || !APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('환경변수 부족: KIS_APP_KEY, KIS_APP_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function nowText() {
  return new Date().toLocaleString('ko-KR');
}

async function getApprovalKey() {
  const res = await fetch(`${KIS_BASE_URL}/oauth2/Approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: APP_KEY,
      secretkey: APP_SECRET,
    }),
  });

  const json = await res.json();

  if (!res.ok || !json.approval_key) {
    throw new Error(`approval_key 발급 실패: ${JSON.stringify(json)}`);
  }

  return json.approval_key;
}

async function savePrice(price, volume, rawCode) {
  const { error } = await supabase.from('futures_last_price').upsert({
    id: 'usd_front',
    rate: price,
    code: DAY_CODE,
    name: CONTRACT_NAME,
    market: 'night',
    tradable: true,
    is_stale: false,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`[${nowText()}] Supabase 저장 실패:`, error.message);
    return;
  }

  console.log(`[${nowText()}] 저장 완료 ${DAY_CODE} / ${rawCode} / ${price} / vol=${volume}`);
}

function parseTick(message) {
  const text = message.toString();

  if (text.startsWith('{')) {
    console.log(`[${nowText()}] 서버응답`, text);
    return null;
  }

  if (!text.startsWith('0|')) {
    console.log(`[${nowText()}] 기타`, text);
    return null;
  }

  const parts = text.split('|');
  const trId = parts[1];
  const body = parts[3];

  if (trId !== 'H0MFCNT0' || !body) return null;

  const fields = body.split('^');
  const rawCode = fields[0];

  if (rawCode !== NIGHT_CODE) {
    console.log(`[${nowText()}] 다른 종목 수신`, rawCode);
    return null;
  }

  const nums = fields
    .map((v, idx) => ({ idx, value: Number(String(v).replace(/,/g, '')) }))
    .filter((x) => Number.isFinite(x.value));

  const priceCandidate = nums.find((x) => x.value >= 1000 && x.value <= 3000);
  const volumeCandidate = nums.filter((x) => x.value >= 0 && x.value < 100000000).slice(-1)[0];

  if (!priceCandidate) {
    console.log(`[${nowText()}] 가격 후보 못 찾음`, fields.join('^'));
    return null;
  }

  return {
    rawCode,
    price: priceCandidate.value,
    volume: volumeCandidate ? volumeCandidate.value : 0,
  };
}

async function start() {
  console.log('KRX 야간 미국달러선물 수집기 시작');
  console.log(`TR_ID=H0MFCNT0 / tr_key=${NIGHT_CODE}`);

  const approvalKey = await getApprovalKey();
  console.log(`[${nowText()}] approval_key 발급 완료`);

  const ws = new WebSocket(KIS_WS_URL);

  ws.on('open', () => {
    console.log(`[${nowText()}] WebSocket 연결 완료`);

    const subscribe = {
      header: {
        approval_key: approvalKey,
        custtype: 'P',
        tr_type: '1',
        'content-type': 'utf-8',
      },
      body: {
        input: {
          tr_id: 'H0MFCNT0',
          tr_key: NIGHT_CODE,
        },
      },
    };

    ws.send(JSON.stringify(subscribe));
    console.log(`[${nowText()}] 구독 요청 완료`, JSON.stringify(subscribe));

    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);
  });

  ws.on('message', async (message) => {
    const tick = parseTick(message);
    if (!tick) return;
    await savePrice(tick.price, tick.volume, tick.rawCode);
  });

  ws.on('error', (err) => {
    console.error(`[${nowText()}] WebSocket 에러`, err.message);
  });

  ws.on('close', (code, reason) => {
    console.error(`[${nowText()}] WebSocket 종료`, code, reason.toString());
    process.exit(1);
  });
}

start().catch((err) => {
  console.error(`[${nowText()}] 시작 실패`, err.message);
  process.exit(1);
});
