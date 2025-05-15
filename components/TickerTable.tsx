import React from 'react';

interface TickerTableProps {
  data: any[];
}

export default function TickerTable({ data }: TickerTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th>코인</th>
          <th>변화율(24h)</th>
          <th>거래량</th>
          <th>Bithumb 가격</th>
          <th>Binance 가격</th>
          <th>김프(%)</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item.market}>
            <td>{item.market}</td>
            <td>{item.change_rate}%</td>
            <td>{item.acc_trade_price_24h}</td>
            <td>{item.bithumb_price}</td>
            <td>{item.binance_price}</td>
            <td>{item.kimp}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}