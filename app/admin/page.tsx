'use client';

import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const [upperKimp, setUpperKimp] = useState('0.1');
  const [lowerKimp, setLowerKimp] = useState('-1');
  const [maxAlertCount, setMaxAlertCount] = useState('5');
  const [alertIntervalSec, setAlertIntervalSec] = useState('60');
  const [cooldownMinutes, setCooldownMinutes] = useState('60');

  const [message, setMessage] = useState('');

  async function loadSettings() {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();

    if (data.success && data.settings) {
      setUpperKimp(String(data.settings.upper_kimp));
      setLowerKimp(String(data.settings.lower_kimp));
      setMaxAlertCount(String(data.settings.max_alert_count));
      setAlertIntervalSec(String(data.settings.alert_interval_sec));
      setCooldownMinutes(String(data.settings.cooldown_minutes ?? 60));
    }
  }

  async function login() {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (data.success) {
      setLoggedIn(true);
      setMessage('');
      loadSettings();
    } else {
      setMessage('비밀번호가 틀렸습니다.');
    }
  }

  async function saveSettings() {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upper_kimp: Number(upperKimp),
        lower_kimp: Number(lowerKimp),
        max_alert_count: Number(maxAlertCount),
        alert_interval_sec: Number(alertIntervalSec),
        cooldown_minutes: Number(cooldownMinutes),
      }),
    });

    const data = await res.json();

    if (data.success) {
      setMessage('저장 완료');
      loadSettings();
    } else {
      setMessage('저장 실패');
    }
  }

  useEffect(() => {
    if (loggedIn) loadSettings();
  }, [loggedIn]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050816',
        color: 'white',
        padding: '40px 20px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          background: '#111827',
          border: '1px solid #334155',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 28, marginBottom: 20 }}>Kimpnow 관리자</h1>

        {!loggedIn ? (
          <>
            <label>관리자 비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') login();
              }}
            />
            <button onClick={login} style={buttonStyle}>
              로그인
            </button>
          </>
        ) : (
          <>
            <label>상단 알림 기준 김프 (%)</label>
            <input
              value={upperKimp}
              onChange={(e) => setUpperKimp(e.target.value)}
              style={inputStyle}
            />

            <label>하단 알림 기준 김프 (%)</label>
            <input
              value={lowerKimp}
              onChange={(e) => setLowerKimp(e.target.value)}
              style={inputStyle}
            />

            <label>최대 알림 횟수</label>
            <input
              value={maxAlertCount}
              onChange={(e) => setMaxAlertCount(e.target.value)}
              style={inputStyle}
            />

            <label>알림 간격 초</label>
            <input
              value={alertIntervalSec}
              onChange={(e) => setAlertIntervalSec(e.target.value)}
              style={inputStyle}
            />

            <label>재발송 대기 분</label>
            <input
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(e.target.value)}
              style={inputStyle}
            />

            <button onClick={saveSettings} style={buttonStyle}>
              설정 저장
            </button>
          </>
        )}

        {message && <p style={{ marginTop: 16, color: '#38bdf8' }}>{message}</p>}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  marginTop: 8,
  marginBottom: 16,
  borderRadius: 10,
  border: '1px solid #475569',
  background: '#020617',
  color: 'white',
  fontSize: 16,
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px',
  borderRadius: 10,
  border: 'none',
  background: '#2563eb',
  color: 'white',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};