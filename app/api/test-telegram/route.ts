import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const chatId = process.env.TELEGRAM_CHAT_ID!;

    const text = `✅ Kimpnow 텔레그램 테스트\n${new Date().toLocaleString('ko-KR')}`;

    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      }
    );

    const data = await res.json();

    return NextResponse.json({
      success: true,
      telegram: data,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: String(e),
    });
  }
}