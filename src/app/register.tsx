import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthScreenLayout } from '@/components/form/auth-screen-layout';
import { FormButton } from '@/components/form/form-button';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import {
  minLength,
  passwordsMatch,
  required,
  runValidators,
  validEmail,
  validPhone,
  validUsername,
} from '@/utils/validation';

type FormState = {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialForm: FormState = {
  fullName: '',
  username: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterScreen() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setSubmitted(false);
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {
      fullName: required(form.fullName, 'Enter your full name'),
      username: runValidators(form.username, [
        (v) => required(v, 'Choose a username'),
        validUsername,
      ]),
      email: runValidators(form.email, [(v) => required(v, 'Enter your email'), validEmail]),
      phone: runValidators(form.phone, [(v) => required(v, 'Enter your phone number'), validPhone]),
      password: runValidators(form.password, [
        (v) => required(v, 'Create a password'),
        minLength(8),
      ]),
      confirmPassword:
        required(form.confirmPassword, 'Confirm your password') ??
        passwordsMatch(form.password, form.confirmPassword),
    };

    setErrors(nextErrors);
    return Object.values(nextErrors).every((error) => !error);
  }

  function handleSubmit() {
    const isValid = validate();
    if (!isValid) {
      setSubmitted(false);
      return;
    }
    // No backend yet — this is where a real registration API call will go.
    setSubmitted(true);
  }

  return (
    <AuthScreenLayout
      title="Create your account"
      subtitle="Join TrustSocial to start connecting."
      footer={
        <ThemedText type="default" themeColor="textSecondary">
          Already have an account?{' '}
          <ThemedText type="linkPrimary" onPress={() => router.replace('/login')}>
            Log In
          </ThemedText>
        </ThemedText>
      }>
      <TextField
        label="Full name"
        value={form.fullName}
        onChangeText={(v) => setField('fullName', v)}
        error={errors.fullName}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        returnKeyType="next"
      />
      <TextField
        label="Username"
        value={form.username}
        onChangeText={(v) => setField('username', v)}
        error={errors.username}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
        autoComplete="username"
        returnKeyType="next"
      />
      <TextField
        label="Email"
        value={form.email}
        onChangeText={(v) => setField('email', v)}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        returnKeyType="next"
      />
      <TextField
        label="Phone number"
        value={form.phone}
        onChangeText={(v) => setField('phone', v)}
        error={errors.phone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={form.password}
        onChangeText={(v) => setField('password', v)}
        error={errors.password}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="password-new"
        returnKeyType="next"
      />
      <TextField
        label="Confirm password"
        value={form.confirmPassword}
        onChangeText={(v) => setField('confirmPassword', v)}
        error={errors.confirmPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="password-new"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      {submitted ? (
        <ThemedText type="small" style={[styles.successBanner, { color: Brand.teal }]}>
          Looks good! Account creation isn&apos;t connected to a backend yet, so nothing was saved.
        </ThemedText>
      ) : null}

      <FormButton label="Create Account" onPress={handleSubmit} />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  successBanner: {
    marginTop: -Spacing.one,
  },
});
