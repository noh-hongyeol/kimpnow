require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const WebSocket = require('ws');

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const KIS_WS_URL = 'ws://ops.koreainvestment.com:21000';

const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;

const NIGHT_CODE = 'A75607';

const TEST_TR_IDS = [
  'H0MFCNT0', // 현재 체결 TR
  'H0MFASP0', // 호가 후보 TR
];

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

function printMessage(message) {
  const text = message.toString();

  console.log('\n==============================');
  console.log(`[${nowText()}] RAW MESSAGE`);
  console.log(text);

  if (text.startsWith('0|')) {
    const parts = text.split('|');
    console.log('TR_ID:', parts[1]);
    console.log('BODY:', parts[3]);
  }
}

async function start() {
  if (!APP_KEY || !APP_SECRET) {
    console.error('KIS_APP_KEY 또는 KIS_APP_SECRET 없음');
    process.exit(1);
  }

  console.log('KIS 야간 WebSocket 디버그 시작');
  console.log(`종목코드: ${NIGHT_CODE}`);
  console.log(`테스트 TR: ${TEST_TR_IDS.join(', ')}`);

  const approvalKey = await getApprovalKey();
  console.log(`[${nowText()}] approval_key 발급 완료`);

  const ws = new WebSocket(KIS_WS_URL);

  ws.on('open', () => {
    console.log(`[${nowText()}] WebSocket 연결 완료`);

    for (const trId of TEST_TR_IDS) {
      const subscribe = {
        header: {
          approval_key: approvalKey,
          custtype: 'P',
          tr_type: '1',
          'content-type': 'utf-8',
        },
        body: {
          input: {
            tr_id: trId,
            tr_key: NIGHT_CODE,
          },
        },
      };

      ws.send(JSON.stringify(subscribe));
      console.log(`[${nowText()}] 구독 요청: ${trId}`, JSON.stringify(subscribe));
    }

    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);
  });

  ws.on('message', printMessage);

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