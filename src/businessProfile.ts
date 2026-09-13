import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { copyAsync, EncodingType, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { allowedLogoMimeTypes } from './logoValidation';
import { importLogoAsset, LogoImportGateway, runStagingStrategies } from './logoImport';

export type BusinessProfile = {
  businessName: string; taxId: string; vatNumber: string; address: string;
  postalCode: string; city: string; province: string; email: string; phone: string; website: string;
  defaultConditions: string; defaultValidityDays: number; defaultPaymentTerms: string;
  logoUri: string | null; logoMimeType: string | null; logoOriginalName: string | null;
};

type ProfileRow = {
  business_name: string; tax_id: string; vat_number: string; address: string; postal_code: string;
  city: string; province: string; email: string; phone: string; website: string;
  default_conditions: string; default_validity_days: number; default_payment_terms: string;
  logo_uri: string | null; logo_mime_type: string | null; logo_original_name: string | null;
};

async function removeTemporaryIfPresent(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}

async function stageSelectedUri(sourceUri: string, temporaryUri: string) {
  await runStagingStrategies([
    { label: 'copia SAF', run: () => copyAsync({ from: sourceUri, to: temporaryUri }) },
    { label: 'trasferimento URI', run: async () => {
      const response = await expoFetch(sourceUri);
      if (!response.ok && response.status !== 0) throw new Error(`risposta ${response.status}`);
      const temporary = new File(temporaryUri);
      temporary.create();
      temporary.write(await response.bytes());
    } },
    { label: 'copia locale', run: async () => {
      const base64 = await readAsStringAsync(sourceUri, { encoding: EncodingType.Base64 });
      await writeAsStringAsync(temporaryUri, base64, { encoding: EncodingType.Base64 });
    } },
  ], () => removeTemporaryIfPresent(temporaryUri));
}

function fromRow(row: ProfileRow): BusinessProfile {
  return { businessName: row.business_name, taxId: row.tax_id, vatNumber: row.vat_number, address: row.address,
    postalCode: row.postal_code, city: row.city, province: row.province, email: row.email, phone: row.phone, website: row.website,
    defaultConditions: row.default_conditions, defaultValidityDays: row.default_validity_days, defaultPaymentTerms: row.default_payment_terms,
    logoUri: row.logo_uri, logoMimeType: row.logo_mime_type, logoOriginalName: row.logo_original_name };
}

export async function getBusinessProfile(db: SQLite.SQLiteDatabase): Promise<BusinessProfile> {
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM business_profiles WHERE id = 1');
  if (!row) throw new Error('Profilo attività non inizializzato.');
  return fromRow(row);
}

export async function saveBusinessProfile(db: SQLite.SQLiteDatabase, profile: BusinessProfile) {
  if (!Number.isSafeInteger(profile.defaultValidityDays) || profile.defaultValidityDays < 1 || profile.defaultValidityDays > 3650) throw new Error('La validità deve essere compresa tra 1 e 3650 giorni.');
  await db.runAsync(`UPDATE business_profiles SET business_name=?, tax_id=?, vat_number=?, address=?, postal_code=?, city=?, province=?, email=?, phone=?, website=?, default_conditions=?, default_validity_days=?, default_payment_terms=?, logo_uri=?, logo_mime_type=?, logo_original_name=?, updated_at=? WHERE id=1`,
    profile.businessName.trim(), profile.taxId.trim(), profile.vatNumber.trim(), profile.address.trim(), profile.postalCode.trim(), profile.city.trim(), profile.province.trim(), profile.email.trim(), profile.phone.trim(), profile.website.trim(), profile.defaultConditions.trim(), profile.defaultValidityDays, profile.defaultPaymentTerms.trim(), profile.logoUri, profile.logoMimeType, profile.logoOriginalName, new Date().toISOString());
}

export async function choosePersistentLogo() {
  const result = await DocumentPicker.getDocumentAsync({ type: [...allowedLogoMimeTypes], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('Il selettore non ha restituito alcun file.');

  const gateway: LogoImportGateway = {
    createTemporaryUri() {
      return new File(Paths.cache, `quotivo-logo-import-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`).uri;
    },
    async copyIntoPrivateCache(sourceUri, temporaryUri) {
      await stageSelectedUri(sourceUri, temporaryUri);
    },
    async readPrivateBytes(temporaryUri) {
      return new File(temporaryUri).bytes();
    },
    async copyIntoPersistentStorage(temporaryUri, mimeType) {
      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/svg+xml' ? 'svg' : mimeType.split('/')[1];
      const directory = new Directory(Paths.document, 'logos');
      if (!directory.exists) directory.create({ intermediates: true });
      const destination = new File(directory, `business-logo-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`);
      try {
        await new File(temporaryUri).copy(destination);
      } catch (error) {
        if (destination.exists) destination.delete();
        throw error;
      }
      return destination.uri;
    },
    async removeTemporaryFile(temporaryUri) {
      const temporary = new File(temporaryUri);
      if (temporary.exists) temporary.delete();
    },
  };
  return importLogoAsset(asset, gateway);
}

export function deleteManagedLogo(uri: string | null) {
  if (!uri) return;
  const logosDirectory = new Directory(Paths.document, 'logos');
  const file = new File(uri);
  if (file.exists && file.parentDirectory.uri === logosDirectory.uri) file.delete();
}

export async function profileSnapshot(db: SQLite.SQLiteDatabase) {
  const profile = await getBusinessProfile(db);
  let logoDataBase64: string | null = null;
  if (profile.logoUri) {
    const logo = new File(profile.logoUri);
    if (!logo.exists) throw new Error('Il file del logo non è disponibile. Sostituiscilo o rimuovilo dalle impostazioni.');
    logoDataBase64 = await logo.base64();
  }
  return { ...profile, logoDataBase64 };
}
