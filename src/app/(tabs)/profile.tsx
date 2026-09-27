import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormButton } from '@/components/form/form-button';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  getMyProfile,
  updateMyProfile,
  uploadProfilePhoto,
  type UserProfile,
} from '@/services/api';
import { minLength, required, runValidators } from '@/utils/validation';

type ProfileForm = {
  fullName: string;
  username: string;
  phone: string;
};

type ProfileFormErrors = Partial<Record<keyof ProfileForm, string>>;

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const PHONE_RE = /^\+?[1-9]\d{7,14}$/;

function validProfileUsername(value: string): string | undefined {
  if (value.length === 0) return undefined;
  return USERNAME_RE.test(value)
    ? undefined
    : 'Username can only contain letters, numbers, and underscores';
}

function validProfilePhone(value: string): string | undefined {
  if (value.length === 0) return undefined;
  return PHONE_RE.test(value)
    ? undefined
    : 'Phone number must be a valid international number';
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<ProfileForm>({
    fullName: '',
    username: '',
    phone: '',
  });
  const [fieldErrors, setFieldErrors] = useState<ProfileFormErrors>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  async function loadProfile() {
    try {
      setIsLoading(true);
      setError('');

      const nextProfile = await getMyProfile();
      setProfile(nextProfile);
    } catch (loadError) {
      setProfile(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load your profile.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  function setField<K extends keyof ProfileForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setSaveError('');
  }

  function startEdit() {
    if (!profile) return;

    setForm({
      fullName: profile.fullName,
      username: profile.username,
      phone: profile.phone,
    });
    setFieldErrors({});
    setSaveError('');
    setIsEditing(true);
  }

  function cancelEdit() {
    setFieldErrors({});
    setSaveError('');
    setIsEditing(false);
  }

  function validate(): boolean {
    const nextErrors: ProfileFormErrors = {
      fullName: runValidators(form.fullName, [
        (value) => required(value, 'Enter your full name'),
        minLength(2),
      ]),
      username: runValidators(form.username, [
        (value) => required(value, 'Choose a username'),
        minLength(3),
        validProfileUsername,
      ]),
      phone: runValidators(form.phone, [
        (value) => required(value, 'Enter your phone number'),
        validProfilePhone,
      ]),
    };

    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((fieldError) => !fieldError);
  }

  async function handleSave() {
    setSaveError('');

    if (!validate()) {
      return;
    }

    try {
      setIsSaving(true);

      await updateMyProfile({
        fullName: form.fullName,
        username: form.username,
        phone: form.phone,
      });

      const refreshedProfile = await getMyProfile();
      setProfile(refreshedProfile);
      setIsEditing(false);
    } catch (saveFailure) {
      setSaveError(
        saveFailure instanceof Error
          ? saveFailure.message
          : 'Could not update your profile.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function pickPhoto() {
    try {
      setPhotoError('');

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setPhotoError('Photo library access is needed to choose a profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset?.uri || !asset.mimeType) {
        setPhotoError('Could not read the selected image.');
        return;
      }

      setIsUploadingPhoto(true);

      const uploaded = await uploadProfilePhoto({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        file: asset.file,
      });

      setProfile((current) =>
        current ? { ...current, profilePhotoUrl: uploaded.profilePhotoUrl } : uploaded,
      );

      const refreshedProfile = await getMyProfile();
      setProfile(refreshedProfile);
    } catch (pickError) {
      setPhotoError(
        pickError instanceof Error ? pickError.message : 'Could not upload your photo.',
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  const initial = profile?.fullName.trim().charAt(0).toUpperCase() || 'T';
  const photoActionLabel = profile?.profilePhotoUrl ? 'Change Photo' : 'Add Photo';

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">Profile</ThemedText>
        <View style={styles.actions}>
          <FormButton
            label="Notifications"
            accessibilityLabel="Notifications"
            variant="secondary"
            onPress={() => router.push('/notifications')}
          />
        </View>

        {isLoading ? (
          <ActivityIndicator color={Brand.teal} style={styles.status} />
        ) : null}

        {error ? (
          <View style={styles.status}>
            <ThemedText type="default" style={styles.error}>
              {error}
            </ThemedText>
            <FormButton label="Try again" variant="secondary" onPress={() => void loadProfile()} />
          </View>
        ) : null}

        {profile ? (
          <View style={styles.profile}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={photoActionLabel}
              disabled={isUploadingPhoto}
              onPress={() => void pickPhoto()}
              style={styles.photoButton}>
              {profile.profilePhotoUrl ? (
                <Image
                  source={{ uri: profile.profilePhotoUrl }}
                  style={styles.photo}
                  contentFit="cover"
                  accessibilityLabel={`${profile.fullName} profile photo`}
                />
              ) : (
                <ThemedView style={[styles.photo, styles.photoFallback]}>
                  <ThemedText style={styles.photoGlyph}>{initial}</ThemedText>
                </ThemedView>
              )}
            </Pressable>

            <View style={styles.actions}>
              <FormButton
                label={photoActionLabel}
                variant="secondary"
                loading={isUploadingPhoto}
                onPress={() => void pickPhoto()}
              />
              {photoError ? (
                <ThemedText type="default" style={styles.error}>
                  {photoError}
                </ThemedText>
              ) : null}
            </View>

            {isEditing ? (
              <View style={styles.editForm}>
                <TextField
                  label="Full name"
                  value={form.fullName}
                  onChangeText={(value) => setField('fullName', value)}
                  error={fieldErrors.fullName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
                <TextField
                  label="Username"
                  value={form.username}
                  onChangeText={(value) => setField('username', value)}
                  error={fieldErrors.username}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                />
                <TextField
                  label="Phone number"
                  value={form.phone}
                  onChangeText={(value) => setField('phone', value)}
                  error={fieldErrors.phone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>
            ) : (
              <>
                <ThemedText type="subtitle" style={styles.name}>
                  {profile.fullName}
                </ThemedText>
                <ThemedText type="default" themeColor="textSecondary">
                  @{profile.username}
                </ThemedText>
              </>
            )}

            <View style={styles.fields}>
              <ProfileField label="Email" value={profile.email} />
              {isEditing ? null : <ProfileField label="Phone" value={profile.phone} />}
              <ProfileField
                label="Verification"
                value={profile.isVerified ? 'Verified' : 'Not verified'}
              />
            </View>

            {saveError ? (
              <ThemedText type="default" style={styles.error}>
                {saveError}
              </ThemedText>
            ) : null}

            {isEditing ? (
              <View style={styles.actions}>
                <FormButton
                  label="Save"
                  loading={isSaving}
                  onPress={() => void handleSave()}
                />
                <FormButton
                  label="Cancel"
                  variant="secondary"
                  disabled={isSaving}
                  onPress={cancelEdit}
                />
              </View>
            ) : (
              <View style={styles.actions}>
                <FormButton label="Edit Profile" variant="secondary" onPress={startEdit} />
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  status: {
    alignSelf: 'stretch',
    marginTop: Spacing.four,
    gap: Spacing.three,
  },
  error: {
    color: Brand.danger,
    textAlign: 'center',
  },
  profile: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  photoButton: {
    marginBottom: Spacing.two,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  photoFallback: {
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoGlyph: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: 700,
  },
  name: {
    textAlign: 'center',
  },
  fields: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  field: {
    gap: Spacing.half,
  },
  editForm: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
});
