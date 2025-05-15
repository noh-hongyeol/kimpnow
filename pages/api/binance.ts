import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/price');
    res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Binance API Error:', error.message);
    res.status(500).json({ error: 'Binance Internal Server Error' });
  }
}