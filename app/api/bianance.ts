import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/price');
    const tickers = response.data.filter((item: any) => item.symbol.endsWith('USDT'));
    res.status(200).json(tickers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch Binance data' });
  }
}
