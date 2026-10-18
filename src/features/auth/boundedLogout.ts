const logoutTimeoutMs = 8_000;

export class LogoutTimeoutError extends Error {
  constructor() {
    super('LOGOUT_TIMEOUT');
    this.name = 'LogoutTimeoutError';
  }
}

export async function performBoundedLogout(input: {
  remoteSignOut: () => Promise<void>;
  closeLocalDatabase: () => Promise<void>;
  timeoutMs?: number;
}) {
  const timeoutMs = input.timeoutMs ?? logoutTimeoutMs;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      input.remoteSignOut(),
      new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new LogoutTimeoutError()), timeoutMs); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  await input.closeLocalDatabase();
}

export function createSingleFlightLogout(runLogout: () => Promise<void>) {
  let inFlight: Promise<void> | null = null;
  return () => {
    if (inFlight) return inFlight;
    const operation = runLogout().finally(() => { if (inFlight === operation) inFlight = null; });
    inFlight = operation;
    return operation;
  };
}

export function logoutUserMessage(error: unknown) {
  if (error instanceof LogoutTimeoutError) return 'La disconnessione sta impiegando troppo tempo. Controlla la connessione e riprova.';
  return 'La disconnessione non è riuscita. Controlla la connessione e riprova. I dati locali restano sul dispositivo.';
}
