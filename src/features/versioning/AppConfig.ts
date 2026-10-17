export type AppConfig = {
  minSupportedVersion: string;
  latestVersion: string;
  maintenanceMode: boolean;
  offlineGraceDays: number;
  featureFlags: Record<string, boolean>;
};

export type VersionStatus = 'OK' | 'UPDATE_AVAILABLE' | 'UPDATE_REQUIRED' | 'MAINTENANCE';

function versionParts(version: string): number[] {
  return version.split('-')[0].split('.').map((part) => Number(part)).map((part) => Number.isFinite(part) ? part : 0);
}

/** @public Comparatore stabile per la policy di versione della feature. */
export function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function versionStatus(config: AppConfig, appVersion: string): VersionStatus {
  if (config.maintenanceMode) return 'MAINTENANCE';
  if (compareVersions(appVersion, config.minSupportedVersion) < 0) return 'UPDATE_REQUIRED';
  if (compareVersions(appVersion, config.latestVersion) < 0) return 'UPDATE_AVAILABLE';
  return 'OK';
}
