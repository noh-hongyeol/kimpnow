'use client';

import { useEffect, useState } from 'react';

type StatusItem = {
  id: string;
  label: string;
  age: number | null;
  level: 'green' | 'yellow' | 'red' | 'none' | 'closed';
};

type EntryBox = {
  usd: string;
  contracts: string;
  usdt: string;
};

export default function AdminPage() {
  const [showNetPnl, setShowNetPnl] = useState(false);
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const [upperKimp, setUpperKimp] = useState('-0.5');
  const [lowerKimp, setLowerKimp] = useState('-1.5');
  const [maxAlertCount, setMaxAlertCount] = useState('5');
  const [alertIntervalSec, setAlertIntervalSec] = useState('60');
  const [cooldownMinutes, setCooldownMinutes] = useState('60');

  const [entries, setEntries] = useState<EntryBox[]>([
    { usd: '1528.6', contracts: '10', usdt: '1507' },
    { usd: '', contracts: '', usdt: '' },
    { usd: '', contracts: '', usdt: '' },
  ]);

  const [currentUsd, setCurrentUsd] = useState<number | null>(null);
  const [currentUsdt, setCurrentUsdt] = useState<number | null>(null);

  const [message, setMessage] = useState('');
  const [statusItems, setStatusItems] = useState<StatusItem[]>([]);

  const parsedEntries = entries.map((e) => {
    const usd = Number(e.usd);
    const contracts = Number(e.contracts);
    const usdt = Number(e.usdt);

    return {
      usd,
      contracts,
      usdt,
      valid: usd > 0 && contracts > 0 && usdt > 0,
    };
  });

  const totalContracts = parsedEntries.reduce(
    (sum, e) => sum + (e.valid ? e.contracts : 0),
    0
  );

  const totalUsdtAmount = totalContracts * 10000;

  const avgUsdEntry =
    totalContracts > 0
      ? parsedEntries.reduce(
          (sum, e) => sum + (e.valid ? e.usd * e.contracts : 0),
          0
        ) / totalContracts
      : 0;

  const avgUsdtEntry =
    totalUsdtAmount > 0
      ? parsedEntries.reduce(
          (sum, e) => sum + (e.valid ? e.usdt * e.contracts * 10000 : 0),
          0
        ) / totalUsdtAmount
      : 0;

  const entryKimp =
    avgUsdEntry > 0 ? ((avgUsdtEntry / avgUsdEntry) - 1) * 100 : 0;

  const currentKimp =
    currentUsd && currentUsdt ? ((currentUsdt / currentUsd) - 1) * 100 : null;

  const entrySpread = avgUsdEntry - avgUsdtEntry;

  const currentSpread =
    currentUsd && currentUsdt ? currentUsd - currentUsdt : null;

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
    const saved =
      localStorage.getItem('kimpnow_position_v3') ||
      localStorage.getItem('kimpnow_position_v2');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed.entries)) {
          setEntries(parsed.entries);
        } else {
          setEntries([
            {
              usd: String(parsed.entryUsd1 ?? '1528.6'),
              contracts: String(parsed.contractCount1 ?? '10'),
              usdt: String(parsed.entryUsdt1 ?? '1507'),
            },
            {
              usd: String(parsed.entryUsd2 ?? ''),
              contracts: String(parsed.contractCount2 ?? ''),
              usdt: String(parsed.entryUsdt2 ?? ''),
            },
            { usd: '', contracts: '', usdt: '' },
          ]);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('kimpnow_position_v3', JSON.stringify({ entries }));
  }, [entries]);

  function updateEntry(index: number, key: keyof EntryBox, value: string) {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, [key]: value } : entry
      )
    );
  }

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

    const upbitRes = await fetch(
      'https://api.upbit.com/v1/ticker?markets=KRW-USDT'
    );
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
      <style>{`
        @media (max-width: 768px) {
          main {
            padding: 8px 5px !important;
            overflow-x: hidden !important;
          }

          .dashboard {
            gap: 8px !important;
          }

          .position-card {
            width: 100% !important;
            padding: 9px !important;
            order: 1 !important;
            box-sizing: border-box !important;
          }

          .admin-card {
            width: 100% !important;
            padding: 9px !important;
            order: 2 !important;
            box-sizing: border-box !important;
          }

          .position-card h2 {
            font-size: 19px !important;
            margin-bottom: 8px !important;
          }

          .total-box {
            padding: 9px !important;
            margin-bottom: 8px !important;
          }

          .summary-grid {
            grid-template-columns: 1fr !important;
            gap: 5px !important;
            margin-top: 8px !important;
            padding-top: 8px !important;
          }

          .info-row {
            gap: 8px !important;
          }

          .info-label {
            font-size: 10px !important;
            min-width: 95px !important;
          }

          .big-value {
            font-size: 18px !important;
          }

          .entry-grid {
            grid-template-columns: 1fr !important;
            gap: 7px !important;
          }

          .entry-box {
            padding: 8px !important;
          }

          .entry-box h3 {
            font-size: 15px !important;
            margin-bottom: 7px !important;
          }

          .position-card input,
          .admin-card input {
            padding: 6px !important;
            font-size: 12px !important;
            margin-top: 4px !important;
            margin-bottom: 6px !important;
          }

          .position-card label,
          .admin-card label {
            font-size: 11px !important;
          }

          .system-panel {
            position: fixed !important;
            top: 6px !important;
            right: 6px !important;
            width: 138px !important;
            padding: 7px !important;
            font-size: 10px !important;
          }
        }
      `}</style>

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

          <button onClick={login} style={buttonStyle}>Login</button>

          {message && <p style={{ marginTop: 16, color: '#38bdf8' }}>{message}</p>}
        </div>
      ) : (
        <div style={dashboardStyle} className="dashboard">
          <div style={positionCardStyle} className="position-card">
            <h2 style={{ fontSize: 26, marginBottom: 14 }}>Position Calculator</h2>

            <div style={totalBoxStyle} className="total-box">
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Net PnL</div>
              <div
                className="big-value"
                style={{ ...bigValueStyle, cursor: 'pointer', userSelect: 'none' }}
                onMouseEnter={() => setShowNetPnl(true)}
                onMouseLeave={() => setShowNetPnl(false)}
                onClick={() => setShowNetPnl((v) => !v)}
                title="Hover or click to show"
              >
                {showNetPnl ? netPnl.toLocaleString() : '********'}
              </div>

<div style={summaryGridStyle} className="summary-grid">

  <Info
    label="Current USD Futures"
    value={currentUsd ? currentUsd.toLocaleString() : 'Loading'}
  />

  <Info
    label="Current USDT"
    value={currentUsdt ? currentUsdt.toLocaleString() : 'Loading'}
  />

  

  <Info
    label="Current Kimp"
    value={currentKimp !== null ? `${currentKimp.toFixed(3)}%` : 'Loading'}
  />
    <Info
    label="Current Spread"
    value={currentSpread !== null ? currentSpread.toFixed(1) : 'Loading'}
  />

<Info label="Entry Kimp" value={`${entryKimp.toFixed(3)}%`} small />

<Info label="Entry Spread" value={entrySpread.toFixed(1)} small />

<Info label="Avg USD Entry" value={avgUsdEntry.toFixed(1)} small />

<Info label="Avg USDT Entry" value={avgUsdtEntry.toFixed(1)} small />

<Info label="Futures PnL" value={futuresPnl.toLocaleString()} small />

<Info label="USDT PnL" value={usdtPnl.toLocaleString()} small />

<Info label="Gross PnL" value={grossPnl.toLocaleString()} small />

<Info label="Total Fee" value={`-${totalFee.toLocaleString()}`} small />

</div>
            </div>

            <div style={entryGridStyle} className="entry-grid">
              {entries.map((entry, index) => {
                const contracts = Number(entry.contracts);
                const validAmount = contracts > 0 ? contracts * 10000 : 0;

                return (
                  <div key={index} style={entryBoxStyle} className="entry-box">
                    <h3 style={entryTitleStyle}>Entry {index + 1}</h3>

                    <label>USD Futures Short</label>
                    <input
                      value={entry.usd}
                      onChange={(e) => updateEntry(index, 'usd', e.target.value)}
                      style={entryInputStyle}
                    />

                    <label>Contract Count</label>
                    <input
                      value={entry.contracts}
                      onChange={(e) => updateEntry(index, 'contracts', e.target.value)}
                      style={entryInputStyle}
                    />

                    <label>USDT Long</label>
                    <input
                      value={entry.usdt}
                      onChange={(e) => updateEntry(index, 'usdt', e.target.value)}
                      style={entryInputStyle}
                    />

                    <label>USDT Amount</label>
                    <input
                      value={validAmount.toLocaleString()}
                      readOnly
                      style={entryInputStyle}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={adminCardStyle} className="admin-card">
            <h1 style={{ fontSize: 20, marginBottom: 16 }}>Kimpnow Admin</h1>

            <label>Upper Alert (%)</label>
            <input value={upperKimp} onChange={(e) => setUpperKimp(e.target.value)} style={smallInputStyle} />

            <label>Lower Alert (%)</label>
            <input value={lowerKimp} onChange={(e) => setLowerKimp(e.target.value)} style={smallInputStyle} />

            <label>Max Count</label>
            <input value={maxAlertCount} onChange={(e) => setMaxAlertCount(e.target.value)} style={smallInputStyle} />

            <label>Interval Sec</label>
            <input value={alertIntervalSec} onChange={(e) => setAlertIntervalSec(e.target.value)} style={smallInputStyle} />

            <label>Cooldown Min</label>
            <input value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} style={smallInputStyle} />

            <button onClick={saveSettings} style={buttonStyle}>Save</button>

            {message && <p style={{ marginTop: 16, color: '#38bdf8' }}>{message}</p>}
          </div>
        </div>
      )}
    </main>
  );
}

