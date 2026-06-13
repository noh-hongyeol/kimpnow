'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { createChart, LineSeries } from 'lightweight-charts';

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

export default function Home() {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const lineSeriesRef = useRef<any>(null);

  const [exchangeRate, setExchangeRate] = useState<number>(0);
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
  const [usdtKimpPointCount, setUsdtKimpPointCount] = useState<number>(0);

  useEffect(() => {
    if (lastUpdated) {
      setIsFlashingUpdate(true);
      const timer = setTimeout(() => setIsFlashingUpdate(false), 300);
      return () => clearTimeout(timer);
    }
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

  const fetchExchangeRate = async () => {
    const res = await axios.get('/api/exchange');
    setExchangeRate(res.data.rate);
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
    if (foreignPrice === null || !exchangeRate) return null;
    const usdToKrwPrice = foreignPrice * exchangeRate;
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

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      height: 420,
      autoSize: true,
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

    const loadHistory = async () => {
      const res = await fetch('/api/kimp-history');
      const json = await res.json();

      if (!json.success || !lineSeriesRef.current) return;

      const historyData = json.data
        .filter((row: any) => row.kimp !== null)
        .map((row: any) => ({
          time: Math.floor(new Date(row.created_at).getTime() / 1000),
          value: Number(Number(row.kimp).toFixed(4)),
        }));

      lineSeriesRef.current.setData(historyData);
      setUsdtKimpPointCount(historyData.length);
    };

    loadHistory();

    const handleResize = () => {
      if (!chartContainerRef.current) return;
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
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
    const fetchAll = async () => {
      await Promise.all([
        fetchExchangeRate(),
        fetchUpbitTickers(),
        fetchBithumbTickers(),
        fetchBinanceTickers(),
        fetchBybitTickers(),
      ]);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000);
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
    upbitUsdtTicker && exchangeRate
      ? ((upbitUsdtTicker.trade_price / exchangeRate) - 1) * 100
      : null;

  useEffect(() => {
    if (usdtKimp === null || !lineSeriesRef.current || !chartRef.current) return;

    const point = {
      time: Math.floor(Date.now() / 1000),
      value: Number(usdtKimp.toFixed(4)),
    };

    lineSeriesRef.current.update(point);
  }, [usdtKimp]);

  return (
    <>
      <div className="min-h-screen bg-gray-900 text-white p-4 space-y-8">
        <div className={`text-lg font-bold mb-4 text-center transition duration-300 ${isFlashingUpdate ? 'text-yellow-400' : 'text-gray-300'}`}>
          실시간 업데이트: {lastUpdated || '로딩 중...'}
        </div>

        <div className="flex flex-col md:flex-row w-full justify-center md:space-x-4 space-y-4 md:space-y-0">
          <div>
            <table className="w-full border border-gray-700 text-xs md:text-sm leading-none">
              <thead>
                <tr className="bg-gray-800">
                  <th className="p-2">구분</th>
                  <th className="p-2">현재값</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td className="p-2">
                    <a
                      href="https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      원달러 환율
                    </a>
                  </td>
                  <td className="p-2">
                    {exchangeRate ? exchangeRate.toLocaleString() + ' 원' : '로딩 중...'}
                  </td>
                </tr>

                <tr>
                  <td className="p-2">
                    <a
                      href="https://upbit.com/exchange?code=CRIX.UPBIT.KRW-USDT"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      업비트 USDT
                    </a>
                  </td>
                  <td className="p-2">
                    {upbitUsdtTicker ? upbitUsdtTicker.trade_price.toLocaleString() + ' 원' : '로딩 중...'}
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-bold">업비트 BTC ÷ 해외 BTC</td>
                  <td className="p-2">
                    {btcDivide !== null ? btcDivide.toFixed(1) + ' 원' : '계산 중...'}
                  </td>
                </tr>

                <tr>
                  <td className="p-2">
                    <a
                      href="https://upbit.com/exchange?code=CRIX.UPBIT.KRW-BTC"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      업비트 BTC
                    </a>
                  </td>
                  <td className="p-2">
                    {btcTicker ? btcTicker.trade_price.toLocaleString() + ' 원' : '로딩 중...'}
                  </td>
                </tr>

                <tr>
                  <td className="p-2">
                    <a
                      href={foreignExchange === 'Binance'
                        ? 'https://accounts.binance.com/register?ref=NJ3Y7YUZ'
                        : 'https://www.bybit.com/invite?ref=OLVJA'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {foreignExchange} BTC
                    </a>
                  </td>
                  <td className="p-2">
                    {btcForeignPrice !== null ? btcForeignPrice.toLocaleString() + ' USDT' : '로딩 중...'}
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-bold">현재 BTC 김프</td>
                  <td className={`p-2 font-bold ${btcKimp !== null ? (btcKimp >= 0 ? 'text-red-500' : 'text-blue-500') : ''}`}>
                    {btcKimp !== null ? btcKimp.toFixed(2) + '%' : '계산 중...'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-center items-center w-auto flex-shrink-0">
            <a href="https://accounts.binance.com/register?ref=NJ3Y7YUZ" target="_blank" rel="noopener noreferrer">
              <img src="/binance-banner2.png" alt="바이낸스 배너" className="w-[400px] h-[112px] object-contain" />
            </a>
          </div>

          <div className="flex justify-center items-center w-auto flex-shrink-0">
            <a href="https://www.bybit.com/invite?ref=OLVJA" target="_blank" rel="noopener noreferrer">
              <img src="/bybit-banner2.png" alt="바이빗 배너" className="w-[400px] h-[112px] object-contain" />
            </a>
          </div>
        </div>

        <div className="w-full max-w-6xl mx-auto bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-2xl font-bold">USDT 김프 차트</h2>
              <p className="text-sm text-gray-400 mt-1">
                업비트 USDT ÷ 원달러 환율 기준, DB 저장 데이터 기반
              </p>
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-400">현재 USDT 김프</div>
              <div className={`text-3xl font-bold ${usdtKimp !== null ? (usdtKimp >= 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-400'}`}>
                {usdtKimp !== null ? usdtKimp.toFixed(3) + '%' : '계산 중...'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                저장 데이터 {usdtKimpPointCount}개
              </div>
            </div>
          </div>

          <div ref={chartContainerRef} className="w-full h-[420px]" />
        </div>

        <h1 className="text-4xl font-bold mb-6 text-center">김프 실시간</h1>

        <div className="mb-2 text-center space-x-4">
          <label className="font-semibold">국내 거래소:</label>
          <select
            value={domesticExchange}
            onChange={(e) => setDomesticExchange(e.target.value as 'Upbit' | 'Bithumb')}
            className="border rounded p-1 text-black"
          >
            <option value="Upbit">업비트</option>
            <option value="Bithumb">빗썸</option>
          </select>

          <label className="font-semibold ml-4">해외 거래소:</label>
          <select
            value={foreignExchange}
            onChange={(e) => setForeignExchange(e.target.value as 'Binance' | 'Bybit')}
            className="border rounded p-1 text-black"
          >
            <option value="Binance">바이낸스</option>
            <option value="Bybit">바이빗</option>
          </select>
        </div>

        <div className="w-full max-w-5xl mx-auto">
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-700 text-sm md:text-sm text-xs leading-tight">
              <thead>
                <tr className="bg-gray-800">
                  <th className="md:p-2 p-1 text-left cursor-pointer" onClick={() => handleSort('market')}>
                    코인 {renderSortArrow('market')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('change_rate')}>
                    변화율(24h) {renderSortArrow('change_rate')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('acc_trade_price_24h')}>
                    거래량 {renderSortArrow('acc_trade_price_24h')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('trade_price')}>
                    {domesticExchange} 가격 {renderSortArrow('trade_price')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('foreign_price')}>
                    {foreignExchange} 가격 {renderSortArrow('foreign_price')}
                  </th>
                  <th className="md:p-2 p-1 text-right cursor-pointer" onClick={() => handleSort('kimp')}>
                    김프(%) {renderSortArrow('kimp')}
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
            <div>1KduhEEivZiDGukjb1GuMTigiAPUdBKwQd</div>
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