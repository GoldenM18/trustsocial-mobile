import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreenLayout } from '@/components/form/auth-screen-layout';
import { FormButton } from '@/components/form/form-button';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { required } from '@/utils/validation';

type FormState = {
  identifier: string; // email or username
  password: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

export default function LoginScreen() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ identifier: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setSubmitted(false);
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {
      identifier: required(form.identifier, 'Enter your email or username'),
      password: required(form.password, 'Enter your password'),
    };
    setErrors(nextErrors);
    return Object.values(nextErrors).every((error) => !error);
  }

  function handleSubmit() {
    if (!validate()) {
      setSubmitted(false);
      return;
    }
    // No backend yet — this is where a real sign-in API call will go.
    setSubmitted(true);
  }

  function handleForgotPassword() {
    // Password-recovery screen isn't built yet — out of scope for this step.
  }

  return (
    <AuthScreenLayout
      title="Log in"
      subtitle="Welcome back to TrustSocial."
      footer={
        <ThemedText type="default" themeColor="textSecondary">
          Don&apos;t have an account?{' '}
          <ThemedText type="linkPrimary" onPress={() => router.replace('/register')}>
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
        keyboardType="email-address"
        textContentType="username"
        autoComplete="username"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={form.password}
        onChangeText={(v) => setField('password', v)}
        error={errors.password}
        secureTextEntry
        textContentType="password"
        autoComplete="password"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      <ThemedText
        type="link"
        themeColor="textSecondary"
        onPress={handleForgotPassword}
        style={styles.forgotPassword}>
        Forgot Password?
      </ThemedText>

      {submitted ? (
        <ThemedText type="small" style={[styles.successBanner, { color: Brand.teal }]}>
          Credentials look valid! Sign-in isn&apos;t connected to a backend yet.
        </ThemedText>
      ) : null}

      <FormButton label="Log In" onPress={handleSubmit} />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.two,
  },
  successBanner: {
    marginTop: -Spacing.one,
  },
});
