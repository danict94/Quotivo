import { listCachedJobInputs, removeCachedJobCost, removeCachedJobWork, saveCachedJobCost, saveCachedJobWork } from '../../database';
import { JobCostEntry, JobInputs, JobInputsCacheRepository, JobWorkEntry } from './JobInputsRepository';

/** Mobile SQLite adapter; it is deliberately outside the application/use-case boundary. */
export class LocalJobInputsCacheRepository implements JobInputsCacheRepository {
  list(jobId: string): Promise<JobInputs> { return listCachedJobInputs(jobId); }
  saveCost(entry: JobCostEntry): Promise<void> { return saveCachedJobCost(entry); }
  removeCost(entryId: string): Promise<void> { return removeCachedJobCost(entryId); }
  saveWork(entry: JobWorkEntry): Promise<void> { return saveCachedJobWork(entry); }
  removeWork(entryId: string): Promise<void> { return removeCachedJobWork(entryId); }
}
