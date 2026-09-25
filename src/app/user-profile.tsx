import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { FormButton } from '@/components/form/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getPublicProfile, type PublicProfile } from '@/services/api';

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);

  useEffect(() => {
    void loadProfile();
  }, [userId]);

  async function loadProfile() {
    const seq = ++requestSeq.current;

    if (!userId) {
      setProfile(null);
      setError('A user id is required.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const nextProfile = await getPublicProfile(userId);

      if (seq !== requestSeq.current) {
        return;
      }

      setProfile(nextProfile);
    } catch (loadError) {
      if (seq !== requestSeq.current) {
        return;
      }

      setProfile(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load profile.');
    } finally {
      if (seq === requestSeq.current) {
        setIsLoading(false);
      }
    }
  }

  function goBackToDiscover() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/discover');
  }

  const initial = profile?.fullName.trim().charAt(0).toUpperCase() || 'T';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <FormButton label="Back" variant="secondary" onPress={goBackToDiscover} />

        {isLoading ? <ActivityIndicator color={Brand.teal} /> : null}

        {error ? (
          <View style={styles.errorBlock}>
            <ThemedText type="default" style={styles.error}>
              {error}
            </ThemedText>
            <FormButton label="Retry" variant="secondary" onPress={() => void loadProfile()} />
          </View>
        ) : null}

        {profile && !isLoading ? (
          <View style={styles.profile}>
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

            <ThemedText type="subtitle" style={styles.name}>
              {profile.fullName}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              @{profile.username}
            </ThemedText>
            {profile.isVerified ? (
              <ThemedText type="small" style={styles.verified}>
                Verified
              </ThemedText>
            ) : null}
            {profile.isOnline ? (
              <ThemedText type="small" style={styles.online}>
                Online
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              Joined {formatJoinedDate(profile.createdAt)}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function formatJoinedDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  errorBlock: {
    gap: Spacing.three,
  },
  error: {
    color: Brand.danger,
    textAlign: 'center',
  },
  profile: {
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
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
  verified: {
    color: Brand.teal,
  },
  online: {
    color: Brand.teal,
  },
});
