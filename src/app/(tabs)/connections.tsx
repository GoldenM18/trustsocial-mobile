import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { FormButton } from '@/components/form/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  acceptConnectionRequest,
  cancelConnectionRequest,
  getConnections,
  getIncomingConnectionRequests,
  getOutgoingConnectionRequests,
  rejectConnectionRequest,
  removeConnection,
  createConversation,
  type AcceptedConnection,
  type ConnectionUser,
} from '@/services/api';

type ListedPerson = {
  connectionId: string;
  user: ConnectionUser;
};

export default function ConnectionsScreen() {
  const [connections, setConnections] = useState<AcceptedConnection[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<ListedPerson[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ListedPerson[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [incomingLoading, setIncomingLoading] = useState(true);
  const [outgoingLoading, setOutgoingLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState('');
  const [incomingError, setIncomingError] = useState('');
  const [outgoingError, setOutgoingError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [acting, setActing] = useState<Record<string, 'accept' | 'reject' | 'cancel' | 'remove'>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [acceptNotice, setAcceptNotice] = useState('');
  const [cancelNotice, setCancelNotice] = useState('');
  const [removeNotice, setRemoveNotice] = useState('');
  const [confirmingRemoveIds, setConfirmingRemoveIds] = useState<Record<string, true>>({});
  const [openingChatIds, setOpeningChatIds] = useState<Record<string, true>>({});
  const [openChatErrors, setOpenChatErrors] = useState<Record<string, string>>({});
  const openingChatIdsRef = useRef(new Set<string>());
  const actingIds = useRef(new Set<string>());
  const connectionsSeq = useRef(0);
  const incomingSeq = useRef(0);
  const outgoingSeq = useRef(0);
  const refreshSeq = useRef(0);

  useEffect(() => {
    void loadConnections(true);
    void loadIncoming(true);
    void loadOutgoing(true);
  }, []);

  async function loadConnections(showSpinner: boolean) {
    const seq = ++connectionsSeq.current;

    if (showSpinner) {
      setConnectionsLoading(true);
    }

    try {
      const result = await getConnections();

      if (seq !== connectionsSeq.current) {
        return;
      }

      setConnections(result.connections);
      setConnectionsError('');
    } catch (loadError) {
      if (seq !== connectionsSeq.current) {
        return;
      }

      setConnectionsError(
        loadError instanceof Error ? loadError.message : 'Could not load connections.',
      );
    } finally {
      if (seq === connectionsSeq.current) {
        setConnectionsLoading(false);
      }
    }
  }

  async function loadIncoming(showSpinner: boolean) {
    const seq = ++incomingSeq.current;

    if (showSpinner) {
      setIncomingLoading(true);
    }

    try {
      const result = await getIncomingConnectionRequests();

      if (seq !== incomingSeq.current) {
        return;
      }

      setIncomingRequests(
        result.requests.map((request) => ({
          connectionId: request.connectionId,
          user: request.requester,
        })),
      );
      setIncomingError('');
    } catch (loadError) {
      if (seq !== incomingSeq.current) {
        return;
      }

      setIncomingError(
        loadError instanceof Error ? loadError.message : 'Could not load connection requests.',
      );
    } finally {
      if (seq === incomingSeq.current) {
        setIncomingLoading(false);
      }
    }
  }

  async function loadOutgoing(showSpinner: boolean) {
    const seq = ++outgoingSeq.current;

    if (showSpinner) {
      setOutgoingLoading(true);
    }

    try {
      const result = await getOutgoingConnectionRequests();

      if (seq !== outgoingSeq.current) {
        return;
      }

      setOutgoingRequests(
        result.requests.map((request) => ({
          connectionId: request.connectionId,
          user: request.recipient,
        })),
      );
      setOutgoingError('');
    } catch (loadError) {
      if (seq !== outgoingSeq.current) {
        return;
      }

      setOutgoingError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load sent connection requests.',
      );
    } finally {
      if (seq === outgoingSeq.current) {
        setOutgoingLoading(false);
      }
    }
  }

  async function refreshAll() {
    const seq = ++refreshSeq.current;
    setIsRefreshing(true);
    setAcceptNotice('');
    setCancelNotice('');
    setRemoveNotice('');
    setConfirmingRemoveIds({});

    await Promise.all([loadConnections(false), loadIncoming(false), loadOutgoing(false)]);

    if (seq === refreshSeq.current) {
      setIsRefreshing(false);
    }
  }

  async function respondToIncoming(connectionId: string, action: 'accept' | 'reject') {
    if (actingIds.current.has(connectionId)) {
      return;
    }

    actingIds.current.add(connectionId);
    setActing((current) => ({ ...current, [connectionId]: action }));
    setActionErrors((current) => {
      if (!current[connectionId]) {
        return current;
      }

      const next = { ...current };
      delete next[connectionId];
      return next;
    });

    try {
      if (action === 'accept') {
        await acceptConnectionRequest(connectionId);
        setIncomingRequests((current) =>
          current.filter((request) => request.connectionId !== connectionId),
        );
        setAcceptNotice('Connection accepted.');
        await loadConnections(false);
      } else {
        await rejectConnectionRequest(connectionId);
        setIncomingRequests((current) =>
          current.filter((request) => request.connectionId !== connectionId),
        );
      }
    } catch (actionError) {
      setActionErrors((current) => ({
        ...current,
        [connectionId]:
          actionError instanceof Error ? actionError.message : 'Could not update this request.',
      }));
    } finally {
      actingIds.current.delete(connectionId);
      setActing((current) => {
        if (!current[connectionId]) {
          return current;
        }

        const next = { ...current };
        delete next[connectionId];
        return next;
      });
    }
  }

  async function cancelOutgoing(connectionId: string) {
    if (actingIds.current.has(connectionId)) {
      return;
    }

    actingIds.current.add(connectionId);
    setActing((current) => ({ ...current, [connectionId]: 'cancel' }));
    setActionErrors((current) => {
      if (!current[connectionId]) {
        return current;
      }

      const next = { ...current };
      delete next[connectionId];
      return next;
    });

    try {
      await cancelConnectionRequest(connectionId);
      setOutgoingRequests((current) =>
        current.filter((request) => request.connectionId !== connectionId),
      );
      setCancelNotice('Request cancelled.');
    } catch (actionError) {
      setActionErrors((current) => ({
        ...current,
        [connectionId]:
          actionError instanceof Error ? actionError.message : 'Could not cancel this request.',
      }));
    } finally {
      actingIds.current.delete(connectionId);
      setActing((current) => {
        if (!current[connectionId]) {
          return current;
        }

        const next = { ...current };
        delete next[connectionId];
        return next;
      });
    }
  }

  function askToRemove(connectionId: string) {
    if (actingIds.current.has(connectionId)) {
      return;
    }

    setConfirmingRemoveIds((current) => ({ ...current, [connectionId]: true }));
  }

  function dismissRemovePrompt(connectionId: string) {
    if (actingIds.current.has(connectionId)) {
      return;
    }

    setConfirmingRemoveIds((current) => {
      if (!current[connectionId]) {
        return current;
      }

      const next = { ...current };
      delete next[connectionId];
      return next;
    });
  }

  async function removeAccepted(connectionId: string) {
    if (actingIds.current.has(connectionId)) {
      return;
    }

    actingIds.current.add(connectionId);
    setActing((current) => ({ ...current, [connectionId]: 'remove' }));
    setActionErrors((current) => {
      if (!current[connectionId]) {
        return current;
      }

      const next = { ...current };
      delete next[connectionId];
      return next;
    });

    try {
      await removeConnection(connectionId);
      setConnections((current) =>
        current.filter((connection) => connection.connectionId !== connectionId),
      );
      setConfirmingRemoveIds((current) => {
        if (!current[connectionId]) {
          return current;
        }

        const next = { ...current };
        delete next[connectionId];
        return next;
      });
      setRemoveNotice('Connection removed.');
    } catch (actionError) {
      setActionErrors((current) => ({
        ...current,
        [connectionId]:
          actionError instanceof Error ? actionError.message : 'Could not remove this connection.',
      }));
    } finally {
      actingIds.current.delete(connectionId);
      setActing((current) => {
        if (!current[connectionId]) {
          return current;
        }

        const next = { ...current };
        delete next[connectionId];
        return next;
      });
    }
  }

  async function openChat(userId: string) {
    if (openingChatIdsRef.current.has(userId)) {
      return;
    }

    openingChatIdsRef.current.add(userId);
    setOpeningChatIds((current) => ({ ...current, [userId]: true }));
    setOpenChatErrors((current) => {
      if (!current[userId]) {
        return current;
      }

      const next = { ...current };
      delete next[userId];
      return next;
    });

    try {
      const conversation = await createConversation(userId);
      router.push({
        pathname: '/chat',
        params: {
          userId,
          conversationId: conversation.id,
        },
      });
    } catch (openError) {
      setOpenChatErrors((current) => ({
        ...current,
        [userId]:
          openError instanceof Error ? openError.message : 'Could not open conversation.',
      }));
    } finally {
      openingChatIdsRef.current.delete(userId);
      setOpeningChatIds((current) => {
        if (!current[userId]) {
          return current;
        }

        const next = { ...current };
        delete next[userId];
        return next;
      });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void refreshAll()}
            tintColor={Brand.teal}
            colors={[Brand.teal]}
          />
        }>
        <View style={styles.header}>
          <ThemedText type="subtitle">Connections</ThemedText>
          {acceptNotice ? (
            <ThemedText type="small" style={styles.success}>
              {acceptNotice}
            </ThemedText>
          ) : null}
          {removeNotice ? (
            <ThemedText type="small" style={styles.success}>
              {removeNotice}
            </ThemedText>
          ) : null}
          {connectionsLoading && connections.length === 0 ? (
            <ActivityIndicator color={Brand.teal} />
          ) : null}
          {connectionsError ? (
            <View style={styles.errorBlock}>
              <ThemedText type="default" style={styles.error}>
                {connectionsError}
              </ThemedText>
              <FormButton
                label="Retry"
                variant="secondary"
                onPress={() => void loadConnections(true)}
              />
            </View>
          ) : null}
        </View>

        {!connectionsLoading && !connectionsError && connections.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
            No connections yet.
          </ThemedText>
        ) : null}

        {connections.map((connection) => {
          const isRemoving = acting[connection.connectionId] === 'remove';
          const isConfirming = confirmingRemoveIds[connection.connectionId] === true;

          return (
            <PersonRow
              key={connection.connectionId}
              user={connection.user}
              opening={openingChatIds[connection.user.id] === true}
              onPress={() => void openChat(connection.user.id)}>
              {isConfirming ? (
                <>
                  <ThemedText type="small" style={styles.confirmPrompt}>
                    Remove this connection?
                  </ThemedText>
                  <View style={styles.actions}>
                    <View style={styles.actionButton}>
                      <FormButton
                        label="Cancel"
                        variant="secondary"
                        disabled={isRemoving}
                        onPress={() => dismissRemovePrompt(connection.connectionId)}
                      />
                    </View>
                    <View style={styles.actionButton}>
                      <FormButton
                        label="Remove"
                        loading={isRemoving}
                        disabled={isRemoving}
                        onPress={() => void removeAccepted(connection.connectionId)}
                      />
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.actions}>
                  <View style={styles.actionButton}>
                    <FormButton
                      label="Remove"
                      variant="secondary"
                      disabled={isRemoving}
                      onPress={() => askToRemove(connection.connectionId)}
                    />
                  </View>
                </View>
              )}
              {actionErrors[connection.connectionId] ? (
                <ThemedText type="small" style={styles.error}>
                  {actionErrors[connection.connectionId]}
                </ThemedText>
              ) : null}
              {openChatErrors[connection.user.id] ? (
                <ThemedText type="small" style={styles.error}>
                  {openChatErrors[connection.user.id]}
                </ThemedText>
              ) : null}
            </PersonRow>
          );
        })}

        <RequestSection
          title="Incoming Requests"
          people={incomingRequests}
          isLoading={incomingLoading}
          error={incomingError}
          emptyText="No incoming requests."
          onRetry={() => void loadIncoming(true)}
          renderPerson={(person) => (
            <PersonRow key={person.connectionId} user={person.user}>
              <View style={styles.actions}>
                <View style={styles.actionButton}>
                  <FormButton
                    label="Accept"
                    loading={acting[person.connectionId] === 'accept'}
                    disabled={acting[person.connectionId] !== undefined}
                    onPress={() => void respondToIncoming(person.connectionId, 'accept')}
                  />
                </View>
                <View style={styles.actionButton}>
                  <FormButton
                    label="Reject"
                    variant="secondary"
                    loading={acting[person.connectionId] === 'reject'}
                    disabled={acting[person.connectionId] !== undefined}
                    onPress={() => void respondToIncoming(person.connectionId, 'reject')}
                  />
                </View>
              </View>
              {actionErrors[person.connectionId] ? (
                <ThemedText type="small" style={styles.error}>
                  {actionErrors[person.connectionId]}
                </ThemedText>
              ) : null}
            </PersonRow>
          )}
        />

        <RequestSection
          title="Sent Requests"
          people={outgoingRequests}
          isLoading={outgoingLoading}
          error={outgoingError}
          emptyText="No sent requests."
          notice={cancelNotice}
          onRetry={() => void loadOutgoing(true)}
          renderPerson={(person) => (
            <PersonRow key={person.connectionId} user={person.user}>
              <View style={styles.actions}>
                <View style={styles.actionButton}>
                  <FormButton
                    label="Cancel"
                    variant="secondary"
                    loading={acting[person.connectionId] === 'cancel'}
                    disabled={acting[person.connectionId] !== undefined}
                    onPress={() => void cancelOutgoing(person.connectionId)}
                  />
                </View>
              </View>
              {actionErrors[person.connectionId] ? (
                <ThemedText type="small" style={styles.error}>
                  {actionErrors[person.connectionId]}
                </ThemedText>
              ) : null}
            </PersonRow>
          )}
        />
      </ScrollView>
    </ThemedView>
  );
}

function RequestSection({
  title,
  people,
  isLoading,
  error,
  emptyText,
  notice,
  onRetry,
  renderPerson,
}: {
  title: string;
  people: ListedPerson[];
  isLoading: boolean;
  error: string;
  emptyText: string;
  notice?: string;
  onRetry: () => void;
  renderPerson?: (person: ListedPerson) => ReactNode;
}) {
  const showEmpty = !isLoading && !error && people.length === 0;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {notice ? (
        <ThemedText type="small" style={styles.success}>
          {notice}
        </ThemedText>
      ) : null}
      {isLoading && people.length === 0 ? <ActivityIndicator color={Brand.teal} /> : null}
      {error ? (
        <View style={styles.errorBlock}>
          <ThemedText type="default" style={styles.error}>
            {error}
          </ThemedText>
          <FormButton label="Retry" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
      {showEmpty ? (
        <ThemedText type="small" themeColor="textSecondary">
          {emptyText}
        </ThemedText>
      ) : null}
      {people.map((person) =>
        renderPerson ? (
          renderPerson(person)
        ) : (
          <PersonRow key={person.connectionId} user={person.user} />
        ),
      )}
    </View>
  );
}

function PersonRow({
  user,
  children,
  onPress,
  opening = false,
}: {
  user: ConnectionUser;
  children?: ReactNode;
  onPress?: () => void;
  opening?: boolean;
}) {
  const initial = user.fullName.trim().charAt(0).toUpperCase() || 'T';
  const identity = (
    <>
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
        {user.isVerified ? (
          <ThemedText type="small" style={styles.verified}>
            Verified
          </ThemedText>
        ) : null}
        {user.isOnline ? (
          <ThemedText type="small" style={styles.online}>
            Online
          </ThemedText>
        ) : null}
      </View>
      {opening ? <ActivityIndicator color={Brand.teal} /> : null}
    </>
  );

  const personLine = onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Message ${user.fullName}`}
      accessibilityState={{ disabled: opening }}
      disabled={opening}
      onPress={onPress}
      style={({ pressed }) => [styles.personLine, pressed && styles.pressed]}>
      {identity}
    </Pressable>
  ) : (
    <View style={styles.personLine}>{identity}</View>
  );

  if (children) {
    return (
      <ThemedView type="backgroundElement" style={styles.incomingCard}>
        {personLine}
        {children}
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      {identity}
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
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  errorBlock: {
    gap: Spacing.three,
  },
  error: {
    color: Brand.danger,
    textAlign: 'center',
  },
  success: {
    color: Brand.teal,
    textAlign: 'center',
  },
  confirmPrompt: {
    textAlign: 'center',
  },
  incomingCard: {
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  personLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
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
});
