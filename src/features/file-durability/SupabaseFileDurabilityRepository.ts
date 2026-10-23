import { supabase } from '../../data/remote/supabaseClient';
import { FileDurabilityRemoteRepository, LocalFileCandidate, OwnerFileAsset, OwnerFileKind } from './FileDurabilityContracts';

const object = (value: unknown): Record<string, unknown> => { if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('FILE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value as Record<string, unknown>; };
const text = (value: unknown): string => { if (typeof value !== 'string' || !value) throw new Error('FILE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value; };
const nullableText = (value: unknown): string | null => { if (value !== null && typeof value !== 'string') throw new Error('FILE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value; };
const integer = (value: unknown): number => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('FILE_DURABILITY_REMOTE_RESPONSE_INVALID'); return value; };
function asset(value: unknown): OwnerFileAsset {
  const row = object(value); const kind = row.kind;
  if (kind !== 'LOGO' && kind !== 'PDF' && kind !== 'DOCX') throw new Error('FILE_DURABILITY_REMOTE_RESPONSE_INVALID');
  return { id:text(row.id), kind:kind as OwnerFileKind, assetKey:text(row.asset_key), issuanceId:nullableText(row.issuance_id), storagePath:text(row.storage_path), mimeType:text(row.mime_type), sizeBytes:integer(row.size_bytes), sha256:text(row.sha256), createdAt:text(row.created_at) };
}
const bytesToBase64 = (bytes: Uint8Array) => { let value=''; for (let offset=0;offset<bytes.length;offset+=0x8000) value += String.fromCharCode(...bytes.subarray(offset,offset+0x8000)); return btoa(value); };
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (item) => item.charCodeAt(0));
export class SupabaseFileDurabilityRepository implements FileDurabilityRemoteRepository {
  async listManifest(): Promise<readonly OwnerFileAsset[]> { const { data,error }=await supabase.rpc('get_owner_file_manifest'); if(error||!Array.isArray(data)) throw new Error(error?.message ?? 'FILE_DURABILITY_REMOTE_RESPONSE_INVALID'); return data.map(asset); }
  async upload(candidate: LocalFileCandidate, bytes: Uint8Array): Promise<OwnerFileAsset> { const { data,error }=await supabase.functions.invoke('owner-file-assets',{body:{action:'upload',kind:candidate.kind,issuanceId:candidate.issuanceId,mimeType:candidate.mimeType,base64:bytesToBase64(bytes)}}); if(error||!data?.asset) throw new Error(error?.message ?? data?.error ?? 'REMOTE_ERROR'); return asset(data.asset); }
  async download(assetId: string): Promise<Readonly<{asset:OwnerFileAsset;bytes:Uint8Array}>> { const {data,error}=await supabase.functions.invoke('owner-file-assets',{body:{action:'download',assetId}}); if(error||!data?.asset||typeof data.base64!=='string') throw new Error(error?.message ?? data?.error ?? 'REMOTE_ERROR'); return {asset:asset(data.asset),bytes:base64ToBytes(data.base64)}; }
}
