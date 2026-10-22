import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { closeAccountDatabase } from './src/database';
import { AccountLifecycleProvider } from './src/features/account-lifecycle/AccountLifecycleProvider';
import { AuthProvider, useAuth } from './src/features/auth/AuthProvider';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { BackendBootstrapProvider, useBackendBootstrap } from './src/features/bootstrap/BackendBootstrapProvider';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme } from './src/ui/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedRoot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
function ThemedRoot() {
  const { theme } = useTheme();

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <BackendBootstrapProvider>
          <AccountLifecycleProvider>
            <RootGate />
          </AccountLifecycleProvider>
        </BackendBootstrapProvider>
      </AuthProvider>
    </>
  );
}

function RootGate() {
  const { status, session } = useAuth();
  const bootstrap = useBackendBootstrap();
  const { theme } = useTheme();

  useEffect(() => {
    if (status === 'unauthenticated') {
      void closeAccountDatabase().catch(() => undefined);
    }
  }, [status]);

  if (status === 'restoring' || bootstrap.status === 'bootstrapping') {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.green} />
      </SafeAreaView>
    );
  }

  if (status === 'unauthenticated') {
    return <AuthScreen />;
  }

  return (
    <View style={{ flex: 1 }}>
      <AppNavigator key={session.user.id} ownerUserId={session.user.id} />
    </View>
  );
}
