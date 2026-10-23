import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { FileDurabilityLocalRepository, FileDurabilityRemoteRepository, LocalFileCandidate, OwnerFileAsset } from '../src/features/file-durability/FileDurabilityContracts';
import { FileDurabilitySyncService } from '../src/features/file-durability/FileDurabilitySyncService';

const logo = (): OwnerFileAsset => ({ id:'logo-1',kind:'LOGO',assetKey:'business-logo',issuanceId:null,storagePath:'owner/logo/business-logo',mimeType:'image/png',sizeBytes:3,sha256:'a'.repeat(64),createdAt:'2026-10-24T10:00:00.000Z' });
const pdf = (): OwnerFileAsset => ({ id:'pdf-1',kind:'PDF',assetKey:'issuance:issuance-1:pdf',issuanceId:'issuance-1',storagePath:'owner/issuances/issuance-1/pdf',mimeType:'application/pdf',sizeBytes:5,sha256:'b'.repeat(64),createdAt:'2026-10-24T10:00:00.000Z' });
class Local implements FileDurabilityLocalRepository {
  manifests: readonly OwnerFileAsset[]=[]; uploaded:OwnerFileAsset[]=[]; downloaded:OwnerFileAsset[]=[]; missing:LocalFileCandidate[]=[]; cached:string|null=null; remote:OwnerFileAsset|null=null;
  async applyManifest(values:readonly OwnerFileAsset[]){this.manifests=values;}
  async listLegacyCandidates(){return [];}
  async markLegacyMissing(value:LocalFileCandidate){this.missing.push(value);}
  async markUploaded(value:OwnerFileAsset){this.uploaded.push(value);}
  async logoNeedingRestore(){return null;}
  async saveDownloaded(value:OwnerFileAsset){this.downloaded.push(value);return `file://${value.id}`;}
  async findCachedDocument(){return this.cached;}
  async findRemoteDocument(){return this.remote;}
}
class Remote implements FileDurabilityRemoteRepository {
  downloads=0; uploads=0;
  constructor(private readonly manifest:readonly OwnerFileAsset[]){ }
  async listManifest(){return this.manifest;}
  async upload(candidate:LocalFileCandidate){this.uploads++;return {...pdf(),kind:candidate.kind,assetKey:candidate.assetKey,issuanceId:candidate.issuanceId,mimeType:candidate.mimeType};}
  async download(assetId:string){this.downloads++;const asset=this.manifest.find((value)=>value.id===assetId);if(!asset)throw new Error('NOT_FOUND');return {asset,bytes:new Uint8Array([1,2,3])};}
}

test('new SQLite projection pulls private manifest and restores a remote PDF on demand',async()=>{
  const local=new Local();local.remote=pdf();const remote=new Remote([logo(),pdf()]);const service=new FileDurabilitySyncService(local,remote);
  await service.sync();assert.deepEqual(local.manifests,[logo(),pdf()]);
  assert.equal(await service.ensureDocument('quote-1','PDF'),'file://pdf-1');assert.equal(remote.downloads,1);assert.equal(local.downloaded[0]?.id,'pdf-1');
});
test('offline cached document remains usable without a remote request',async()=>{
  const local=new Local();local.cached='file://cached.pdf';const remote=new Remote([]);const service=new FileDurabilitySyncService(local,remote);
  assert.equal(await service.ensureDocument('quote-1','PDF'),'file://cached.pdf');assert.equal(remote.downloads,0);
});
test('uncached offline document reports no local URI instead of fabricating a file',async()=>{
  const local=new Local();const remote=new Remote([]);assert.equal(await new FileDurabilitySyncService(local,remote).ensureDocument('quote-1','DOCX'),null);
});
test('file durability migration has private manifest, deterministic paths and no client writes',async()=>{
  const sql=await readFile(path.join(process.cwd(),'supabase','migrations','20261024004000_owner_file_durability.sql'),'utf8');
  assert.match(sql,/quotivo-owner-assets.*false/i);assert.match(sql,/owner_file_assets/);assert.match(sql,/unique \(owner_user_id, asset_key\)/);assert.match(sql,/owner_user_id = auth\.uid\(\)/);assert.match(sql,/revoke all on public\.owner_file_assets from public, anon, authenticated/i);assert.match(sql,/revoke all on function public\.owner_file_asset_row/i);assert.match(sql,/grant execute on function public\.get_owner_file_manifest\(\).*authenticated/i);assert.match(sql,/OWNER_FILE_ASSET_CONFLICT/);
});
test('logo has a controlled new-version path while issued documents remain immutable',async()=>{
  const sql=await readFile(path.join(process.cwd(),'supabase','migrations','20261024005000_allow_logo_asset_version_update.sql'),'utf8');
  assert.match(sql,/p_kind <> 'LOGO'/);assert.match(sql,/version=asset\.version\+1/);assert.match(sql,/check \(version > 0\)/);
});
test('owner file function separates private owner files from public quote sharing and validates PDF/DOCX bytes',async()=>{
  const edge=await readFile(path.join(process.cwd(),'supabase','functions','owner-file-assets','index.ts'),'utf8');
  assert.match(edge,/quotivo-owner-assets/);assert.match(edge,/get_owner_file_manifest/);assert.match(edge,/register_owner_file_asset/);assert.match(edge,/CHECKSUM_CONFLICT/);assert.match(edge,/kind !== 'LOGO'/);assert.match(edge,/upsert:kind === 'LOGO'/);assert.match(edge,/FILE_INTEGRITY_FAILED/);assert.doesNotMatch(edge,/quote-documents/);
});
