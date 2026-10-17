# Quotivo public gateway

Gateway Vercel isolato per le sole route pubbliche:

- `GET /p/:token`
- `POST /p/:token`
- `GET /p/:token/pdf`

Richiede esclusivamente la variabile server-side `QUOTIVO_PUBLIC_FUNCTION_URL`,
con l'URL della Edge Function `quote-public`. Non contiene credenziali,
layout, cookie o asset Esigenta.
