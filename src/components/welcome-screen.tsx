import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Original brand palette for TrustSocial.
 * Navy conveys security/trust, teal conveys openness/communication.
 * Scoped to the welcome screen for now; promote to constants/theme.ts
 * once a full design system is defined.
 */
const Brand = {
  navy: '#1D3557',
  teal: '#2A9D8F',
  tealPressed: '#23847A',
} as const;

export function WelcomeScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;

  // Auth is not implemented yet — these are wired up to real navigation
  // in a later step once the (auth) route group exists.
  const handleCreateAccount = () => {};
  const handleLogIn = () => {};

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create Account"
            onPress={handleCreateAccount}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              { backgroundColor: pressed ? Brand.tealPressed : Brand.teal },
            ]}>
            <ThemedText style={styles.primaryButtonText}>Create Account</ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log In"
            onPress={handleLogIn}
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              { borderColor: theme.text, opacity: pressed ? 0.6 : 1 },
            ]}>
            <ThemedText style={styles.secondaryButtonText}>Log In</ThemedText>
          </Pressable>
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
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {},
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 600,
  },
  secondaryButton: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: 600,
  },
});
