import { AppConfig } from './AppConfig';

export interface AppConfigRepository {
  get(): Promise<AppConfig>;
}
