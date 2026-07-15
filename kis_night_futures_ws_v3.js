/*
파일명: kis_night_futures_ws_v3.js
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

const NIGHT_CODE = 'A75607';
const CONTRACT_NAME = '미국달러 F 202607';

const WATCHDOG_INTERVAL_MS = 10000;
const NO_MESSAGE_RESTART_MS = 60000;
const SAVE_INTERVAL_MS = 5000;

if (!APP_KEY || !APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('환경변수 부족');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function nowText() {
  return new Date().toLocaleString('ko-KR');
}

async function getApprovalKey() {
  const res = await fetch(`${KIS_BASE_URL}/oauth2/Approval`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: APP_KEY,
      secretkey: APP_SECRET,
    }),
  });

  const json = await res.json();

  if (!json.approval_key) {
    throw new Error(`approval 실패 ${JSON.stringify(json)}`);
  }

  return json.approval_key;
}

async function savePrice(price) {
  const { error } = await supabase.from('futures_last_price').upsert({
    id: 'usd_front',
    rate: price,
    code: NIGHT_CODE,
    name: CONTRACT_NAME,
    market: 'night',
    tradable: true,
    is_stale: false,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.log(`[${nowText()}] 저장 실패`, error.message);
    return;
  }

  console.log(`[${nowText()}] 저장 완료 ${price}`);
}

function parseHoga(message) {
  const text = message.toString();

  if (!text.startsWith('0|H0MFASP0')) {
    return null;
  }

  const body = text.split('|')[3];
  if (!body) return null;

  const fields = body.split('^');

  if (fields[0] !== NIGHT_CODE) {
    return null;
  }

  const ask1 = Number(fields[2]);
  const bid1 = Number(fields[7]);

  if (!ask1 || !bid1) {
    return null;
  }

  return Number(((ask1 + bid1) / 2).toFixed(2));
}

function restart(reason, ws, watchdog) {
  console.error(`[${nowText()}] ${reason}`);

  if (watchdog) {
    clearInterval(watchdog);
  }

  try {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.terminate();
    }
  } catch (e) {
    console.error(`[${nowText()}] WebSocket terminate 실패`, e.message);
  }

  process.exit(1);
}

async function start() {
  console.log('KRX 야간 미국달러선물 시작');

  const approvalKey = await getApprovalKey();
  const ws = new WebSocket(KIS_WS_URL);

  let lastSavedAt = 0;
  let lastSavedPrice = null;
  let lastMessageAt = Date.now();
  let watchdog = null;

  ws.on('open', () => {
    console.log(`[${nowText()}] 연결 완료`);

    const subscribe = {
      header: {
        approval_key: approvalKey,
        custtype: 'P',
        tr_type: '1',
        'content-type': 'utf-8',
      },
      body: {
        input: {
          tr_id: 'H0MFASP0',
          tr_key: NIGHT_CODE,
        },
      },
    };

    ws.send(JSON.stringify(subscribe));
    console.log(`[${nowText()}] 구독 요청 완료 ${NIGHT_CODE}`);
  });

  ws.on('message', async (message) => {
    lastMessageAt = Date.now();

    const price = parseHoga(message);
    if (!price) return;

    const now = Date.now();

    if (price === lastSavedPrice) {
      return;
    }

    if (now - lastSavedAt < SAVE_INTERVAL_MS) {
      return;
    }

    lastSavedAt = now;
    lastSavedPrice = price;

    await savePrice(price);
  });

  watchdog = setInterval(() => {
    const diff = Date.now() - lastMessageAt;

    if (diff > NO_MESSAGE_RESTART_MS) {
      restart(
        `WATCHDOG - ${Math.floor(diff / 1000)}초 동안 KIS 데이터 수신 없음 → 재시작`,
        ws,
        watchdog
      );
    }
  }, WATCHDOG_INTERVAL_MS);

  ws.on('error', (err) => {
    restart(`WebSocket 에러 ${err.message}`, ws, watchdog);
  });

  ws.on('close', (code, reason) => {
    restart(
      `WebSocket 종료 code=${code} reason=${reason ? reason.toString() : ''}`,
      ws,
      watchdog
    );
  });
}

start().catch((err) => {
  console.error(`[${nowText()}] 시작 실패`, err.message);
  process.exit(1);
});