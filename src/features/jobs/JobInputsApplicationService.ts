import { JobCostDraft, JobCostEntry, JobInputs, JobInputsCacheRepository, JobInputsRemoteRepository, JobWorkDraft, JobWorkEntry } from './JobInputsRepository';

export class JobInputsApplicationService {
  constructor(private readonly remote: JobInputsRemoteRepository, private readonly cache: JobInputsCacheRepository) {}
  async load(jobId: string): Promise<Readonly<{ inputs: JobInputs; offline: boolean }>> {
    try {
      const inputs = await this.remote.list(jobId);
      await Promise.all([...inputs.costs.map((entry) => this.cache.saveCost(entry)), ...inputs.workEntries.map((entry) => this.cache.saveWork(entry))]);
      return { inputs, offline: false };
    } catch { return { inputs: await this.cache.list(jobId), offline: true }; }
  }
  async createCost(jobId: string, draft: JobCostDraft) { const entry = await this.remote.createCost(jobId, draft); await this.cache.saveCost(entry); return entry; }
  async updateCost(entryId: string, draft: Omit<JobCostDraft, 'requestKey'>) { const entry = await this.remote.updateCost(entryId, draft); await this.cache.saveCost(entry); return entry; }
  async deleteCost(entryId: string) { await this.remote.deleteCost(entryId); await this.cache.removeCost(entryId); }
  async createWork(jobId: string, draft: JobWorkDraft) { const entry = await this.remote.createWork(jobId, draft); await this.cache.saveWork(entry); return entry; }
  async updateWork(entryId: string, draft: Omit<JobWorkDraft, 'requestKey'>) { const entry = await this.remote.updateWork(entryId, draft); await this.cache.saveWork(entry); return entry; }
  async deleteWork(entryId: string) { await this.remote.deleteWork(entryId); await this.cache.removeWork(entryId); }
}
