/**
 * API proxy (Backend-for-Frontend đơn giản): trình duyệt chỉ gọi cùng origin
 * /api/<service>/..., server Next.js chuyển tiếp tới microservice tương ứng.
 * - Không cần cấu hình CORS ở từng service.
 * - Endpoint /internal/* của các service KHÔNG bao giờ được expose qua đây.
 */
const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || "http://localhost:8081",
  profile: process.env.PROFILE_SERVICE_URL || "http://localhost:8082",
  mentoring: process.env.MENTORING_SERVICE_URL || "http://localhost:8083",
  payment: process.env.PAYMENT_SERVICE_URL || "http://localhost:8084",
  learning: process.env.LEARNING_SERVICE_URL || "http://localhost:8085",
  matching: process.env.MATCHING_SERVICE_URL || "http://localhost:8090",
};

export const dynamic = "force-dynamic";

async function proxy(request, { params }) {
  const base = SERVICES[params.service];
  if (!base) {
    return Response.json({ error: { code: "NOT_FOUND", message: "Unknown service" } }, { status: 404 });
  }
  const url = new URL(request.url);
  const target = `${base}/api/${params.service}/${params.path.map(encodeURIComponent).join("/")}${url.search}`;

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = !["GET", "HEAD"].includes(request.method);
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "content-disposition"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
    return new Response(body, { status: upstream.status, headers: responseHeaders });
  } catch (e) {
    return Response.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: `Dịch vụ ${params.service} tạm thời không khả dụng` } },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
