import { useRouter } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type AuthScreenLayoutProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  footer?: ReactNode;
}>;

/** Common chrome for Create Account / Log In: back affordance, scroll, keyboard avoidance. */
export function AuthScreenLayout({ title, subtitle, footer, children }: AuthScreenLayoutProps) {
  const router = useRouter();

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={styles.backButton}
            hitSlop={12}>
            <ThemedText type="link" themeColor="textSecondary">
              ‹ Back
            </ThemedText>
          </Pressable>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <ThemedView style={styles.card}>
              <ThemedText type="subtitle">{title}</ThemedText>
              {subtitle ? (
                <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
                  {subtitle}
                </ThemedText>
              ) : null}

              <ThemedView style={styles.form}>{children}</ThemedView>

              {footer ? <ThemedView style={styles.footer}>{footer}</ThemedView> : null}
            </ThemedView>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  backButton: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    gap: Spacing.one,
  },
  subtitle: {
    marginBottom: Spacing.two,
  },
  form: {
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
