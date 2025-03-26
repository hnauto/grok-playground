import { handleGrokRequest } from "./handle_grok.js";

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  console.log('Request URL:', req.url);

  // 处理主页面
  const filePath = url.pathname;
  console.log('filePath:', filePath);
  
  if (filePath === '/' || filePath === '/index.html') {
    const fullPath = `${Deno.cwd()}/src/static/index.html`;
    const file = await Deno.readFile(fullPath);
    return new Response(file, {
      headers: {
        'content-type': `text/html;charset=UTF-8`,
      },
    });
  }

  if (filePath === '/how_to_get_cookie.png') {
    const fullPath = `${Deno.cwd()}/src/static/how_to_get_cookie.png`;
    const file = await Deno.readFile(fullPath);
    return new Response(file, {
      headers: {
        'content-type': 'image/png',
      },
    });
  }

  // 添加状态检查端点
  if (filePath === '/grok/api/status') {
    // 从环境变量获取所有COOKIE_*变量
    const envCookies = [];
    for (const [key, value] of Object.entries(Deno.env.toObject())) {
      if (key.startsWith('COOKIE_')) {
        envCookies.push(value);
      }
    }

    return new Response(JSON.stringify({
      cookieCount: envCookies.length,
      status: envCookies.length > 0 ? 'ready' : 'no_cookies',
      lastUpdated: new Date().toISOString()
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
    });
  }
  
  // 处理grok请求
  return handleGrokRequest(req);
}

Deno.serve({ port: 80 }, handleRequest);
