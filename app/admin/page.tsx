'use client';

import { useEffect, useState } from 'react';

type StatusItem = {
  id: string;
  label: string;
  age: number | null;
  level: 'green' | 'yellow' | 'red' | 'none' | 'closed';
};

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const [upperKimp, setUpperKimp] = useState('-0.5');
  const [lowerKimp, setLowerKimp] = useState('-1.5');
  const [maxAlertCount, setMaxAlertCount] = useState('5');
  const [alertIntervalSec, setAlertIntervalSec] = useState('60');
  const [cooldownMinutes, setCooldownMinutes] = useState('60');

  const [entryUsd, setEntryUsd] = useState('1528.6');
  const [contractCount, setContractCount] = useState('10');
  const [entryUsdt, setEntryUsdt] = useState('1507');
  const [currentUsd, setCurrentUsd] = useState<number | null>(null);
  const [currentUsdt, setCurrentUsdt] = useState<number | null>(null);

  const [message, setMessage] = useState('');
  const [statusItems, setStatusItems] = useState<StatusItem[]>([]);

  const entryUsdNum = Number(entryUsd);
  const entryUsdtNum = Number(entryUsdt);
  const contractNum = Number(contractCount);
  const usdtAmount = contractNum * 10000;

  const entryKimp =
    entryUsdNum > 0 && entryUsdtNum > 0
      ? ((entryUsdtNum / entryUsdNum) - 1) * 100
      : 0;

  const currentKimp =
    currentUsd && currentUsdt ? ((currentUsdt / currentUsd) - 1) * 100 : null;

  const entrySpread =
    entryUsdNum > 0 && entryUsdtNum > 0 ? entryUsdNum - entryUsdtNum : 0;

  const currentSpread =
    currentUsd && currentUsdt ? currentUsd - currentUsdt : null;

  const futuresPnl =
    currentUsd && entryUsdNum
      ? Math.round((entryUsdNum - currentUsd) * contractNum * 10000)
      : 0;

  const usdtPnl =
    currentUsdt && entryUsdtNum
      ? Math.round((currentUsdt - entryUsdtNum) * usdtAmount)
      : 0;

  const totalPnl = futuresPnl + usdtPnl;

  useEffect(() => {
    const saved = localStorage.getItem('kimpnow_position');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.entryUsd) setEntryUsd(String(parsed.entryUsd));
        if (parsed.contractCount) setContractCount(String(parsed.contractCount));
        if (parsed.entryUsdt) setEntryUsdt(String(parsed.entryUsdt));
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'kimpnow_position',
      JSON.stringify({
        entryUsd,
        contractCount,
        entryUsdt,
      })
    );
  }, [entryUsd, contractCount, entryUsdt]);

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

  async function loadSystemStatus() {
    const res = await fetch('/api/system-status', { cache: 'no-store' });
    const data = await res.json();
    if (data.success) setStatusItems(data.items ?? []);
  }

  async function loadCurrentPrices() {
    const exchangeRes = await fetch('/api/exchange', { cache: 'no-store' });
    const exchangeData = await exchangeRes.json();

    const upbitRes = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT');
    const upbitData = await upbitRes.json();

    setCurrentUsd(Number(exchangeData.rate));
    setCurrentUsdt(Number(upbitData?.[0]?.trade_price));
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
      loadSystemStatus();
      loadCurrentPrices();
    } else {
      setMessage('Wrong password.');
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
      setMessage('Saved');
      loadSettings();
    } else {
      setMessage('Save failed');
    }
  }

  useEffect(() => {
    if (!loggedIn) return;

    loadSettings();
    loadSystemStatus();
    loadCurrentPrices();

    const statusTimer = setInterval(loadSystemStatus, 10000);
    const priceTimer = setInterval(loadCurrentPrices, 10000);

    return () => {
      clearInterval(statusTimer);
      clearInterval(priceTimer);
    };
  }, [loggedIn]);

  return (
    <main style={mainStyle}>
      {loggedIn && <SystemStatusPanel items={statusItems} />}

      {!loggedIn ? (
        <div style={loginCardStyle}>
          <h1 style={{ fontSize: 28, marginBottom: 20 }}>Kimpnow Admin</h1>

          <label>Admin Password</label>
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
            Login
          </button>

          {message && <p style={{ marginTop: 16, color: '#38bdf8' }}>{message}</p>}
        </div>
      ) : (
        <div style={dashboardStyle}>
          <div style={adminCardStyle}>
            <h1 style={{ fontSize: 28, marginBottom: 20 }}>Kimpnow Admin</h1>

            <label>Upper Kimp Alert (%)</label>
            <input value={upperKimp} onChange={(e) => setUpperKimp(e.target.value)} style={inputStyle} />

            <label>Lower Kimp Alert (%)</label>
            <input value={lowerKimp} onChange={(e) => setLowerKimp(e.target.value)} style={inputStyle} />

            <label>Max Alert Count</label>
            <input value={maxAlertCount} onChange={(e) => setMaxAlertCount(e.target.value)} style={inputStyle} />

            <label>Alert Interval Seconds</label>
            <input value={alertIntervalSec} onChange={(e) => setAlertIntervalSec(e.target.value)} style={inputStyle} />

            <label>Cooldown Minutes</label>
            <input value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} style={inputStyle} />

            <button onClick={saveSettings} style={buttonStyle}>
              Save Settings
            </button>

            {message && <p style={{ marginTop: 16, color: '#38bdf8' }}>{message}</p>}
          </div>

          <div style={positionCardStyle}>
            <h2 style={{ fontSize: 24, marginBottom: 14 }}>Position Calculator</h2>

            <div style={totalBoxStyle}>
              <div style={{ color: '#94a3b8', fontSize: 14 }}>Total PnL</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: totalPnl >= 0 ? '#22c55e' : '#ef4444' }}>
                ₩{totalPnl.toLocaleString()}
              </div>

              <div style={summaryGridStyle}>
                <div>Entry Kimp: {entryKimp.toFixed(3)}%</div>
                <div>Current Kimp: {currentKimp !== null ? currentKimp.toFixed(3) + '%' : 'Loading'}</div>
                <div>Entry Spread: ₩{entrySpread.toFixed(1)}</div>
                <div>Current Spread: {currentSpread !== null ? '₩' + currentSpread.toFixed(1) : 'Loading'}</div>
                <div>Current USD Futures: {currentUsd ? '₩' + currentUsd.toLocaleString() : 'Loading'}</div>
                <div>Current USDT: {currentUsdt ? '₩' + currentUsdt.toLocaleString() : 'Loading'}</div>
                <div>Futures PnL: ₩{futuresPnl.toLocaleString()}</div>
                <div>USDT PnL: ₩{usdtPnl.toLocaleString()}</div>
              </div>
            </div>

            <label>USD Futures Entry Short</label>
            <input value={entryUsd} onChange={(e) => setEntryUsd(e.target.value)} style={inputStyle} />

            <label>Contract Count</label>
            <input value={contractCount} onChange={(e) => setContractCount(e.target.value)} style={inputStyle} />

            <label>USDT Entry Long</label>
            <input value={entryUsdt} onChange={(e) => setEntryUsdt(e.target.value)} style={inputStyle} />

            <label>USDT Amount</label>
            <input value={Number.isFinite(usdtAmount) ? usdtAmount.toLocaleString() : '0'} readOnly style={inputStyle} />
          </div>
        </div>
      )}
    </main>
  );
}

