'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

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

export default function Home() {
  
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [upbitTickers, setUpbitTickers] = useState<TickerData[]>([]);
  const [isFlashingUpdate, setIsFlashingUpdate] = useState(false);
  const [bithumbTickers, setBithumbTickers] = useState<TickerData[]>([]);
  const [binanceTickers, setBinanceTickers] = useState<BinanceTickerData[]>([]);
  const [baseExchange, setBaseExchange] = useState<'Upbit' | 'Bithumb'>('Upbit');
  const [sortKey, setSortKey] = useState<'market' | 'change_rate' | 'acc_trade_price_24h' | 'trade_price' | 'binance_price' | 'kimp'>('acc_trade_price_24h');


  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [flashStates, setFlashStates] = useState<Record<string, boolean>>({});
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
      const datePart = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const timePart = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastUpdated(`${datePart} ${timePart}`);
    };
  
    updateTimestamp(); // 첫 업데이트
    const interval = setInterval(updateTimestamp, 5000);
  
    return () => clearInterval(interval);
  }, []);
  
  

  const triggerFlashOnChange = (prev: any[], next: any[]) => {
    const newFlashStates = { ...flashStates };

    next.forEach(item => {
      const key = item.market || item.symbol;
      const prevItem = prev.find(p => (p.market || p.symbol) === key);

      if (prevItem && JSON.stringify(prevItem) !== JSON.stringify(item)) {
        newFlashStates[key] = true;
        setTimeout(() => {
          setFlashStates(s => ({ ...s, [key]: false }));
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

    const krwMarkets = marketsRes.data.filter((m: any) => m.market.startsWith('KRW-')).map((m: any) => m.market);

    const tickersRes = await axios.get('https://api.upbit.com/v1/ticker', {
      params: { markets: krwMarkets.join(',') },
    });

    const tickers = tickersRes.data.map((item: any) => ({
      market: item.market,
      trade_price: item.trade_price,
      acc_trade_price_24h: item.acc_trade_price_24h,
      change_rate: item.signed_change_rate * 100, // % 변환
    }));
    setUpbitTickers(prev => triggerFlashOnChange(prev, tickers));
    
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


    
    setBithumbTickers(prev => triggerFlashOnChange(prev, tickers));
    
  };

  const fetchBinanceTickers = async () => {
    const res = await axios.get('/api/binance');
    setBinanceTickers(prev => triggerFlashOnChange(prev, res.data));
  };

  const calculateKimp = (krwPrice: number, binancePrice: number | null): number | null => {
    if (binancePrice === null || exchangeRate === null) return null;
    const usdToKrwPrice = binancePrice * exchangeRate;
    return ((krwPrice - usdToKrwPrice) / usdToKrwPrice) * 100;
  };

  const getBinancePrice = (symbol: string): number | null => {
    const symbolName = symbol.replace('KRW-', '') + 'USDT';
    const ticker = binanceTickers.find(t => t.symbol === symbolName);
    return ticker ? parseFloat(ticker.price) : null;
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
    return `${(value / 100000000).toFixed(2)}억`;
  };

  useEffect(() => {
    const fetchAll = async () => {
      await Promise.all([fetchExchangeRate(), fetchUpbitTickers(), fetchBithumbTickers(), fetchBinanceTickers()]);
    };
  
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);
  

  const tickers = baseExchange === 'Upbit' ? upbitTickers : bithumbTickers;

  const sortedTickers = tickers.map(ticker => {
    const bPrice = getBinancePrice(ticker.market);
    const kimp = bPrice !== null ? calculateKimp(ticker.trade_price, bPrice) : null;
    return {
      ...ticker,
      binance_price: bPrice,
      kimp: kimp,
    };
  }).sort((a, b) => {
    const order = sortOrder === 'asc' ? 1 : -1;
    if (sortKey === 'market') {
      return a.market.localeCompare(b.market) * order;
    }
    const aValue = a[sortKey] ?? -Infinity;
    const bValue = b[sortKey] ?? -Infinity;
    return (aValue - bValue) * order;
  });
  

  const btcTicker = tickers.find(t => t.market === 'KRW-BTC');
  const btcBinancePrice = getBinancePrice('KRW-BTC');
  const btcKimp = btcTicker && btcBinancePrice !== null ? calculateKimp(btcTicker.trade_price, btcBinancePrice) : null;

  return (
    <>
      <div className="min-h-screen bg-gray-900 text-white p-4 space-y-8">
      <div className={`text-lg font-bold mb-4 text-center transition duration-00 ${isFlashingUpdate ? 'text-yellow-400' : 'text-gray-300'}`}>
  실시간 업데이트: {lastUpdated || '로딩 중...'}
</div>






<div className="flex flex-col md:flex-row w-full justify-center md:space-x-4 space-y-4 md:space-y-0">

          <div>
            <table className="w-full border border-gray-700 text-sm leading-tight">
              <thead>
                <tr className="bg-gray-800">
                  <th className="p-2">구분</th>
                  <th className="p-2">현재값</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2">네이버 고시환율</td>
                  <td className="p-2">{exchangeRate !== null ? exchangeRate.toLocaleString() + ' 원' : '로딩 중...'}</td>
                </tr>
                <tr>
                  <td className="p-2">{baseExchange} BTC</td>
                  <td className="p-2">{btcTicker ? btcTicker.trade_price.toLocaleString() + ' 원' : '로딩 중...'}</td>
                </tr>
                <tr>
                  <td className="p-2">바이낸스 BTC</td>
                  <td className="p-2">{btcBinancePrice !== null ? btcBinancePrice.toLocaleString() + ' USDT' : '로딩 중...'}</td>
                </tr>
                <tr>
                  <td className="p-2 font-bold">현재 김프</td>
                  <td className={`p-2 font-bold ${btcKimp !== null ? (btcKimp >= 0 ? 'text-red-500' : 'text-blue-500') : ''}`}>
                    {btcKimp !== null ? btcKimp.toFixed(2) + '%' : '계산 중...'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-center items-center">
            <a href="https://accounts.binance.com/register?ref=NJ3Y7YUZ" target="_blank" rel="noopener noreferrer">
              <img src="/binance-banner.png" alt="바이낸스 배너" className="h-[200px] object-contain" />
            </a>
          </div>

          <div className="flex justify-center items-center">
            <a href="https://www.bybit.com/invite?ref=OLVJA" target="_blank" rel="noopener noreferrer">
              <img src="/bybit-banner.png" alt="바이빗 배너" className="h-[200px] object-contain" />
            </a>
          </div>
        </div>
        
        <h1 className="text-4xl font-bold mb-6 text-center">김프 실시간</h1>
        <div className="mb-2 text-center">
        <label className="mr-2 font-semibold">기준 거래소:</label>
          <select
            value={baseExchange}
            onChange={(e) => setBaseExchange(e.target.value as 'Upbit' | 'Bithumb')}
            className="border rounded p-1 text-black"
          >
            <option value="Upbit">업비트</option>
            <option value="Bithumb">빗썸</option>
          </select>
        </div>

        <div className="w-full max-w-5xl mx-auto">
          <table className="w-full border border-gray-700 text-sm leading-tight">
            <thead>
              <tr className="bg-gray-800">
              <th className="p-2 cursor-pointer" onClick={() => handleSort('market')}>
  코인 {renderSortArrow('market')}
</th>
<th className="p-2 cursor-pointer" onClick={() => handleSort('change_rate')}>
  변화율(24h) {renderSortArrow('change_rate')}
</th>

                <th className="p-2 cursor-pointer" onClick={() => handleSort('acc_trade_price_24h')}>거래량 {renderSortArrow('acc_trade_price_24h')}</th>
                <th className="p-2 cursor-pointer" onClick={() => handleSort('trade_price')}>{baseExchange} 가격 {renderSortArrow('trade_price')}</th>
                <th className="p-2 cursor-pointer" onClick={() => handleSort('binance_price')}>Binance 가격 {renderSortArrow('binance_price')}</th>
                <th className="p-2 cursor-pointer" onClick={() => handleSort('kimp')}>김프(%) {renderSortArrow('kimp')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTickers.map(ticker => {
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
  <span>{ticker.market.replace('KRW-', '')}</span>
</td>
<td className={`p-2 text-right ${ticker.change_rate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
  {typeof ticker.change_rate === 'number' ? ticker.change_rate.toFixed(2) + '%' : 'N/A'}
</td>


                    <td className="p-2 text-right">{formatToEok(ticker.acc_trade_price_24h)}</td>
                    
                    <td className="p-2 text-right">
  <span className={flashClass}>
    {ticker.trade_price.toLocaleString() + ' ₩'}
  </span>
</td>
<td className="p-2 text-right">
  <span className={flashClass}>
    {ticker.binance_price !== null ? ticker.binance_price.toFixed(2) + ' $' : 'N/A'}
  </span>
</td>

                    <td className="p-2 text-right">
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
        <p>※ 문의 e18901@gmail.com </p>
      </footer>
    </>
  );
}
