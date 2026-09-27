import { Stack } from 'expo-router';

import { CallSessionProvider } from '@/call/call-session';
import { AuthProvider, useAuth } from '@/context/auth-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <CallSessionProvider enabled={isAuthenticated}>
    <Stack>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="login"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="register"
          options={{
            headerShown: false,
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
      </Stack.Protected>
    </Stack>
    </CallSessionProvider>
  );
}
