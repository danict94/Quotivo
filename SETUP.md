# Avvio locale

Questa è la base mobile offline-first di Quotivo.

```bash
cd quotivo-mobile
npm install
npx expo start
```

Poi apri il progetto con Expo Go scansionando il QR code, oppure usa `a` per Android, `i` per iOS e `w` per il web.

I preventivi e le relative voci sono salvati localmente in SQLite. Le bozze non hanno numero; il progressivo viene assegnato in modo transazionale soltanto alla finalizzazione. Un preventivo emesso è protetto da modifiche ed eliminazioni anche a livello database.

Per verificare i tipi:

```bash
npm run typecheck
```
