import { Readable } from "node:stream";

const tokenPattern = /^[A-Za-z0-9_-]{32,}$/;

function unavailable(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end("<!doctype html><html lang=\"it\"><meta charset=\"utf-8\"><title>Preventivo non disponibile</title><p>Preventivo non disponibile.</p>");
}

function publicFunctionUrl(token) {
  const origin = process.env.QUOTIVO_PUBLIC_FUNCTION_URL?.replace(/\/$/, "");
  return origin ? `${origin}/p/${encodeURIComponent(token)}` : null;
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(request, response) {
  const token = Array.isArray(request.query.token) ? request.query.token[0] : request.query.token;
  if (typeof token !== "string" || !tokenPattern.test(token)) return unavailable(response);

  const destination = publicFunctionUrl(token);
  if (!destination) {
    response.statusCode = 503;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end("<!doctype html><html lang=\"it\"><meta charset=\"utf-8\"><title>Servizio non disponibile</title><p>Servizio Quotivo temporaneamente non disponibile.</p>");
    return;
  }

  try {
    const method = request.method ?? "GET";
    const upstream = await fetch(destination, {
      method,
      headers: {
        Accept: request.headers.accept ?? "text/html",
        ...(request.headers["content-type"] ? { "Content-Type": request.headers["content-type"] } : {}),
      },
      body: method === "POST" ? await readRequestBody(request) : undefined,
      cache: "no-store",
    });

    response.statusCode = upstream.status;
    response.setHeader("Content-Type", method === "GET" ? "text/html; charset=utf-8" : (upstream.headers.get("content-type") ?? "application/json; charset=utf-8"));
    response.setHeader("Cache-Control", "no-store");
    if (!upstream.body) return response.end();
    Readable.fromWeb(upstream.body).pipe(response);
  } catch {
    response.statusCode = 503;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end("<!doctype html><html lang=\"it\"><meta charset=\"utf-8\"><title>Servizio non disponibile</title><p>Servizio Quotivo temporaneamente non disponibile.</p>");
  }
}
