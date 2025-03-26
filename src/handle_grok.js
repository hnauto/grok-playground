const DOMAIN_URL = "https://grok.com";
const ASSETS_URL = "https://assets.grok.com";

export async function handleGrokRequest(req) {
    const url = new URL(req.url);
    console.log('Request URL:', req.url);
    
    // 1. 从环境变量获取所有COOKIE_*变量
    const envCookies = [];
    for (const [key, value] of Object.entries(Deno.env.toObject())) {
        if (key.startsWith('COOKIE_')) {
            envCookies.push(value);
        }
    }

    // 2. 确定目标路径和域名
    let targetPath;
    let domainUrl = DOMAIN_URL;
    if (url.pathname.startsWith('/grok')) {
        targetPath = url.pathname.replace(/^\/grok/, '');
    } else if (url.pathname.startsWith('/assets')) {
        targetPath = url.pathname.replace(/^\/assets/, '');
        domainUrl = ASSETS_URL;
    } else {
        targetPath = url.pathname;
    }
    
    const targetFullUrl = new URL(targetPath + url.search, domainUrl);
    console.log('Target URL:', targetFullUrl.toString());

    // 3. 准备请求头
    const headers = new Headers(req.headers);
    headers.set("Host", targetFullUrl.host);

    // 4. Cookie处理逻辑（优先级：环境变量 > 请求cookie）
    let grokCookie = '';
    
    // 4.1 优先使用环境变量中的随机cookie
    if (envCookies.length > 0) {
        grokCookie = envCookies[Math.floor(Math.random() * envCookies.length)];
        console.log('Using random cookie from env');
    } 
    // 4.2 没有环境变量cookie时，尝试从请求中获取
    else {
        const cookieHeader = req.headers.get('cookie');
        if (cookieHeader) {
            const cookies = cookieHeader.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'grok_cookie') {
                    grokCookie = decodeURIComponent(value);
                    break;
                }
            }
        }
    }

    // 4.3 设置最终使用的cookie
    if (grokCookie) {
        headers.set("cookie", grokCookie);
    } else {
        headers.delete("cookie");
    }

    // 5. 安全头处理
    headers.delete("Referer");
    const sensitiveHeaders = [
        'CF-Connecting-IP',
        'X-Forwarded-For',
        'X-Real-IP',
        'True-Client-IP',
        'x-vercel-deployment-url',
        'x-vercel-forwarded-for',
        'x-forwarded-host',
        'x-forwarded-port',
        'x-forwarded-proto',
        'x-vercel-id',
        'origin',
        'baggage'
    ];
    sensitiveHeaders.forEach(header => headers.delete(header));

    // 6. 发起代理请求
    try {
        const fetchResponse = await fetch(targetFullUrl.toString(), {
            method: req.method,
            headers,
            body: req.body,
            redirect: "manual",
        });

        const responseHeaders = new Headers(fetchResponse.headers);
        responseHeaders.delete("Content-Length");

        // 7. 响应内容处理
        const textTransformStream = new TransformStream({
            transform: (chunk, controller) => {
                const contentType = responseHeaders.get("Content-Type") || "";
                if (contentType.startsWith("text/") || contentType.includes("json")) {
                    let decodedText = new TextDecoder("utf-8").decode(chunk);

                    // HTML内容替换资源路径
                    if (contentType.includes("text/html")) {
                        const serverOrigin = new URL(req.url).origin;
                        decodedText = decodedText.replaceAll(ASSETS_URL, serverOrigin);
                    }
                    
                    // JSON内容处理图片路径
                    if (contentType.includes("json") && 
                        (decodedText.includes("streamingImageGenerationResponse") || 
                        decodedText.includes("generatedImageUrls"))) {
                            decodedText = decodedText.replaceAll('users/', 'assets/users/');
                    }
                    
                    controller.enqueue(new TextEncoder().encode(decodedText));
                } else {
                    controller.enqueue(chunk);
                }
            }
        });

        const transformedStream = fetchResponse.body?.pipeThrough(textTransformStream);

        return new Response(transformedStream, {
            status: fetchResponse.status,
            headers: responseHeaders,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Proxy Error:', errorMessage);
        return new Response(`Proxy Error: ${errorMessage}`, { status: 500 });
    }
}