function SystemStatusPanel({ items }: { items: StatusItem[] }) {
  return (
    <div style={statusPanelStyle}>
      <div style={statusTitleStyle}>SYSTEM</div>
      {items.map((item) => (
        <div key={item.id} style={statusRowStyle}>
          <span>
            <span style={{ color: levelColor(item.level), marginRight: 6 }}>●</span>
            {item.label}
          </span>
          <span style={{ color: '#94a3b8' }}>{formatAge(item.age)}</span>
        </div>
      ))}
    </div>
  );
}

function levelColor(level: StatusItem['level']) {
  if (level === 'green') return '#22c55e';
  if (level === 'yellow') return '#facc15';
  if (level === 'red') return '#ef4444';
  if (level === 'closed') return '#94a3b8';
  return '#64748b';
}

function formatAge(age: number | null) {
  if (age === null) return 'None';
  if (age < 60) return `${age}s`;
  return `${Math.floor(age / 60)}m`;
}

const mainStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#050816',
  color: 'white',
  padding: '40px 20px',
  fontFamily: 'Arial, sans-serif',
};

const dashboardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 24,
  justifyContent: 'center',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};

const loginCardStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 24,
};

const adminCardStyle: React.CSSProperties = {
  width: 480,
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 24,
};

const positionCardStyle: React.CSSProperties = {
  width: 420,
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 24,
};

const statusPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  width: 230,
  background: '#020617',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 12,
  zIndex: 9999,
  fontSize: 13,
};

const statusTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  color: '#38bdf8',
  marginBottom: 8,
};

const statusRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  padding: '4px 0',
  whiteSpace: 'nowrap',
};

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

const totalBoxStyle: React.CSSProperties = {
  marginBottom: 18,
  padding: 16,
  borderRadius: 12,
  background: '#020617',
  border: '1px solid #334155',
};

const summaryGridStyle: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: '1px solid #334155',
  lineHeight: 1.9,
  fontSize: 15,
};