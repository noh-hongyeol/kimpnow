'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { createChart, LineSeries, type IChartApi, type ISeriesApi, type LineData, type UTCTimestamp } from 'lightweight-charts';

interface TickerData {
  market: string;
  trade_price: number;
  acc_trade_price_24h: number;
  change_rate: number;
}

interface BinanceTickerData {
  symbol: string;
  price: string;
}

interface BybitTickerData {
  symbol: string;
  lastPrice: string;
}

interface KimpHistoryRow {
  id?: number;
  created_at: string;
  kimp: number | string | null;
  upbit_price?: number | null;
  binance_price?: number | null;
  exchange_rate?: number | null;
}

type IntervalKey = '1m' | '5m' | '15m' | '1h' | '4h';

const intervalMinutes: Record<IntervalKey, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
};

const intervalLabels: Record<IntervalKey, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
};

const toUnixTime = (createdAt: string): UTCTimestamp => {
  return (
    Math.floor(new Date(createdAt).getTime() / 1000) +
    9 * 60 * 60
  ) as UTCTimestamp;
};

const normalizeHistory = (rows: KimpHistoryRow[]): LineData[] => {
  const map = new Map<number, LineData>();

  rows.forEach((row) => {
    if (!row.created_at || row.kimp === null || row.kimp === undefined) return;

    const time =
  Math.floor(new Date(row.created_at).getTime() / 1000) +
  9 * 60 * 60;
    const value = Number(row.kimp);

    if (!Number.isFinite(time) || !Number.isFinite(value)) return;

    map.set(time, {
      time: time as UTCTimestamp,
      value: Number(value.toFixed(4)),
    });
  });

  return Array.from(map.values()).sort((a, b) => Number(a.time) - Number(b.time));
};

const aggregateHistory = (data: LineData[], interval: IntervalKey): LineData[] => {
  const minutes = intervalMinutes[interval];
  if (minutes === 1) return data;

  const bucketSeconds = minutes * 60;
  const buckets = new Map<number, LineData>();

  data.forEach((point) => {
    const time = Number(point.time);
    const bucketTime = Math.floor(time / bucketSeconds) * bucketSeconds;

    buckets.set(bucketTime, {
      time: bucketTime as UTCTimestamp,
      value: point.value,
    });
  });

  return Array.from(buckets.values()).sort((a, b) => Number(a.time) - Number(b.time));
};

