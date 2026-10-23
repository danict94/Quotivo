import { FileDurabilityLocalRepository, FileDurabilityRemoteRepository, OwnerFileAsset } from './FileDurabilityContracts';

/** Pull first, then upload only unrepresented legacy files. No local URI is authority. */
export class FileDurabilitySyncService {
  constructor(private readonly local: FileDurabilityLocalRepository, private readonly remote: FileDurabilityRemoteRepository) {}
  async sync(): Promise<void> {
    const manifest = await this.remote.listManifest();
    await this.local.applyManifest(manifest);
    const logo = await this.local.logoNeedingRestore();
    if (logo) await this.download(logo);
    for (const candidate of await this.local.listLegacyCandidates(manifest)) {
      try { await this.local.markUploaded(await this.remote.upload(candidate, await this.read(candidate.localUri)), candidate.localUri); }
      catch (error) { if (error instanceof Error && error.message === 'LOCAL_FILE_MISSING') await this.local.markLegacyMissing(candidate); else throw error; }
    }
  }
  async download(asset: OwnerFileAsset): Promise<string> { const result = await this.remote.download(asset.id); return this.local.saveDownloaded(result.asset, result.bytes); }
  async ensureDocument(quoteId: string, kind: 'PDF' | 'DOCX'): Promise<string | null> {
    const cached = await this.local.findCachedDocument(quoteId, kind); if (cached) return cached;
    const remote = await this.local.findRemoteDocument(quoteId, kind); return remote ? this.download(remote) : null;
  }
  private async read(uri: string): Promise<Uint8Array> {
    // Dynamic import keeps the domain contract executable in node tests.
    const { File } = await import('expo-file-system'); const file = new File(uri);
    if (!file.exists) throw new Error('LOCAL_FILE_MISSING'); return file.bytes();
  }
}
