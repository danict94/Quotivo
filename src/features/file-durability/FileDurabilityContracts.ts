export type OwnerFileKind = 'LOGO' | 'PDF' | 'DOCX';
export type OwnerFileAsset = Readonly<{
  id: string; kind: OwnerFileKind; assetKey: string; issuanceId: string | null;
  storagePath: string; mimeType: string; sizeBytes: number; sha256: string; createdAt: string;
}>;
export type LocalFileCandidate = Readonly<{
  kind: OwnerFileKind; assetKey: string; issuanceId: string | null; mimeType: string; localUri: string;
}>;
export interface FileDurabilityRemoteRepository {
  listManifest(): Promise<readonly OwnerFileAsset[]>;
  upload(candidate: LocalFileCandidate, bytes: Uint8Array): Promise<OwnerFileAsset>;
  download(assetId: string): Promise<Readonly<{ asset: OwnerFileAsset; bytes: Uint8Array }>>;
}
export interface FileDurabilityLocalRepository {
  applyManifest(assets: readonly OwnerFileAsset[]): Promise<void>;
  listLegacyCandidates(manifest: readonly OwnerFileAsset[]): Promise<readonly LocalFileCandidate[]>;
  markLegacyMissing(candidate: LocalFileCandidate): Promise<void>;
  markUploaded(asset: OwnerFileAsset, localUri: string): Promise<void>;
  logoNeedingRestore(): Promise<OwnerFileAsset | null>;
  saveDownloaded(asset: OwnerFileAsset, bytes: Uint8Array): Promise<string>;
  findCachedDocument(quoteId: string, kind: 'PDF' | 'DOCX'): Promise<string | null>;
  findRemoteDocument(quoteId: string, kind: 'PDF' | 'DOCX'): Promise<OwnerFileAsset | null>;
}
