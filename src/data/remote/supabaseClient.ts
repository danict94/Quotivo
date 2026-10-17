import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { supabaseEnv } from '../../config/env';

export const supabase = createClient(supabaseEnv.url, supabaseEnv.key, {
  auth: {
    storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
