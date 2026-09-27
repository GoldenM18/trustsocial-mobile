import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { FormButton } from '@/components/form/form-button';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  discoverUsers,
  getConnectionSuggestions,
  getOutgoingConnectionRequests,
  sendConnectionRequest,
  type DiscoverUser,
  type DiscoverUsersPage,
  type SuggestedUser,
} from '@/services/api';

const PAGE_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

function isAlreadyPending(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('already pending');
}

export default function DiscoverScreen() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [sendingIds, setSendingIds] = useState<Record<string, true>>({});
  const [sentIds, setSentIds] = useState<Record<string, true>>({});
  const [connectErrors, setConnectErrors] = useState<Record<string, string>>({});
  const requestSeq = useRef(0);
  const outgoingSeq = useRef(0);
  const sendingIdsRef = useRef(new Set<string>());
  const sentIdsRef = useRef(new Set<string>());
  const sendsDuringOutgoingLoad = useRef<Set<string> | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [search]);

  const loadOutgoingPending = useCallback(async () => {
    const seq = ++outgoingSeq.current;
    const sentDuringLoad = new Set<string>();
    sendsDuringOutgoingLoad.current = sentDuringLoad;

    try {
      const outgoing = await getOutgoingConnectionRequests();

      if (seq !== outgoingSeq.current) {
        return;
      }

      const pendingRecipientIds = new Set(
        outgoing.requests.map((request) => request.recipient.id),
      );

      for (const userId of sentDuringLoad) {
        pendingRecipientIds.add(userId);
      }

      for (const userId of sendingIdsRef.current) {
        pendingRecipientIds.add(userId);
      }

      sentIdsRef.current = pendingRecipientIds;
      const nextSentIds: Record<string, true> = {};

      for (const userId of pendingRecipientIds) {
        nextSentIds[userId] = true;
      }

      setSentIds(nextSentIds);
    } catch {
      // Keep the current button state when pending requests cannot be loaded.
    } finally {
      if (sendsDuringOutgoingLoad.current === sentDuringLoad) {
        sendsDuringOutgoingLoad.current = null;
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadOutgoingPending();
    }, [loadOutgoingPending]),
  );

  useEffect(() => {
    void loadPage(1, debouncedSearch, false);
  }, [debouncedSearch]);

  const loadSuggestions = useCallback(async () => {
    try {
      setSuggestionsLoading(true);

      const result = await getConnectionSuggestions();
      setSuggestions(result.users);
    } catch (suggestionError) {
      console.error('Failed to load connection suggestions:', suggestionError);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSuggestions();
    }, [loadSuggestions]),
  );

  async function loadPage(nextPage: number, searchValue: string, append: boolean) {
    const seq = ++requestSeq.current;
    const pendingTask = loadOutgoingPending();

    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      setError('');

      const result = await discoverUsers({
        search: searchValue || undefined,
        page: nextPage,
        limit: PAGE_LIMIT,
      });

      await pendingTask;

      if (seq !== requestSeq.current) {
        return;
      }

      applyPage(result, append);
    } catch (loadError) {
      if (seq !== requestSeq.current) {
        return;
      }

      void pendingTask;

      if (!append) {
        setUsers([]);
        setPage(1);
        setTotalPages(0);
      }

      setError(
        loadError instanceof Error ? loadError.message : 'Could not load people.',
      );
    } finally {
      if (seq === requestSeq.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }

  function applyPage(result: DiscoverUsersPage, append: boolean) {
    setPage(result.page);
    setTotalPages(result.totalPages);
    setUsers((current) => (append ? [...current, ...result.users] : result.users));
  }

  async function connectToUser(userId: string) {
    if (sendingIdsRef.current.has(userId) || sentIdsRef.current.has(userId)) {
      return;
    }

    sendingIdsRef.current.add(userId);
    setSendingIds((current) => ({ ...current, [userId]: true }));
    setConnectErrors((current) => {
      if (!current[userId]) {
        return current;
      }

      const next = { ...current };
      delete next[userId];
      return next;
    });

    try {
      await sendConnectionRequest(userId);
      rememberSent(userId);
    } catch (connectError) {
      if (isAlreadyPending(connectError)) {
        rememberSent(userId);
        return;
      }

      setConnectErrors((current) => ({
        ...current,
        [userId]:
          connectError instanceof Error
            ? connectError.message
            : 'Could not send connection request.',
      }));
    } finally {
      sendingIdsRef.current.delete(userId);
      setSendingIds((current) => {
        if (!current[userId]) {
          return current;
        }

        const next = { ...current };
        delete next[userId];
        return next;
      });
    }
  }

  function rememberSent(userId: string) {
    sentIdsRef.current.add(userId);
    sendsDuringOutgoingLoad.current?.add(userId);
    setSentIds((current) => ({ ...current, [userId]: true }));
  }

  const hasMore = page < totalPages;

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={(user) => user.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="subtitle">Discover</ThemedText>
            <TextField
              label="Search"
              value={search}
              onChangeText={setSearch}
              placeholder="Name or username"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="search"
            />
            {isLoading ? <ActivityIndicator color={Brand.teal} /> : null}

            {!debouncedSearch && suggestionsLoading ? (
              <ActivityIndicator color={Brand.teal} />
            ) : null}

            {!debouncedSearch && !suggestionsLoading && suggestions.length > 0 ? (
              <View style={styles.suggestionsSection}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="default">Suggested for you</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Based on your connections
                  </ThemedText>
                </View>

                <FlatList
                  horizontal
                  data={suggestions}
                  keyExtractor={(user) => `suggestion-${user.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionsList}
                  renderItem={({ item }) => (
                    <SuggestedUserCard
                      user={item}
                      isSending={sendingIds[item.id] === true}
                      isSent={sentIds[item.id] === true}
                      connectError={connectErrors[item.id] ?? ''}
                      onConnect={() => void connectToUser(item.id)}
                    />
                  )}
                />
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorBlock}>
                <ThemedText type="default" style={styles.error}>
                  {error}
                </ThemedText>
                <FormButton
                  label="Retry"
                  variant="secondary"
                  onPress={() => void loadPage(1, debouncedSearch, false)}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !isLoading && !error ? (
            <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
              {debouncedSearch ? 'No people match your search.' : 'No one to discover yet.'}
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <DiscoverUserRow
            user={item}
            isSending={sendingIds[item.id] === true}
            isSent={sentIds[item.id] === true}
            connectError={connectErrors[item.id] ?? ''}
            onConnect={() => void connectToUser(item.id)}
          />
        )}
        ListFooterComponent={
          hasMore && !error ? (
            <View style={styles.footer}>
              <FormButton
                label="Load more"
                variant="secondary"
                loading={isLoadingMore}
                onPress={() => void loadPage(page + 1, debouncedSearch, true)}
              />
            </View>
          ) : null
        }
      />
    </ThemedView>
  );
}

function SuggestedUserCard({
  user,
  isSending,
  isSent,
  connectError,
  onConnect,
}: {
  user: SuggestedUser;
  isSending: boolean;
  isSent: boolean;
  connectError: string;
  onConnect: () => void;
}) {
  const initial = user.fullName.trim().charAt(0).toUpperCase() || 'T';

  return (
    <ThemedView type="backgroundElement" style={styles.suggestionCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${user.fullName} profile`}
        onPress={() =>
          router.push({
            pathname: '/user-profile',
            params: { id: user.id },
          })
        }
        style={({ pressed }) => [styles.suggestionProfile, pressed && styles.pressed]}>
        {user.profilePhotoUrl ? (
          <Image
            source={{ uri: user.profilePhotoUrl }}
            style={styles.suggestionPhoto}
            contentFit="cover"
            accessibilityLabel={`${user.fullName} profile photo`}
          />
        ) : (
          <ThemedView style={[styles.suggestionPhoto, styles.photoFallback]}>
            <ThemedText style={styles.photoGlyph}>{initial}</ThemedText>
          </ThemedView>
        )}

        <ThemedText
          type="default"
          numberOfLines={1}
          style={styles.suggestionName}>
          {user.fullName}
        </ThemedText>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          numberOfLines={1}>
          @{user.username}
        </ThemedText>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.mutualText}>
          {user.mutualConnections === 1
            ? '1 mutual connection'
            : `${user.mutualConnections} mutual connections`}
        </ThemedText>
      </Pressable>

      {connectError ? (
        <ThemedText type="small" style={styles.connectError} numberOfLines={2}>
          {connectError}
        </ThemedText>
      ) : null}

      <FormButton
        label={isSent ? 'Request Sent' : 'Connect'}
        disabled={isSent || isSending}
        loading={isSending}
        onPress={onConnect}
      />
    </ThemedView>
  );
}

function DiscoverUserRow({
  user,
  isSending,
  isSent,
  connectError,
  onConnect,
}: {
  user: DiscoverUser;
  isSending: boolean;
  isSent: boolean;
  connectError: string;
  onConnect: () => void;
}) {
  const initial = user.fullName.trim().charAt(0).toUpperCase() || 'T';

  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${user.fullName} profile`}
        onPress={() =>
          router.push({
            pathname: '/user-profile',
            params: { id: user.id },
          })
        }
        style={({ pressed }) => [styles.profileTap, pressed && styles.pressed]}>
        {user.profilePhotoUrl ? (
          <Image
            source={{ uri: user.profilePhotoUrl }}
            style={styles.photo}
            contentFit="cover"
            accessibilityLabel={`${user.fullName} profile photo`}
          />
        ) : (
          <ThemedView style={[styles.photo, styles.photoFallback]}>
            <ThemedText style={styles.photoGlyph}>{initial}</ThemedText>
          </ThemedView>
        )}

        <View style={styles.details}>
          <ThemedText type="default">{user.fullName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            @{user.username}
          </ThemedText>
          <ThemedText type="small" style={user.isVerified ? styles.verified : undefined} themeColor={user.isVerified ? undefined : 'textSecondary'}>
            {user.isVerified ? 'Verified' : 'Not verified'}
          </ThemedText>
          <ThemedText type="small" style={user.isOnline ? styles.online : undefined} themeColor={user.isOnline ? undefined : 'textSecondary'}>
            {user.isOnline ? 'Online' : 'Offline'}
          </ThemedText>
        </View>
      </Pressable>
      {connectError ? (
        <ThemedText type="small" style={styles.connectError}>
          {connectError}
        </ThemedText>
      ) : null}
      <FormButton
        label={isSent ? 'Request Sent' : 'Connect'}
        disabled={isSent || isSending}
        loading={isSending}
        onPress={onConnect}
      />
    </ThemedView>
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  suggestionsSection: {
    gap: Spacing.two,
  },
  sectionHeader: {
    gap: Spacing.one,
  },
  suggestionsList: {
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  suggestionCard: {
    width: 190,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  suggestionProfile: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  suggestionPhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: Spacing.one,
  },
  suggestionName: {
    maxWidth: 160,
    textAlign: 'center',
  },
  mutualText: {
    textAlign: 'center',
  },
  errorBlock: {
    gap: Spacing.three,
  },
  error: {
    color: Brand.danger,
    textAlign: 'center',
  },
  connectError: {
    color: Brand.danger,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  row: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  profileTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  photoFallback: {
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoGlyph: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 700,
  },
  details: {
    flex: 1,
    gap: Spacing.half,
  },
  verified: {
    color: Brand.teal,
  },
  online: {
    color: Brand.teal,
  },
  footer: {
    marginTop: Spacing.two,
  },
});