function Info({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div style={infoRowStyle} className="info-row">

      <div style={infoLabelStyle}>
        {label}
      </div>

      <div
        style={
          small
            ? smallValueStyle
            : bigValueStyle
        }
      >
        {value}
      </div>

    </div>
  );
}

function SystemStatusPanel({ items }: { items: StatusItem[] }) {
  return (
    <div style={statusPanelStyle} className="system-panel">
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
  padding: '22px 12px',
  fontFamily: 'Arial, sans-serif',
};

const dashboardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
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
  width: 185,
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 14,
  order: 2,
};

const positionCardStyle: React.CSSProperties = {
  width: 720,
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 18,
  order: 1,
};

const statusPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  right: 8,
  width: 140,
  background: '#020617',
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 10,
  zIndex: 9999,
  fontSize: 11,
};

const statusTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  color: '#38bdf8',
  marginBottom: 8,
};

const statusRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 4,
  padding: '4px 0',
  whiteSpace: 'nowrap',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  marginTop: 6,
  marginBottom: 12,
  borderRadius: 9,
  border: '1px solid #475569',
  background: '#020617',
  color: 'white',
  fontSize: 15,
};

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '9px',
  marginBottom: 11,
  fontSize: 14,
};

const entryInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '7px',
  marginTop: 5,
  marginBottom: 8,
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: 10,
  border: 'none',
  background: '#2563eb',
  color: 'white',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};

const totalBoxStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: 14,
  borderRadius: 12,
  background: '#020617',
  border: '1px solid #334155',
};

const bigValueStyle: React.CSSProperties = {
  fontSize: 50,
  fontWeight: 900,
  color: 'white',
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
};
const smallValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: 'white',
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
};
const summaryGridStyle: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 14,
  borderTop: '1px solid #334155',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '11px 24px',
};

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
  whiteSpace: 'nowrap',
};

const infoLabelStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
};

const entryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 10,
};

const entryBoxStyle: React.CSSProperties = {
  border: '1px solid #334155',
  borderRadius: 12,
  padding: 10,
  background: '#0b1020',
};

const entryTitleStyle: React.CSSProperties = {
  fontSize: 16,
  marginBottom: 10,
};