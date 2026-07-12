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

const FAST_POLL_MS = 10_000;
const NAVER_POLL_MS = 60_000;
const PREMIUM_TABLE_POLL_MS = 5 * 60_000;
const MARKET_ALL_POLL_MS = 10 * 60_000;

const toUnixTime = (createdAt: string): UTCTimestamp => {
  return Math.floor(new Date(createdAt).getTime() / 1000) as UTCTimestamp;
};

const normalizeHistory = (rows: any[]): LineData[] => {
  const map = new Map<number, LineData>();

  rows.forEach((row) => {
    const timeValue = row.created_at || row.time;
    const kimpValue = row.kimp;

    if (!timeValue || kimpValue === null || kimpValue === undefined) return;

const time = Math.floor(new Date(timeValue).getTime() / 1000);

    const value = Number(kimpValue);

    if (!Number.isFinite(time) || !Number.isFinite(value)) return;

    map.set(time, {
      time: time as UTCTimestamp,
      value: Number(value.toFixed(4)),
    });
  });

  return Array.from(map.values()).sort(
    (a, b) => Number(a.time) - Number(b.time)
  );
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
  const previousDashboardValuesRef = useRef<Record<string, string | null>>({});
  const upbitMarketsRef = useRef<string[]>([]);
  const marketAllFetchedAtRef = useRef<number>(0);
  const inFlightRef = useRef<Record<string, boolean>>({});

  const [naverExchangeRate, setNaverExchangeRate] = useState<number>(0);
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
  const [topUpbitTickers, setTopUpbitTickers] = useState<TickerData[]>([]);
  const [topForeignBtcPrice, setTopForeignBtcPrice] = useState<number | null>(null);

  const [domesticExchange, setDomesticExchange] = useState<'Upbit' | 'Bithumb'>('Upbit');
  const [foreignExchange, setForeignExchange] = useState<'Binance' | 'Bybit'>('Binance');

  const [sortKey, setSortKey] = useState<'market' | 'change_rate' | 'acc_trade_price_24h' | 'trade_price' | 'foreign_price' | 'kimp'>('acc_trade_price_24h');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isFlashingUpdate, setIsFlashingUpdate] = useState(false);
  const [flashStates, setFlashStates] = useState<Record<string, boolean>>({});
  const [dashboardFlashStates, setDashboardFlashStates] = useState<Record<string, boolean>>({});

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

  const runRequest = async (key: string, task: () => Promise<void>) => {
    if (inFlightRef.current[key]) return;

    inFlightRef.current[key] = true;
    try {
      await task();
    } catch (error) {
      console.error(`[${key}] request failed`, error);
    } finally {
      inFlightRef.current[key] = false;
    }
  };

  const fetchNaverExchangeRate = async () => {
    await runRequest('naver-exchange', async () => {
      const res = await axios.get('/api/naver-exchange', {
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });

      setNaverExchangeRate(Number(res.data.rate));
    });
  };

  const fetchUsdFuturesPrice = async () => {
    await runRequest('usd-futures', async () => {
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
    });
  };

  const fetchTopUpbitTickers = async () => {
    await runRequest('top-upbit', async () => {
      const res = await axios.get('/api/upbit', {
        params: { markets: 'KRW-USDT,KRW-BTC' },
      });

      const tickers = res.data.map((item: any) => ({
        market: item.market,
        trade_price: item.trade_price,
        acc_trade_price_24h: item.acc_trade_price_24h,
        change_rate: item.signed_change_rate * 100,
      }));

      setTopUpbitTickers(tickers);
    });
  };

  const fetchTopForeignBtcPrice = async () => {
    const requestKey = `top-foreign-${foreignExchange.toLowerCase()}`;

    await runRequest(requestKey, async () => {
      if (foreignExchange === 'Binance') {
        const res = await axios.get(
          'https://api.binance.com/api/v3/ticker/price',
          { params: { symbol: 'BTCUSDT' } }
        );
        setTopForeignBtcPrice(Number(res.data.price));
        return;
      }

      const res = await axios.get(
        'https://api.bybit.com/v5/market/tickers',
        { params: { category: 'spot', symbol: 'BTCUSDT' } }
      );
      const ticker = res.data?.result?.list?.[0];
      setTopForeignBtcPrice(ticker ? Number(ticker.lastPrice) : null);
    });
  };

  const fetchUpbitMarkets = async (force = false): Promise<string[]> => {
    const now = Date.now();
    const cachedMarkets = upbitMarketsRef.current;
    const cacheIsFresh =
      cachedMarkets.length > 0 &&
      now - marketAllFetchedAtRef.current < MARKET_ALL_POLL_MS;

    if (!force && cacheIsFresh) return cachedMarkets;

    if (inFlightRef.current['upbit-market-all']) {
      return cachedMarkets;
    }

    inFlightRef.current['upbit-market-all'] = true;
    try {
      const marketsRes = await axios.get('/api/upbit/market-all');
      const krwMarkets = marketsRes.data
        .filter((m: any) => m.market.startsWith('KRW-'))
        .map((m: any) => m.market);

      upbitMarketsRef.current = krwMarkets;
      marketAllFetchedAtRef.current = Date.now();
      return krwMarkets;
    } catch (error) {
      console.error('[upbit-market-all] request failed', error);
      return cachedMarkets;
    } finally {
      inFlightRef.current['upbit-market-all'] = false;
    }
  };

  const fetchUpbitTickers = async () => {
    await runRequest('upbit-table', async () => {
      const krwMarkets = await fetchUpbitMarkets(false);
      if (krwMarkets.length === 0) return;

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
    });
  };

  const fetchBithumbTickers = async () => {
    await runRequest('bithumb-table', async () => {
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
    });
  };

  const fetchBinanceTickers = async () => {
    await runRequest('binance-table', async () => {
      const res = await axios.get('https://api.binance.com/api/v3/ticker/price');
      setBinanceTickers((prev) => triggerFlashOnChange(prev, res.data));
    });
  };

  const fetchBybitTickers = async () => {
    await runRequest('bybit-table', async () => {
      const res = await axios.get(
        'https://api.bybit.com/v5/market/tickers?category=spot'
      );
      const tickers = res.data.result.list.map((item: any) => ({
        symbol: item.symbol,
        lastPrice: item.lastPrice,
      }));
      setBybitTickers((prev) => triggerFlashOnChange(prev, tickers));
    });
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

  const getDashboardValueClass = (key: string, baseColorClass = 'text-white') => {
    const isFlashing = dashboardFlashStates[key];

    return [
      'inline-block rounded-md px-1.5 transition-all duration-300 whitespace-nowrap',
      baseColorClass,
      isFlashing ? 'bg-yellow-400/20 text-yellow-300' : '',
    ].join(' ');
  };

  const renderFlashDot = (key: string) => {
    return (
      <span
        className={`ml-2 inline-block h-2 w-2 rounded-full bg-green-400 align-middle transition-opacity duration-300 ${
          dashboardFlashStates[key] ? 'opacity-100' : 'opacity-0'
        }`}
      />
    );
  };

  const formatToEok = (value: number) => {
    return `${Math.floor(value / 100000000)}억`;
  };

const loadHistory = async (
  intervalKey: IntervalKey = selectedInterval
) => {
  try {
    setChartStatus("히스토리 로딩 중");

    const res = await fetch(`/api/kimp-history?range=${intervalKey}`, {
      cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok) {
      setChartStatus(`히스토리 실패: ${json.error || "API 실패"}`);
      return;
    }

    const normalized = normalizeHistory(json);

    setRawHistoryData(normalized);

    setChartStatus(
      `히스토리 로드 완료: ${intervalKey} ${normalized.length}개`
    );
  } catch (error: any) {
    setChartStatus(`히스토리 에러: ${error?.message ?? String(error)}`);
  }
};

  useEffect(() => {
    if (!chartContainerRef.current) return;

const chart = createChart(chartContainerRef.current, {
  height: 390,
  autoSize: true,
  handleScroll: {
    mouseWheel: true,
    pressedMouseMove: true,
    horzTouchDrag: true,
    vertTouchDrag: true,
  },
  handleScale: {
    axisPressedMouseMove: true,
    mouseWheel: true,
    pinch: true,
  },
localization: {
  locale: 'ko-KR',
  timeFormatter: (time: number) => {
    return new Date(time * 1000).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
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


  }, [displayedHistoryData]);

  useEffect(() => {
    loadHistory(selectedInterval);
  }, [selectedInterval]);

  useEffect(() => {
    const fetchFastData = async () => {
      if (document.hidden) return;

      await Promise.all([
        fetchUsdFuturesPrice(),
        fetchTopUpbitTickers(),
        fetchTopForeignBtcPrice(),
      ]);
    };

    fetchFastData();
    const interval = setInterval(fetchFastData, FAST_POLL_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchFastData();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [foreignExchange]);

  useEffect(() => {
    const fetchNaver = () => {
      if (document.hidden) return;
      fetchNaverExchangeRate();
    };

    fetchNaver();
    const interval = setInterval(fetchNaver, NAVER_POLL_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchNaver();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const fetchSelectedTable = async () => {
      if (document.hidden) return;

      await Promise.all([
        domesticExchange === 'Upbit'
          ? fetchUpbitTickers()
          : fetchBithumbTickers(),
        foreignExchange === 'Binance'
          ? fetchBinanceTickers()
          : fetchBybitTickers(),
      ]);
    };

    fetchSelectedTable();
    const interval = setInterval(fetchSelectedTable, PREMIUM_TABLE_POLL_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchSelectedTable();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [domesticExchange, foreignExchange]);

  useEffect(() => {
    if (domesticExchange !== 'Upbit') return;

    const refreshMarketList = () => {
      if (document.hidden) return;
      fetchUpbitMarkets(true);
    };

    const interval = setInterval(refreshMarketList, MARKET_ALL_POLL_MS);

    return () => clearInterval(interval);
  }, [domesticExchange]);

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

  const btcTicker = topUpbitTickers.find((t) => t.market === 'KRW-BTC');
  const btcForeignPrice = topForeignBtcPrice;

  const btcKimp =
    btcTicker && btcForeignPrice !== null
      ? calculateKimp(btcTicker.trade_price, btcForeignPrice)
      : null;

  const btcDivide =
    btcTicker && btcForeignPrice
      ? btcTicker.trade_price / btcForeignPrice
      : null;

  const upbitUsdtTicker = topUpbitTickers.find((t) => t.market === 'KRW-USDT');

  const usdtKimp =
    upbitUsdtTicker && usdFuturesPrice
      ? ((upbitUsdtTicker.trade_price / usdFuturesPrice) - 1) * 100
      : null;

  const currentSpread =
    upbitUsdtTicker && usdFuturesPrice
      ? upbitUsdtTicker.trade_price - usdFuturesPrice
      : null;

  useEffect(() => {
    const currentValues: Record<string, string | null> = {
      usdFutures: usdFuturesPrice ? usdFuturesPrice.toFixed(4) : null,
      currentUsdt: upbitUsdtTicker ? String(upbitUsdtTicker.trade_price) : null,
      currentKimp: usdtKimp !== null ? usdtKimp.toFixed(4) : null,
      currentSpread: currentSpread !== null ? currentSpread.toFixed(4) : null,
      btcKimp: btcKimp !== null ? btcKimp.toFixed(4) : null,
    };

    Object.entries(currentValues).forEach(([key, value]) => {
      const previousValue = previousDashboardValuesRef.current[key];

      if (previousValue !== undefined && value !== null && previousValue !== value) {
        setDashboardFlashStates((prev) => ({ ...prev, [key]: true }));

        setTimeout(() => {
          setDashboardFlashStates((prev) => ({ ...prev, [key]: false }));
        }, 450);
      }

      previousDashboardValuesRef.current[key] = value;
    });
  }, [
    usdFuturesPrice,
    upbitUsdtTicker?.trade_price,
    usdtKimp,
    currentSpread,
    btcKimp,
  ]);

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

          setLastSavedAt(new Date(savedRow.created_at).toLocaleString('ko-KR'));
          return;
        }

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
      <div className="min-h-screen bg-gray-900 text-white p-3 space-y-4">
        <div className={`text-sm md:text-base font-bold mb-2 text-center transition duration-300 ${isFlashingUpdate ? 'text-yellow-400' : 'text-gray-300'}`}>
          실시간 업데이트: {lastUpdated || '로딩 중...'}
        </div>

        <div className="flex flex-col md:flex-row w-full max-w-[1280px] mx-auto justify-center items-stretch gap-3">
          <div className="w-full md:w-[580px] lg:w-[610px] flex-shrink-0">
            <div className="w-full h-full border border-gray-700 bg-gray-800/40 px-3 md:px-4 py-2">
              {[
                {
                  key: 'naverExchange',
                  label: 'Naver USD/KRW',
                  value: naverExchangeRate ? '₩' + naverExchangeRate.toLocaleString() : 'Loading...',
                  color: 'text-white',
                  dot: false,
                  labelColor: 'text-blue-400',
                },
                {
                  key: 'usdFutures',
                  label: 'Current USD Futures',
                  value: usdFuturesPrice ? '₩' + usdFuturesPrice.toLocaleString() : 'Loading...',
                  color: 'text-white',
                  dot: true,
                  labelColor: 'text-blue-400',
                },
                {
                  key: 'currentUsdt',
                  label: 'Current USDT',
                  value: upbitUsdtTicker ? '₩' + upbitUsdtTicker.trade_price.toLocaleString() : 'Loading...',
                  color: 'text-white',
                  dot: true,
                  labelColor: 'text-blue-400',
                  link: 'https://upbit.com/exchange?code=CRIX.UPBIT.KRW-USDT',
                },
                {
                  key: 'currentKimp',
                  label: 'Current Kimp',
                  value: usdtKimp !== null ? usdtKimp.toFixed(3) + '%' : '계산 중...',
                  color: usdtKimp !== null ? (usdtKimp >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-400',
                  dot: true,
                  labelColor: 'text-blue-400',
                },
                {
                  key: 'currentSpread',
                  label: 'Current Spread',
                  value: currentSpread !== null ? currentSpread.toFixed(2) : '계산 중...',
                  color: currentSpread !== null ? (currentSpread >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-400',
                  dot: true,
                  labelColor: 'text-blue-400',
                },
                {
                  key: 'btcDivide',
                  label: 'BTC FX Rate',
                  value: btcDivide !== null ? '₩' + btcDivide.toFixed(1) : 'Calculating...',
                  color: 'text-white',
                  dot: false,
                  labelColor: 'text-gray-200',
                },
                {
                  key: 'btcKimp',
                  label: 'BTC kimp',
                  value: btcKimp !== null ? btcKimp.toFixed(2) + '%' : '계산 중...',
                  color: btcKimp !== null ? (btcKimp >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-400',
                  dot: true,
                  labelColor: 'text-gray-200',
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="grid grid-cols-[165px_1fr] md:grid-cols-[230px_1fr] lg:grid-cols-[240px_1fr] items-center min-h-[38px] md:min-h-[44px] border-b border-gray-700 last:border-b-0"
                >
                  <div className={`text-[17px] md:text-[22px] lg:text-[24px] font-extrabold leading-none whitespace-nowrap ${item.labelColor}`}>
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {item.label}
                      </a>
                    ) : (
                      item.label
                    )}
                  </div>

                  <div className="flex items-center justify-end min-w-0">
                    <span
                      className={`${getDashboardValueClass(item.key, item.color)} block text-left w-[180px] text-[28px] md:text-[34px] lg:text-[36px] leading-none font-black tracking-tight tabular-nums`}
                    >
                      {item.value}
                    </span>
                    {item.dot ? renderFlashDot(item.key) : <span className="ml-2 inline-block h-2.5 w-2.5" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 justify-center items-stretch flex-shrink-0 w-full md:w-[560px] lg:w-[610px]">
            <a href="https://accounts.binance.com/register?ref=NJ3Y7YUZ" target="_blank" rel="noopener noreferrer" className="block w-full">
              <img src="/binance-banner2.png" alt="바이낸스 배너" className="w-full h-[110px] md:h-[160px] object-contain" />
            </a>

            <a href="https://www.bybit.com/invite?ref=OLVJA" target="_blank" rel="noopener noreferrer" className="block w-full">
              <img src="/bybit-banner2.png" alt="바이빗 배너" className="w-full h-[110px] md:h-[160px] object-contain" />
            </a>
          </div>
        </div>

        <div className="w-full max-w-[1280px] mx-auto bg-gray-800 border border-gray-700 rounded-xl p-3">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-2">
            <div>
              <h2 className="text-xl font-bold">USDT kimp</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                (USDT upbit ÷ KRX USD Futures - 1) × 100 DB based
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                status: {chartStatus} / save: {lastSavedAt}
              </p>

              <div className="flex flex-wrap gap-2 mt-2">
                {(['1m', '5m', '15m', '1h', '4h'] as IntervalKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedInterval(key);
                    }}
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
  onClick={() => loadHistory(selectedInterval)}
  className="px-3 py-1 rounded border border-gray-600 bg-gray-900 text-white text-sm"
>
  refresh
</button>
              </div>
            </div>

            <div className="text-right shrink-0 w-full md:w-[300px] overflow-visible">
              <div className="text-sm md:text-base text-gray-400"> USDT kimp</div>
              <div className="text-3xl md:text-[38px] font-black whitespace-nowrap leading-tight tabular-nums">
                <span
                  className={getDashboardValueClass(
                    'currentKimp',
                    usdtKimp !== null ? (usdtKimp >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-400'
                  )}
                >
                  {usdtKimp !== null ? usdtKimp.toFixed(3) + '%' : '계산 중...'}
                </span>
                {renderFlashDot('currentKimp')}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {intervalLabels[selectedInterval]} 차트 {displayedHistoryData.length}개
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                마지막 저장: {lastSavedAt}
              </div>
            </div>
          </div>

          <div ref={chartContainerRef} className="w-full h-[390px]" />
        </div>

        <h1 className="text-2xl font-bold mb-3 text-center">Real-Time Kimchi Premium</h1>

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
