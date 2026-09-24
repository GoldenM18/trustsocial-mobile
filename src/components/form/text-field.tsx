import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

/**
 * Labeled input field with an inline error message. Purely presentational —
 * validation logic lives in the screen/hook that owns the field's state, so
 * this component stays easy to reuse for any future form (profile edit,
 * report/block reasons, etc.).
 */
export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: error ? Brand.danger : 'transparent',
          },
          style,
        ]}
        accessibilityLabel={label}
        {...inputProps}
      />
      {error ? (
        <ThemedText type="small" style={[styles.error, { color: Brand.danger }]}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  label: {
    marginBottom: 2,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  error: {
    marginTop: 2,
  },
});
