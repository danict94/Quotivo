import { Readable } from "node:stream";

const tokenPattern = /^[A-Za-z0-9_-]{32,}$/;

export default async function handler(request, response) {
  const token = Array.isArray(request.query.token) ? request.query.token[0] : request.query.token;
  const origin = process.env.QUOTIVO_PUBLIC_FUNCTION_URL?.replace(/\/$/, "");
  if (typeof token !== "string" || !tokenPattern.test(token) || !origin) {
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end("<!doctype html><html lang=\"it\"><meta charset=\"utf-8\"><title>Preventivo non disponibile</title><p>Preventivo non disponibile.</p>");
    return;
  }

  try {
    const upstream = await fetch(`${origin}/p/${encodeURIComponent(token)}/pdf`, { cache: "no-store" });
    response.statusCode = upstream.status;
    response.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/pdf");
    response.setHeader("Content-Disposition", upstream.headers.get("content-disposition") ?? "inline");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!upstream.body) return response.end();
    Readable.fromWeb(upstream.body).pipe(response);
  } catch {
    response.statusCode = 503;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end("<!doctype html><html lang=\"it\"><meta charset=\"utf-8\"><title>Servizio non disponibile</title><p>Servizio Quotivo temporaneamente non disponibile.</p>");
  }
}