export default function Home() {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const lastSavedMinuteRef = useRef<string | null>(null);

  const [usdFuturesPrice, setUsdFuturesPrice] = useState<number>(0);
  const [usdFuturesMeta, setUsdFuturesMeta] = useState<{
    code?: string;
    name?: string;
    market?: string;
    tradable?: boolean;
    isStale?: boolean;
  }>({});
  const [upbitTickers, setUpbitTickers] = useState<TickerData[]>([]);
  const [bithumbTickers, setBithumbTickers] = useState<TickerData[]>([]);
  const [binanceTickers, setBinanceTickers] = useState<BinanceTickerData[]>([]);
  const [bybitTickers, setBybitTickers] = useState<BybitTickerData[]>([]);

  const [domesticExchange, setDomesticExchange] = useState<'Upbit' | 'Bithumb'>('Upbit');
  const [foreignExchange, setForeignExchange] = useState<'Binance' | 'Bybit'>('Binance');

  const [sortKey, setSortKey] = useState<'market' | 'change_rate' | 'acc_trade_price_24h' | 'trade_price' | 'foreign_price' | 'kimp'>('acc_trade_price_24h');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isFlashingUpdate, setIsFlashingUpdate] = useState(false);
  const [flashStates, setFlashStates] = useState<Record<string, boolean>>({});

  const [rawHistoryData, setRawHistoryData] = useState<LineData[]>([]);
  const [selectedInterval, setSelectedInterval] = useState<IntervalKey>('1m');
  const [chartStatus, setChartStatus] = useState<string>('히스토리 로딩 중');
  const [lastSavedAt, setLastSavedAt] = useState<string>('대기 중');

  const displayedHistoryData = useMemo(() => {
    return aggregateHistory(rawHistoryData, selectedInterval);
  }, [rawHistoryData, selectedInterval]);

  useEffect(() => {
    if (!lastUpdated) return;

    setIsFlashingUpdate(true);
    const timer = setTimeout(() => setIsFlashingUpdate(false), 300);
    return () => clearTimeout(timer);
  }, [lastUpdated]);

  useEffect(() => {
    const updateTimestamp = () => {
      const now = new Date();
      const datePart = now.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const timePart = now.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastUpdated(`${datePart} ${timePart}`);
    };

    updateTimestamp();
    const interval = setInterval(updateTimestamp, 5000);
    return () => clearInterval(interval);
  }, []);

  const triggerFlashOnChange = (prev: any[], next: any[]) => {
    const newFlashStates = { ...flashStates };

    next.forEach((item) => {
      const key = item.market || item.symbol;
      const prevItem = prev.find((p) => (p.market || p.symbol) === key);

      if (prevItem && JSON.stringify(prevItem) !== JSON.stringify(item)) {
        newFlashStates[key] = true;
        setTimeout(() => {
          setFlashStates((s) => ({ ...s, [key]: false }));
        }, 300);
      }
    });

    setFlashStates(newFlashStates);
    return next;
  };

  const fetchUsdFuturesPrice = async () => {
    const res = await axios.get('/api/exchange', {
      params: { t: Date.now() },
      headers: { 'Cache-Control': 'no-cache' },
    });

    setUsdFuturesPrice(Number(res.data.rate));
    setUsdFuturesMeta({
      code: res.data.code,
      name: res.data.name,
      market: res.data.market,
      tradable: res.data.tradable,
      isStale: res.data.isStale,
    });
  };

  const fetchUpbitTickers = async () => {
    const marketsRes = await axios.get('/api/upbit/market-all');
    const krwMarkets = marketsRes.data
      .filter((m: any) => m.market.startsWith('KRW-'))
      .map((m: any) => m.market);

    const tickersRes = await axios.get('/api/upbit', {
      params: { markets: krwMarkets.join(',') },
    });

    const tickers = tickersRes.data.map((item: any) => ({
      market: item.market,
      trade_price: item.trade_price,
      acc_trade_price_24h: item.acc_trade_price_24h,
      change_rate: item.signed_change_rate * 100,
    }));

    setUpbitTickers((prev) => triggerFlashOnChange(prev, tickers));
  };

  const fetchBithumbTickers = async () => {
    const res = await axios.get('/api/bithumb/ticker');
    const data = res.data.data;

    const tickers = Object.keys(data)
      .filter((key) => key !== 'date')
      .map((key) => ({
        market: `KRW-${key}`,
        trade_price: parseFloat(data[key].closing_price),
        acc_trade_price_24h: parseFloat(data[key].acc_trade_value),
        change_rate: parseFloat(data[key].fluctate_rate_24H) || 0,
      }));

    setBithumbTickers((prev) => triggerFlashOnChange(prev, tickers));
  };

  const fetchBinanceTickers = async () => {
    const res = await axios.get('https://api.binance.com/api/v3/ticker/price');
    setBinanceTickers((prev) => triggerFlashOnChange(prev, res.data));
  };

  const fetchBybitTickers = async () => {
    const res = await axios.get('https://api.bybit.com/v5/market/tickers?category=spot');
    const tickers = res.data.result.list.map((item: any) => ({
      symbol: item.symbol,
      lastPrice: item.lastPrice,
    }));
    setBybitTickers((prev) => triggerFlashOnChange(prev, tickers));
  };

  const calculateKimp = (krwPrice: number, foreignPrice: number | null): number | null => {
    if (foreignPrice === null || !usdFuturesPrice) return null;
    const usdToKrwPrice = foreignPrice * usdFuturesPrice;
    return ((krwPrice - usdToKrwPrice) / usdToKrwPrice) * 100;
  };

  const getForeignPrice = (symbol: string): number | null => {
    const symbolName = symbol.replace('KRW-', '').toUpperCase() + 'USDT';

    if (foreignExchange === 'Binance') {
      const ticker = binanceTickers.find((t) => t.symbol === symbolName);
      return ticker ? parseFloat(ticker.price) : null;
    }

    const ticker = bybitTickers.find((t) => t.symbol === symbolName);
    return ticker ? parseFloat(ticker.lastPrice) : null;
  };

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const renderSortArrow = (key: typeof sortKey) => {
    if (sortKey !== key) return '↕';
    return sortOrder === 'asc' ? '▲' : '▼';
  };

  const formatToEok = (value: number) => {
    return `${Math.floor(value / 100000000)}억`;
  };

  const loadHistory = async () => {
    try {
      setChartStatus('히스토리 로딩 중');

      const res = await fetch('/api/kimp-history', {
        cache: 'no-store',
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setChartStatus(`히스토리 실패: ${json.error || json.message || 'API 실패'}`);
        return;
      }

      const normalized = normalizeHistory(json.data || []);
      setRawHistoryData(normalized);
      setChartStatus(`히스토리 로드 완료: 원본 ${normalized.length}개`);
    } catch (error: any) {
      setChartStatus(`히스토리 에러: ${error?.message ?? String(error)}`);
    }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      height: 420,
      autoSize: true,
      localization: {
        locale: 'ko-KR',
        timeFormatter: (time: number) => {
          return new Date(time * 1000).toLocaleString('ko-KR', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
        },
      },
      layout: {
        background: { color: '#111827' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#facc15',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(3)}%`,
      },
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

    loadHistory();

    const handleResize = () => {
      if (!chartContainerRef.current) return;
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      chart.timeScale().fitContent();
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      lineSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!lineSeriesRef.current || !chartRef.current) return;

    lineSeriesRef.current.setData(displayedHistoryData);

    if (displayedHistoryData.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [displayedHistoryData]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadHistory();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      await Promise.all([
        fetchUsdFuturesPrice(),
        fetchUpbitTickers(),
        fetchBithumbTickers(),
        fetchBinanceTickers(),
        fetchBybitTickers(),
      ]);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

  const tickers = domesticExchange === 'Upbit' ? upbitTickers : bithumbTickers;

  const sortedTickers: (TickerData & {
    foreign_price: number | null;
    kimp: number | null;
  })[] = tickers
    .filter((ticker) => ticker.trade_price !== null)
    .map((ticker) => {
      const foreignPrice = getForeignPrice(ticker.market);
      const kimp = foreignPrice !== null ? calculateKimp(ticker.trade_price, foreignPrice) : null;

      return {
        ...ticker,
        foreign_price: foreignPrice,
        kimp,
      };
    })
    .sort((a, b) => {
      const order = sortOrder === 'asc' ? 1 : -1;

      if (sortKey === 'market') {
        return a.market.localeCompare(b.market) * order;
      }

      const aValue = a[sortKey];
      const bValue = b[sortKey];

      return (Number(aValue) - Number(bValue)) * order;
    });

  const btcTicker = tickers.find((t) => t.market === 'KRW-BTC');
  const btcForeignPrice = getForeignPrice('KRW-BTC');

  const btcKimp =
    btcTicker && btcForeignPrice !== null
      ? calculateKimp(btcTicker.trade_price, btcForeignPrice)
      : null;

  const btcDivide =
    btcTicker && btcForeignPrice
      ? btcTicker.trade_price / btcForeignPrice
      : null;

  const upbitUsdtTicker = upbitTickers.find((t) => t.market === 'KRW-USDT');

  const usdtKimp =
    upbitUsdtTicker && usdFuturesPrice
      ? ((upbitUsdtTicker.trade_price / usdFuturesPrice) - 1) * 100
      : null;

  useEffect(() => {
    if (usdtKimp === null) return;

    const now = new Date();
    const minuteKey = now.toISOString().slice(0, 16);

    if (lastSavedMinuteRef.current === minuteKey) return;
    lastSavedMinuteRef.current = minuteKey;

    const saveKimp = async () => {
      try {
        setLastSavedAt('저장 중');

        const res = await fetch('/api/save-kimp', {
          method: 'GET',
          cache: 'no-store',
        });

        const json = await res.json();

        if (!res.ok || !json.success) {
          setLastSavedAt(`저장 실패: ${json.error || json.message || 'API 실패'}`);
          return;
        }

        const savedRow = Array.isArray(json.data) ? json.data[0] : json.data;

        if (savedRow?.created_at && savedRow?.kimp !== null && savedRow?.kimp !== undefined) {
          const newPoint: LineData = {
            time: toUnixTime(savedRow.created_at),
            value: Number(Number(savedRow.kimp).toFixed(4)),
          };

          setRawHistoryData((prev) => {
            const map = new Map<number, LineData>();
            [...prev, newPoint].forEach((point) => {
              map.set(Number(point.time), point);
            });
            return Array.from(map.values()).sort((a, b) => Number(a.time) - Number(b.time));
          });

          await loadHistory();
          setLastSavedAt(new Date(savedRow.created_at).toLocaleString('ko-KR'));
          return;
        }

        await loadHistory();
        setLastSavedAt(new Date().toLocaleString('ko-KR'));
      } catch (error: any) {
        setLastSavedAt(`저장 에러: ${error?.message ?? String(error)}`);
      }
    };

    saveKimp();
  }, [usdtKimp]);

  return (
    <>
      <a
  href="/admin"
  style={{
    position: 'fixed',
    top: '12px',
    right: '12px',
    zIndex: 9999,
    background: '#2563eb',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
  }}
>
  관리자
</a>
      <div className="min-h-screen bg-gray-900 text-white p-4 space-y-8">
        <div className={`text-lg font-bold mb-4 text-center transition duration-300 ${isFlashingUpdate ? 'text-yellow-400' : 'text-gray-300'}`}>
          실시간 업데이트: {lastUpdated || '로딩 중...'}
        </div>

        <div className="flex flex-col md:flex-row w-full max-w-6xl mx-auto justify-center items-stretch gap-4">
          <div className="w-full md:w-[560px] flex-shrink-0">
            <table className="w-full h-full border border-gray-700 text-xl md:text-3xl leading-none">
              <tbody>
                <tr className="border-b border-gray-700">
                  <td className="px-4 py-2">
                    <span className="text-blue-400">
                      KRX USD Futures
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    <div>{usdFuturesPrice ? '₩' + usdFuturesPrice.toLocaleString() : 'Loading...'}</div>

                  </td>
                </tr>

                <tr className="border-b border-gray-700">
                  <td className="px-4 py-2">
                    <a
                      href="https://upbit.com/exchange?code=CRIX.UPBIT.KRW-USDT"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      USDT upbit
                    </a>
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {upbitUsdtTicker ? '₩' + upbitUsdtTicker.trade_price.toLocaleString() : 'Loading...'}
                  </td>
                </tr>

                <tr className="border-b border-gray-700">
                  <td className="px-4 py-2 font-bold">BTC FX Rate</td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {btcDivide !== null ? '₩' + btcDivide.toFixed(1) : 'Calculating...'}
                  </td>
                </tr>

                <tr>
                  <td className="px-4 py-2 font-bold"> BTC kimp</td>
                  <td className={`px-4 py-2 text-right font-bold ${btcKimp !== null ? (btcKimp >= 0 ? 'text-red-500' : 'text-blue-500') : ''}`}>
                    {btcKimp !== null ? btcKimp.toFixed(2) + '%' : '계산 중...'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 justify-center items-center flex-shrink-0 w-full md:w-[420px]">
            <a href="https://accounts.binance.com/register?ref=NJ3Y7YUZ" target="_blank" rel="noopener noreferrer" className="block w-full">
              <img src="/binance-banner2.png" alt="바이낸스 배너" className="w-full h-[96px] md:h-[104px] object-contain" />
            </a>

            <a href="https://www.bybit.com/invite?ref=OLVJA" target="_blank" rel="noopener noreferrer" className="block w-full">
              <img src="/bybit-banner2.png" alt="바이빗 배너" className="w-full h-[96px] md:h-[104px] object-contain" />
            </a>
          </div>
        </div>

        <div className="w-full max-w-6xl mx-auto bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-2xl font-bold">USDT kimp</h2>
              <p className="text-sm text-gray-400 mt-1">
                (USDT upbit ÷ KRX USD Futures - 1) × 100 DB based
              </p>
              <p className="text-xs text-gray-500 mt-1">
                status: {chartStatus} / save: {lastSavedAt}
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                {(['1m', '5m', '15m', '1h', '4h'] as IntervalKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedInterval(key)}
                    className={`px-3 py-1 rounded border text-sm ${
                      selectedInterval === key
                        ? 'bg-yellow-400 text-black border-yellow-400'
                        : 'bg-gray-900 text-white border-gray-600'
                    }`}
                  >
                    {intervalLabels[key]}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={loadHistory}
                  className="px-3 py-1 rounded border border-gray-600 bg-gray-900 text-white text-sm"
                >
                  refresh
                </button>
              </div>
            </div>

            <div className="text-right shrink-0 w-full md:w-[240px] overflow-hidden">
              <div className="text-base md:text-lg text-gray-400"> USDT kimp</div>
              <div className={`text-4xl md:text-5xl font-bold whitespace-nowrap leading-tight ${usdtKimp !== null ? (usdtKimp >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-400'}`}>
                {usdtKimp !== null ? usdtKimp.toFixed(3) + '%' : '계산 중...'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                원본 {rawHistoryData.length}개 / {intervalLabels[selectedInterval]}봉 {displayedHistoryData.length}개
              </div>
              <div className="text-xs text-gray-500 mt-1">
                마지막 저장: {lastSavedAt}
              </div>
            </div>
          </div>

          <div ref={chartContainerRef} className="w-full h-[420px]" />
        </div>

        <h1 className="text-4xl font-bold mb-6 text-center">Real-Time Kimchi Premium</h1>

        <div className="mb-2 text-center space-x-4">
          <label className="font-semibold">Korean Exchange:</label>
          <select
            value={domesticExchange}
            onChange={(e) => setDomesticExchange(e.target.value as 'Upbit' | 'Bithumb')}
            className="border rounded p-1 text-black"
          >
            <option value="Upbit">upbit</option>
            <option value="Bithumb">bithumb</option>
          </select>

          <label className="font-semibold ml-4">Global Exchange:</label>
          <select
            value={foreignExchange}
            onChange={(e) => setForeignExchange(e.target.value as 'Binance' | 'Bybit')}
            className="border rounded p-1 text-black"
          >
            <option value="Binance">binance</option>
            <option value="Bybit">bybit</option>
          </select>
        </div>

        <div className="w-full max-w-5xl mx-auto">
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-700 text-sm md:text-sm text-xs leading-tight">
              <thead>
                <tr className="bg-gray-800">
                  <th className="md:p-2 p-1 text-left cursor-pointer" onClick={() => handleSort('market')}>
                    coin {renderSortArrow('market')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('change_rate')}>
                    change(24h) {renderSortArrow('change_rate')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('acc_trade_price_24h')}>
                    volume {renderSortArrow('acc_trade_price_24h')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('trade_price')}>
                    {domesticExchange} price {renderSortArrow('trade_price')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('foreign_price')}>
                    {foreignExchange} price {renderSortArrow('foreign_price')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('kimp')}>
                    kimp(%) {renderSortArrow('kimp')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedTickers.map((ticker) => {
                  const isFlashing = flashStates[ticker.market];
                  const flashClass = isFlashing ? 'text-yellow-400' : '';

                  return (
                    <tr key={ticker.market}>
                      <td className="p-2 flex items-center space-x-2">
                        <img
                          src={`https://static.upbit.com/logos/${ticker.market.replace('KRW-', '')}.png`}
                          alt={ticker.market.replace('KRW-', '')}
                          className="w-5 h-5"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                        <span className={`${ticker.market.replace('KRW-', '').length > 6 ? 'text-[10px]' : 'text-xs'}`}>
                          {ticker.market.replace('KRW-', '')}
                        </span>
                      </td>

                      <td className={`p-2 text-right ${ticker.change_rate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {typeof ticker.change_rate === 'number' ? ticker.change_rate.toFixed(2) + '%' : 'N/A'}
                      </td>

                      <td className="md:p-2 p-1 text-right">
                        {formatToEok(ticker.acc_trade_price_24h)}
                      </td>

                      <td className="md:p-2 p-1 text-right">
                        <span className={flashClass}>
                          {ticker.trade_price !== null ? ticker.trade_price.toLocaleString() + ' ₩' : 'N/A'}
                        </span>
                      </td>

                      <td className="md:p-2 p-1 text-right">
                        <span className={flashClass}>
                          {ticker.foreign_price !== null ? ticker.foreign_price.toFixed(2) + ' $' : 'N/A'}
                        </span>
                      </td>

                      <td className="md:p-2 p-1 text-right">
                        <span className={`${flashClass} ${ticker.kimp !== null ? (ticker.kimp >= 0 ? 'text-red-500' : 'text-blue-500') : ''}`}>
                          {ticker.kimp !== null ? ticker.kimp.toFixed(2) + '%' : 'N/A'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="text-center text-s text-gray-500 space-y-4 mt-8">
        <p>후원 (Donate)</p>

        <div className="flex items-center justify-center space-x-4">
          <div>
            <div>BTC</div>
            <div>13pZynx4w4LYS65kyk86YXhQo7v2LSoGF1</div>
          </div>
          <img src="/btc_qr.png" alt="BTC QR" className="w-16 h-16" />
        </div>

        <div className="flex items-center justify-center space-x-4">
          <div>
            <div>USDT (TRC20)</div>
            <div>TPXiKwCdAhagY6FD3EZ7By2JS9PSGocfzN</div>
          </div>
          <img src="/usdt_qr.png" alt="USDT QR" className="w-16 h-16" />
        </div>
      </div>

      <footer className="w-full border-t border-gray-700 mt-10 pt-4 pb-6 text-center text-xs text-gray-400 space-y-2">
        <p>※ 본 사이트는 투자 권유 또는 자문을 제공하지 않으며, 투자 판단 및 결과는 이용자 본인의 책임입니다.</p>
        <p>※ 표기되는 김프 및 시세 정보는 참고용으로 지연 또는 오차가 발생할 수 있습니다.</p>
        <p>※ 일부 링크는 제휴(레퍼럴) 링크로 수익이 발생할 수 있으며, 본 사이트는 금융기관과 무관한 개인 개발 서비스입니다.</p>
        <p>※ 문의 e18901@gmail.com</p>
      </footer>
    </>
  );
}
