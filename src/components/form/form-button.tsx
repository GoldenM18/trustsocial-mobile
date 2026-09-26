import { ActivityIndicator, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FormButtonProps = {
  label: string;
  accessibilityLabel?: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
};

/** Shared primary/secondary button style, reused across Welcome, Create Account, and Log In. */
export function FormButton({
  label,
  accessibilityLabel,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: FormButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary
          ? {
              backgroundColor: pressed ? Brand.tealPressed : Brand.teal,
              opacity: disabled ? 0.5 : 1,
            }
          : {
              borderWidth: 1.5,
              borderColor: theme.text,
              backgroundColor: 'transparent',
              opacity: pressed ? 0.6 : disabled ? 0.5 : 1,
            },
      ]}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#ffffff' : theme.text} />
      ) : (
        <ThemedText style={[styles.label, isPrimary ? styles.primaryLabel : { color: theme.text }]}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: 600,
  },
  primaryLabel: {
    color: '#ffffff',
  },
});
