import { Entitlement } from './Entitlement';

export interface EntitlementRepository {
  getForCurrentUser(): Promise<Entitlement>;
}
