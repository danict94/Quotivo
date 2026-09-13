import { validateLogoBytes } from './logoValidation';

export type SelectedLogoAsset = { uri: string; mimeType?: string | null; name: string };
export type ImportedLogo = { uri: string; mimeType: string; originalName: string };

export interface LogoImportGateway {
  createTemporaryUri(): string;
  copyIntoPrivateCache(sourceUri: string, temporaryUri: string): Promise<void>;
  readPrivateBytes(temporaryUri: string): Promise<Uint8Array>;
  copyIntoPersistentStorage(temporaryUri: string, mimeType: string): Promise<string>;
  removeTemporaryFile(temporaryUri: string): Promise<void>;
}

export async function runStagingStrategies(strategies: Array<{ label: string; run: () => Promise<void> }>, cleanup: () => Promise<void>) {
  const failures: string[] = [];
  for (const strategy of strategies) {
    try {
      await strategy.run();
      return;
    } catch (error) {
      failures.push(`${strategy.label}: ${error instanceof Error ? error.message : String(error)}`);
      await cleanup().catch(() => undefined);
    }
  }
  throw new Error(failures.join(' | '));
}

export async function importLogoAsset(asset: SelectedLogoAsset, gateway: LogoImportGateway): Promise<ImportedLogo> {
  if (!asset.uri) throw new Error('Il file selezionato non ha un indirizzo leggibile.');
  const temporaryUri = gateway.createTemporaryUri();
  try {
    try {
      await gateway.copyIntoPrivateCache(asset.uri, temporaryUri);
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : '';
      throw new Error(`Non è stato possibile copiare il logo nell’area privata dell’app${detail}. Prova a selezionare un altro file.`);
    }

    let bytes: Uint8Array;
    try {
      bytes = await gateway.readPrivateBytes(temporaryUri);
    } catch {
      throw new Error('La copia locale del logo non è leggibile. Prova a selezionare nuovamente il file.');
    }
    const mimeType = validateLogoBytes(bytes, asset.mimeType);

    try {
      const uri = await gateway.copyIntoPersistentStorage(temporaryUri, mimeType);
      return { uri, mimeType, originalName: asset.name };
    } catch {
      throw new Error('Il logo è valido ma non è stato possibile salvarlo in modo permanente.');
    }
  } finally {
    // La rimozione è best effort: non deve nascondere l'esito reale dell'importazione.
    await gateway.removeTemporaryFile(temporaryUri).catch(() => undefined);
  }
}
