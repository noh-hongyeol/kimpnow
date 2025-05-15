import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function GET() {
  try {
    const response = await axios.get('https://finance.naver.com/marketindex/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    const rateText = $('#exchangeList > li.on > a.head > div > span.value').first().text().trim();
    const rate = parseFloat(rateText.replace(',', ''));

    

    return NextResponse.json({ rate: isNaN(rate) ? null : rate });
  } catch (error) {
    console.error('네이버 환율 크롤링 실패:', error);
    return NextResponse.json({ rate: null }, { status: 500 });
  }
}
