import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const response = await axios.get('https://api.bithumb.com/public/ticker/ALL_KRW');
    res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Bithumb API Error:', error.message);
    res.status(500).json({ error: 'Bithumb Internal Server Error' });
  }
}