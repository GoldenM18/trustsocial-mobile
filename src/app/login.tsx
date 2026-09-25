import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreenLayout } from '@/components/form/auth-screen-layout';
import { FormButton } from '@/components/form/form-button';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { loginUser } from '@/services/api';
import { saveAccessToken } from '@/services/auth-storage';
import { minLength, required, runValidators } from '@/utils/validation';

type FormState = {
  identifier: string;
  password: string;
};

export default function LoginScreen() {
  const router = useRouter();
  const { refreshSession } = useAuth();

  const [form, setForm] = useState<FormState>({
    identifier: '',
    password: '',
  });

  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setServerError('');
  }

  function validate(): boolean {
    const nextErrors = {
      identifier: required(
        form.identifier,
        'Enter your email or username',
      ),
      password: runValidators(form.password, [
        (v) => required(v, 'Enter your password'),
        minLength(8),
      ]),
    };

    setErrors(nextErrors);

    return Object.values(nextErrors).every((error) => !error);
  }

  async function handleSubmit() {
    setServerError('');

    if (!validate()) {
      return;
    }

    try {
      setIsLoading(true);

      const result = await loginUser(form);
      await saveAccessToken(result.accessToken);
      await refreshSession();
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Login failed. Please check your credentials.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthScreenLayout
      title="Welcome back"
      subtitle="Log in to continue to TrustSocial."
      footer={
        <ThemedText type="default" themeColor="textSecondary">
          Don't have an account?{' '}
          <ThemedText
            type="linkPrimary"
            onPress={() => router.replace('/register')}>
            Create Account
          </ThemedText>
        </ThemedText>
      }>
      <TextField
        label="Email or username"
        value={form.identifier}
        onChangeText={(v) => setField('identifier', v)}
        error={errors.identifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        returnKeyType="next"
      />

      <TextField
        label="Password"
        value={form.password}
        onChangeText={(v) => setField('password', v)}
        error={errors.password}
        secureTextEntry
        autoComplete="password"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      {serverError ? (
        <ThemedText type="small" style={styles.errorBanner}>
          {serverError}
        </ThemedText>
      ) : null}

      <FormButton
        label={isLoading ? 'Logging In...' : 'Log In'}
        onPress={handleSubmit}
      />

      <ThemedText
        type="linkPrimary"
        style={styles.forgotPassword}
        onPress={() => {}}>
        Forgot password?
      </ThemedText>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    marginTop: -Spacing.one,
  },
  forgotPassword: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
