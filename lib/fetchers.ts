import axios from 'axios';

export const fetchBithumb = async () => {
  const res = await axios.get('/api/bithumb');
  return res.data;
};

export const fetchBinance = async () => {
  const res = await axios.get('/api/binance');
  return res.data;
};

export const fetchUpbit = async (markets: string) => {
  const res = await axios.get('/api/upbit', { params: { markets } });
  return res.data;
};