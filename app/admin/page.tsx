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

  const [entryUsd1, setEntryUsd1] = useState('1528.6');
  const [contractCount1, setContractCount1] = useState('10');
  const [entryUsdt1, setEntryUsdt1] = useState('1507');

  const [entryUsd2, setEntryUsd2] = useState('');
  const [contractCount2, setContractCount2] = useState('');
  const [entryUsdt2, setEntryUsdt2] = useState('');

  const [currentUsd, setCurrentUsd] = useState<number | null>(null);
  const [currentUsdt, setCurrentUsdt] = useState<number | null>(null);

  const [message, setMessage] = useState('');
  const [statusItems, setStatusItems] = useState<StatusItem[]>([]);

  const eUsd1 = Number(entryUsd1);
  const c1 = Number(contractCount1);
  const eUsdt1 = Number(entryUsdt1);

  const eUsd2 = Number(entryUsd2);
  const c2 = Number(contractCount2);
  const eUsdt2 = Number(entryUsdt2);

  const valid1 = eUsd1 > 0 && c1 > 0 && eUsdt1 > 0;
  const valid2 = eUsd2 > 0 && c2 > 0 && eUsdt2 > 0;

  const totalContracts = (valid1 ? c1 : 0) + (valid2 ? c2 : 0);
  const totalUsdtAmount = totalContracts * 10000;

  const avgUsdEntry =
    totalContracts > 0
      ? ((valid1 ? eUsd1 * c1 : 0) + (valid2 ? eUsd2 * c2 : 0)) / totalContracts
      : 0;

  const avgUsdtEntry =
    totalUsdtAmount > 0
      ? ((valid1 ? eUsdt1 * c1 * 10000 : 0) + (valid2 ? eUsdt2 * c2 * 10000 : 0)) / totalUsdtAmount
      : 0;

  const entryKimp = avgUsdEntry > 0 ? ((avgUsdtEntry / avgUsdEntry) - 1) * 100 : 0;
  const currentKimp = currentUsd && currentUsdt ? ((currentUsdt / currentUsd) - 1) * 100 : null;

  const entrySpread = avgUsdEntry - avgUsdtEntry;
  const currentSpread = currentUsd && currentUsdt ? currentUsd - currentUsdt : null;

  const futuresPnl =
    currentUsd && avgUsdEntry && totalContracts
      ? Math.round((avgUsdEntry - currentUsd) * totalContracts * 10000)
      : 0;

  const usdtPnl =
    currentUsdt && avgUsdtEntry && totalUsdtAmount
      ? Math.round((currentUsdt - avgUsdtEntry) * totalUsdtAmount)
      : 0;

  const grossPnl = futuresPnl + usdtPnl;

  const upbitFee = Math.round(avgUsdtEntry * totalUsdtAmount * 0.001);
  const futuresFee = Math.round((totalContracts / 10) * 15000);
  const totalFee = upbitFee + futuresFee;
  const netPnl = grossPnl - totalFee;

  useEffect(() => {
    const saved = localStorage.getItem('kimpnow_position_v2');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.entryUsd1) setEntryUsd1(String(parsed.entryUsd1));
        if (parsed.contractCount1) setContractCount1(String(parsed.contractCount1));
        if (parsed.entryUsdt1) setEntryUsdt1(String(parsed.entryUsdt1));
        if (parsed.entryUsd2 !== undefined) setEntryUsd2(String(parsed.entryUsd2));
        if (parsed.contractCount2 !== undefined) setContractCount2(String(parsed.contractCount2));
        if (parsed.entryUsdt2 !== undefined) setEntryUsdt2(String(parsed.entryUsdt2));
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'kimpnow_position_v2',
      JSON.stringify({
        entryUsd1,
        contractCount1,
        entryUsdt1,
        entryUsd2,
        contractCount2,
        entryUsdt2,
      })
    );
  }, [entryUsd1, contractCount1, entryUsdt1, entryUsd2, contractCount2, entryUsdt2]);

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
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} onKeyDown={(e) => { if (e.key === 'Enter') login(); }} />

          <button onClick={login} style={buttonStyle}>Login</button>

          {message && <p style={{ marginTop: 16, color: '#38bdf8' }}>{message}</p>}
        </div>
      ) : (
        <div style={dashboardStyle}>
          <div style={adminCardStyle}>
            <h1 style={{ fontSize: 26, marginBottom: 20 }}>Kimpnow Admin</h1>

            <label>Upper Alert (%)</label>
            <input value={upperKimp} onChange={(e) => setUpperKimp(e.target.value)} style={inputStyle} />

            <label>Lower Alert (%)</label>
            <input value={lowerKimp} onChange={(e) => setLowerKimp(e.target.value)} style={inputStyle} />

            <label>Max Count</label>
            <input value={maxAlertCount} onChange={(e) => setMaxAlertCount(e.target.value)} style={inputStyle} />

            <label>Interval Sec</label>
            <input value={alertIntervalSec} onChange={(e) => setAlertIntervalSec(e.target.value)} style={inputStyle} />

            <label>Cooldown Min</label>
            <input value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} style={inputStyle} />

            <button onClick={saveSettings} style={buttonStyle}>Save</button>

            {message && <p style={{ marginTop: 16, color: '#38bdf8' }}>{message}</p>}
          </div>

          <div style={positionCardStyle}>
            <h2 style={{ fontSize: 24, marginBottom: 14 }}>Position Calculator</h2>

            <div style={totalBoxStyle}>
              <div style={{ color: '#94a3b8', fontSize: 14 }}>Net PnL</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: netPnl >= 0 ? '#22c55e' : '#ef4444' }}>
                ₩{netPnl.toLocaleString()}
              </div>

              <div style={summaryGridStyle}>
                <Info label="Entry Kimp" value={`${entryKimp.toFixed(3)}%`} />
                <Info label="Current Kimp" value={currentKimp !== null ? `${currentKimp.toFixed(3)}%` : 'Loading'} />
                <Info label="Entry Spread" value={`₩${entrySpread.toFixed(1)}`} />
                <Info label="Current Spread" value={currentSpread !== null ? `₩${currentSpread.toFixed(1)}` : 'Loading'} />
                <Info label="Avg USD Entry" value={`₩${avgUsdEntry.toFixed(1)}`} />
                <Info label="Avg USDT Entry" value={`₩${avgUsdtEntry.toFixed(1)}`} />
                <Info label="Current USD Futures" value={currentUsd ? `₩${currentUsd.toLocaleString()}` : 'Loading'} />
                <Info label="Current USDT" value={currentUsdt ? `₩${currentUsdt.toLocaleString()}` : 'Loading'} />
                <Info label="Futures PnL" value={`₩${futuresPnl.toLocaleString()}`} />
                <Info label="USDT PnL" value={`₩${usdtPnl.toLocaleString()}`} />
                <Info label="Gross PnL" value={`₩${grossPnl.toLocaleString()}`} />
                <Info label="Total Fee" value={`-₩${totalFee.toLocaleString()}`} />
              </div>
            </div>

            <div style={entryGridStyle}>
              <div style={entryBoxStyle}>
                <h3 style={entryTitleStyle}>Entry 1</h3>

                <label>USD Futures Short</label>
                <input value={entryUsd1} onChange={(e) => setEntryUsd1(e.target.value)} style={inputStyle} />

                <label>Contract Count</label>
                <input value={contractCount1} onChange={(e) => setContractCount1(e.target.value)} style={inputStyle} />

                <label>USDT Long</label>
                <input value={entryUsdt1} onChange={(e) => setEntryUsdt1(e.target.value)} style={inputStyle} />

                <label>USDT Amount</label>
                <input value={valid1 ? (c1 * 10000).toLocaleString() : '0'} readOnly style={inputStyle} />
              </div>

              <div style={entryBoxStyle}>
                <h3 style={entryTitleStyle}>Entry 2</h3>

                <label>USD Futures Short</label>
                <input value={entryUsd2} onChange={(e) => setEntryUsd2(e.target.value)} style={inputStyle} />

                <label>Contract Count</label>
                <input value={contractCount2} onChange={(e) => setContractCount2(e.target.value)} style={inputStyle} />

                <label>USDT Long</label>
                <input value={entryUsdt2} onChange={(e) => setEntryUsdt2(e.target.value)} style={inputStyle} />

                <label>USDT Amount</label>
                <input value={valid2 ? (c2 * 10000).toLocaleString() : '0'} readOnly style={inputStyle} />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRowStyle}>
      <span style={{ color: '#cbd5e1' }}>{label}</span>
      <span style={{ fontWeight: 900 }}>{value}</span>
    </div>
  );
}

function SystemStatusPanel({ items }: { items: StatusItem[] }) {
  return (
    <div style={statusPanelStyle}>
      <div style={statusTitleStyle}>SYSTEM</div>
      {items.map((item) => (
        <div key={item.id} style={statusRowStyle}>
          <span><span style={{ color: levelColor(item.level), marginRight: 6 }}>●</span>{item.label}</span>
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
  padding: '30px 20px',
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
  width: 270,
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 20,
};

const positionCardStyle: React.CSSProperties = {
  width: 660,
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
  padding: '11px',
  marginTop: 7,
  marginBottom: 14,
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
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px 18px',
  fontSize: 20,
};

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  whiteSpace: 'nowrap',
};

const entryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
};

const entryBoxStyle: React.CSSProperties = {
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 14,
  background: '#0b1020',
};

const entryTitleStyle: React.CSSProperties = {
  fontSize: 18,
  marginBottom: 12,
};