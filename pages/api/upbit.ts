import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { markets } = req.query;
  if (!markets) return res.status(400).json({ error: 'Missing markets param' });

  try {
    const response = await axios.get('https://api.upbit.com/v1/ticker', {
      params: { markets },
    });
    res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Upbit API Error:', error.message);
    res.status(500).json({ error: 'Upbit Internal Server Error' });
  }
}