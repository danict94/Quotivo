import { supabase } from '../../data/remote/supabaseClient';
import { AppConfig } from './AppConfig';
import { AppConfigRepository } from './AppConfigRepository';

type ConfigRow = { key: string; value: unknown };

export class SupabaseAppConfigRepository implements AppConfigRepository {
  async get(): Promise<AppConfig> {
    const { data, error } = await supabase.from('app_config').select('key, value');
    if (error || !data) throw new Error('Configurazione remota non disponibile.');

    const values = new Map((data as ConfigRow[]).map((row) => [row.key, row.value]));
    const minSupportedVersion = values.get('min_supported_version');
    const latestVersion = values.get('latest_version');
    const maintenanceMode = values.get('maintenance_mode');
    const offlineGraceDays = values.get('offline_grace_days');
    const featureFlags = values.get('feature_flags');

    if (typeof minSupportedVersion !== 'string' || typeof latestVersion !== 'string'
      || typeof maintenanceMode !== 'boolean' || typeof offlineGraceDays !== 'number'
      || !Number.isInteger(offlineGraceDays) || offlineGraceDays < 0
      || typeof featureFlags !== 'object' || featureFlags === null || Array.isArray(featureFlags)) {
      throw new Error('Configurazione remota non valida.');
    }

    return { minSupportedVersion, latestVersion, maintenanceMode, offlineGraceDays, featureFlags: featureFlags as Record<string, boolean> };
  }
}
