import { StyleSheet, View } from 'react-native';

import { FormButton } from '@/components/form/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';

export default function HomeScreen() {
  const { logout } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safeArea}>
        <ThemedText type="title">Welcome to TrustSocial</ThemedText>

        <ThemedText
          type="default"
          themeColor="textSecondary"
          style={styles.body}>
          Connect with real people and communicate with confidence.
        </ThemedText>

        <View style={styles.logout}>
          <FormButton label="Log Out" variant="secondary" onPress={() => void logout()} />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 64,
    gap: 8,
  },
  body: {
    marginTop: 8,
    textAlign: 'center',
  },
  logout: {
    alignSelf: 'stretch',
    marginTop: 24,
  },
});
