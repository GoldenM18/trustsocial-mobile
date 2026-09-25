import { Image } from 'expo-image';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { FormButton } from '@/components/form/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { Brand } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getConversations, type InboxConversation, type Message } from '@/services/api';
import {
  connectInboxSocket,
  type InboxSocketHandle,
  type MessagesReadEvent,
} from '@/services/socket';

export default function MessagesScreen() {
  const { user } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ conversationId?: string | string[] }>();
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);
  const conversationsRef = useRef(conversations);
  const inboxSocketRef = useRef<InboxSocketHandle | null>(null);
  const unreadTrackersRef = useRef<Map<string, UnreadTracker>>(new Map());
  conversationsRef.current = conversations;
  const currentUserIdRef = useRef(user?.userId);
  const viewedConversationRef = useRef('');
  const applyIncomingRef = useRef<(message: Message) => void>(() => {});
  const applyMessagesReadRef = useRef<(event: MessagesReadEvent) => void>(() => {});
  const applyDeletedRef = useRef<(message: Message) => void>(() => {});
  const applyHiddenRef = useRef<(event: { conversationId: string; messageId: string }) => void>(
    () => {},
  );
  const applyEditedRef = useRef<(message: Message) => void>(() => {});
  const applyAttachmentRef = useRef<(message: Message) => void>(() => {});
  currentUserIdRef.current = user?.userId;
  viewedConversationRef.current = isChatPath(pathname) ? firstParam(params.conversationId) : '';

  useEffect(() => {
    void loadConversations(true);
  }, []);

  useEffect(() => {
    const inbox = connectInboxSocket(
      (message) => {
        applyIncomingRef.current(message);
      },
      (event) => {
        applyMessagesReadRef.current(event);
      },
      (message) => {
        applyDeletedRef.current(message);
      },
      (event) => {
        applyHiddenRef.current(event);
      },
      (message) => {
        applyEditedRef.current(message);
      },
      (message) => {
        applyAttachmentRef.current(message);
      },
    );
    inboxSocketRef.current = inbox;

    return () => {
      inbox.disconnect();

      if (inboxSocketRef.current === inbox) {
        inboxSocketRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    inboxSocketRef.current?.joinConversations(
      conversations.map((conversation) => conversation.conversationId),
    );
  }, [conversations]);

  applyIncomingRef.current = (message) => {
    const knownConversation = conversationsRef.current.some((conversation) =>
      isSameConversation(conversation.conversationId, message.conversationId),
    );

    if (!knownConversation) {
      void loadConversations(false);
      return;
    }

    setConversations((current) => {
      const index = current.findIndex((conversation) =>
        isSameConversation(conversation.conversationId, message.conversationId),
      );

      if (index < 0) {
        return current;
      }

      const existing = current[index];
      const fromOtherParticipant = !isSameConversation(message.senderId, currentUserIdRef.current);
      const viewingConversation = isSameConversation(
        message.conversationId,
        viewedConversationRef.current,
      );
      const countAsUnread = fromOtherParticipant && !viewingConversation;
      const tracker = trackerFor(
        unreadTrackersRef.current,
        existing.conversationId,
        existing.unreadCount,
      );

      if (countAsUnread && !tracker.appliedReadIds.has(message.id)) {
        tracker.ids.add(message.id);
      }

      const nextConversation: InboxConversation = {
        ...existing,
        updatedAt: message.createdAt,
        lastMessage: {
          id: message.id,
          content: inboxPreviewContent(message),
          senderId: message.senderId,
          createdAt: message.createdAt,
          deliveredAt: message.deliveredAt,
          readAt: message.readAt,
        },
        unreadCount: tracker.baseline + tracker.ids.size,
      };

      return [
        nextConversation,
        ...current.filter(
          (conversation) =>
            !isSameConversation(conversation.conversationId, message.conversationId),
        ),
      ];
    });
  };

  applyMessagesReadRef.current = (event) => {
    const knownConversation = conversationsRef.current.some((conversation) =>
      isSameConversation(conversation.conversationId, event.conversationId),
    );

    if (!knownConversation) {
      return;
    }

    const markedByCurrentUser =
      event.readBy.length === 0 ||
      isSameConversation(event.readBy, currentUserIdRef.current);

    if (!markedByCurrentUser) {
      return;
    }

    const currentConversation = conversationsRef.current.find((conversation) =>
      isSameConversation(conversation.conversationId, event.conversationId),
    );
    const tracker = trackerFor(
      unreadTrackersRef.current,
      event.conversationId,
      currentConversation?.unreadCount ?? 0,
    );
    const nextUnread = event.readBy.length === 0
      ? clearUnreadTracker(tracker)
      : reduceUnreadTracker(tracker, event.messageIds);

    setConversations((current) => {
      let changed = false;
      const next = current.map((conversation) => {
        if (!isSameConversation(conversation.conversationId, event.conversationId)) {
          return conversation;
        }

        if (conversation.unreadCount === nextUnread) {
          return conversation;
        }

        changed = true;
        return { ...conversation, unreadCount: nextUnread };
      });

      return changed ? next : current;
    });
  };

  applyDeletedRef.current = (message) => {
    setConversations((current) => {
      let changed = false;
      const next = current.map((conversation) => {
        if (
          !isSameConversation(conversation.conversationId, message.conversationId) ||
          !conversation.lastMessage ||
          !isSameConversation(conversation.lastMessage.id, message.id) ||
          conversation.lastMessage.content === 'Message deleted'
        ) {
          return conversation;
        }

        changed = true;
        return {
          ...conversation,
          lastMessage: {
            ...conversation.lastMessage,
            content: 'Message deleted',
          },
        };
      });

      return changed ? next : current;
    });
  };

  applyHiddenRef.current = (event) => {
    const matchesPreview = conversationsRef.current.some(
      (conversation) =>
        isSameConversation(conversation.conversationId, event.conversationId) &&
        !!conversation.lastMessage &&
        isSameConversation(conversation.lastMessage.id, event.messageId),
    );

    if (!matchesPreview) {
      return;
    }

    setConversations((current) =>
      current.map((conversation) => {
        if (
          !isSameConversation(conversation.conversationId, event.conversationId) ||
          !conversation.lastMessage ||
          !isSameConversation(conversation.lastMessage.id, event.messageId)
        ) {
          return conversation;
        }

        return { ...conversation, lastMessage: null };
      }),
    );
    void loadConversations(false);
  };

  applyEditedRef.current = (message) => {
    if (message.deletedForEveryone) {
      return;
    }

    setConversations((current) => {
      let changed = false;
      const next = current.map((conversation) => {
        if (
          !isSameConversation(conversation.conversationId, message.conversationId) ||
          !conversation.lastMessage ||
          !isSameConversation(conversation.lastMessage.id, message.id)
        ) {
          return conversation;
        }

        if (conversation.lastMessage.content === message.content) {
          return conversation;
        }

        changed = true;
        return {
          ...conversation,
          lastMessage: {
            ...conversation.lastMessage,
            content: message.content,
          },
        };
      });

      return changed ? next : current;
    });
  };

  applyAttachmentRef.current = (message) => {
    if (message.deletedForEveryone || message.attachments.length === 0) {
      return;
    }

    setConversations((current) => {
      let changed = false;
      const next = current.map((conversation) => {
        if (
          !conversation.lastMessage ||
          !isSameConversation(conversation.lastMessage.id, message.id) ||
          conversation.lastMessage.content.trim().length > 0
        ) {
          return conversation;
        }

        changed = true;
        return {
          ...conversation,
          lastMessage: {
            ...conversation.lastMessage,
            content: '📷 Image',
          },
        };
      });

      return changed ? next : current;
    });
  };

  async function loadConversations(showSpinner: boolean) {
    const seq = ++requestSeq.current;

    if (showSpinner) {
      setIsLoading(true);
    }

    try {
      const result = await getConversations();

      if (seq !== requestSeq.current) {
        return;
      }

      setConversations(result.conversations);
      rememberServerUnread(unreadTrackersRef.current, result.conversations);
      setError('');
    } catch (loadError) {
      if (seq !== requestSeq.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : 'Could not load conversations.');
    } finally {
      if (seq === requestSeq.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  function refresh() {
    setIsRefreshing(true);
    void loadConversations(false);
  }

  function openConversation(conversation: InboxConversation) {
    router.push({
      pathname: '/chat',
      params: {
        userId: conversation.otherParticipant.id,
        conversationId: conversation.conversationId,
      },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}>
        <ThemedText type="title">Messages</ThemedText>

        {isLoading ? <ActivityIndicator color={Brand.teal} /> : null}

        {error ? (
          <View style={styles.errorBlock}>
            <ThemedText type="default" style={styles.error}>
              {error}
            </ThemedText>
            <FormButton label="Retry" variant="secondary" onPress={() => void loadConversations(true)} />
          </View>
        ) : null}

        {!isLoading && !error && conversations.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
            No conversations yet.
          </ThemedText>
        ) : null}

        {!isLoading && !error
          ? conversations.map((conversation) => (
              <ConversationRow
                key={conversation.conversationId}
                conversation={conversation}
                onPress={() => openConversation(conversation)}
              />
            ))
          : null}
      </ScrollView>
    </ThemedView>
  );
}

type UnreadTracker = {
  baseline: number;
  ids: Set<string>;
  appliedReadIds: Set<string>;
};

function isChatPath(pathname: string): boolean {
  return pathname === '/chat' || pathname.endsWith('/chat');
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function isSameConversation(left: string, right: string | undefined): boolean {
  if (!right) {
    return false;
  }

  return left.toLowerCase() === right.toLowerCase();
}

function trackerKey(conversationId: string): string {
  return conversationId.toLowerCase();
}

function trackerFor(
  trackers: Map<string, UnreadTracker>,
  conversationId: string,
  fallbackCount: number,
): UnreadTracker {
  const key = trackerKey(conversationId);
  const existing = trackers.get(key);

  if (existing) {
    return existing;
  }

  const created: UnreadTracker = {
    baseline: Math.max(0, fallbackCount),
    ids: new Set<string>(),
    appliedReadIds: new Set<string>(),
  };
  trackers.set(key, created);
  return created;
}

function rememberServerUnread(
  trackers: Map<string, UnreadTracker>,
  conversations: InboxConversation[],
): void {
  trackers.clear();

  for (const conversation of conversations) {
    trackers.set(trackerKey(conversation.conversationId), {
      baseline: Math.max(0, conversation.unreadCount),
      ids: new Set<string>(),
      appliedReadIds: new Set<string>(),
    });
  }
}

function clearUnreadTracker(tracker: UnreadTracker): number {
  tracker.baseline = 0;
  tracker.ids.clear();
  return 0;
}

function inboxPreviewContent(message: Message): string {
  if (message.deletedForEveryone || message.content === 'Message deleted') {
    return 'Message deleted';
  }

  const text = message.content.trim();
  return text.length > 0 ? message.content : '📷 Image';
}

function reduceUnreadTracker(tracker: UnreadTracker, messageIds: string[]): number {
  let unknownIds = 0;

  for (const messageId of messageIds) {
    if (tracker.appliedReadIds.has(messageId)) {
      continue;
    }

    tracker.appliedReadIds.add(messageId);

    if (!tracker.ids.delete(messageId)) {
      unknownIds += 1;
    }
  }

  tracker.baseline = Math.max(0, tracker.baseline - unknownIds);
  return tracker.baseline + tracker.ids.size;
}

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: InboxConversation;
  onPress: () => void;
}) {
  const person = conversation.otherParticipant;
  const initial = person.fullName.trim().charAt(0).toUpperCase() || 'T';
  const preview = conversation.lastMessage?.content || 'No messages yet.';
  const previewTime = conversation.lastMessage?.createdAt || conversation.updatedAt;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${person.fullName}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <ThemedView type="backgroundElement" style={styles.row}>
        {person.profilePhotoUrl ? (
          <Image
            source={{ uri: person.profilePhotoUrl }}
            style={styles.photo}
            contentFit="cover"
            accessibilityLabel={`${person.fullName} profile photo`}
          />
        ) : (
          <ThemedView style={[styles.photo, styles.photoFallback]}>
            <ThemedText style={styles.photoGlyph}>{initial}</ThemedText>
          </ThemedView>
        )}
        <View style={styles.details}>
          <ThemedText type="default">{person.fullName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            @{person.username}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {preview}
          </ThemedText>
          {person.isVerified ? (
            <ThemedText type="small" style={styles.verified}>
              Verified
            </ThemedText>
          ) : null}
          {person.isOnline ? (
            <ThemedText type="small" style={styles.online}>
              Online
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.meta}>
          {previewTime ? (
            <ThemedText type="small" themeColor="textSecondary">
              {formatInboxTime(previewTime)}
            </ThemedText>
          ) : null}
          {conversation.unreadCount > 0 ? (
            <ThemedView style={styles.badge}>
              <ThemedText type="small" style={styles.badgeText}>
                {conversation.unreadCount}
              </ThemedText>
            </ThemedView>
          ) : null}
        </View>
      </ThemedView>
    </Pressable>
  );
}

function formatInboxTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
  meta: {
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  verified: {
    color: Brand.teal,
  },
  online: {
    color: Brand.teal,
  },
  badge: {
    minWidth: 24,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    backgroundColor: Brand.teal,
    alignItems: 'center',
  },
  badgeText: {
    color: '#ffffff',
  },
});
