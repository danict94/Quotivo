import { fileDurabilityLocalRepository } from '../../database';
import { FileDurabilitySyncService } from './FileDurabilitySyncService';
import { SupabaseFileDurabilityRepository } from './SupabaseFileDurabilityRepository';

const service = new FileDurabilitySyncService(fileDurabilityLocalRepository(), new SupabaseFileDurabilityRepository());
export const syncRemoteFiles = () => service.sync();
export const ensureRemoteIssuedDocument = (quoteId: string, kind: 'PDF' | 'DOCX') => service.ensureDocument(quoteId, kind);
