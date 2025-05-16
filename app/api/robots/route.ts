// app/api/robots/route.ts
export async function GET() {
    const content = `
  User-agent: *
  Allow: /
  Sitemap: https://kimpnow.com/sitemap-0.xml
    `.trim();
  
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
  