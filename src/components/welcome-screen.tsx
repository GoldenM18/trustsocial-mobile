import { useRouter } from 'expo-router';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormButton } from '@/components/form/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export function WelcomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.brandSection}>
          <ThemedView style={[styles.logoMark, { backgroundColor: Brand.navy }]}>
            <ThemedText style={styles.logoGlyph}>T</ThemedText>
          </ThemedView>

          <ThemedText type="title" style={[styles.appName, isCompact && styles.appNameCompact]}>
            TrustSocial
          </ThemedText>

          <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
            Connect with real people. Communicate with confidence.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.actions}>
          <FormButton label="Create Account" variant="primary" onPress={() => router.push('/register')} />
          <FormButton label="Log In" variant="secondary" onPress={() => router.push('/login')} />
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.six,
  },
  brandSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  logoGlyph: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 700,
  },
  appName: {
    textAlign: 'center',
  },
  appNameCompact: {
    fontSize: 36,
    lineHeight: 40,
  },
  tagline: {
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: {
    gap: Spacing.three,
    alignSelf: 'stretch',
  },
});
