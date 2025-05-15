'use client';

import { useEffect, useState } from 'react';
import { fetchBithumb, fetchBinance, fetchUpbit } from '../lib/fetchers';
import TickerTable from '../components/TickerTable';

export default function Home() {
  const [bithumbData, setBithumbData] = useState<any>(null);
  const [binanceData, setBinanceData] = useState<any[]>([]);
  const [upbitData, setUpbitData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [bithumb, binance, upbit] = await Promise.all([
          fetchBithumb(),
          fetchBinance(),
          fetchUpbit('KRW-BTC,KRW-ETH,KRW-XRP')
        ]);

        setBithumbData(bithumb.data);
        setBinanceData(binance);
        setUpbitData(upbit);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      }
    };

    loadData();
  }, []);

  if (error) return <div>에러 발생: {error}</div>;
  if (!bithumbData || !binanceData.length || !upbitData.length) return <div>로딩 중...</div>;

  const mergedData = upbitData.map((upbitItem) => {
    const binanceItem = binanceData.find((b) => b.symbol === upbitItem.market.replace('KRW-', '') + 'USDT');
    const bithumbPrice = bithumbData[upbitItem.market.replace('KRW-', '')]?.closing_price;

    const kimp = binanceItem
      ? (((upbitItem.trade_price / (parseFloat(binanceItem.price) * 1399)) - 1) * 100).toFixed(2)
      : null;

    return {
      market: upbitItem.market,
      change_rate: (upbitItem.signed_change_rate * 100).toFixed(2),
      acc_trade_price_24h: upbitItem.acc_trade_price_24h.toLocaleString(),
      bithumb_price: bithumbPrice ? parseFloat(bithumbPrice).toLocaleString() : '-',
      binance_price: binanceItem ? parseFloat(binanceItem.price).toLocaleString() : '-',
      kimp: kimp ?? '-',
    };
  });

  return (
    <div>
      <h1>김프 실시간</h1>
      <TickerTable data={mergedData} />
    </div>
  );
}