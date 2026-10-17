function requirePublicEnv(value: string | undefined, name: string): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return normalizedValue;
}

export const supabaseEnv = {
  url: requirePublicEnv(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'),
  key: requirePublicEnv(process.env.EXPO_PUBLIC_SUPABASE_KEY, 'EXPO_PUBLIC_SUPABASE_KEY'),
} as const;
