import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { FormButton } from '@/components/form/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { Brand } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getConversationMessages,
  getPublicProfile,
  type Message,
  type PublicProfile,
} from '@/services/api';
import {
  connectChatSocket,
  type ChatSocketHandle,
  type ChatSocketStatus,
  type MessagesReadEvent,
} from '@/services/socket';

const MESSAGE_MAX_LENGTH = 5000;

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    userId?: string | string[];
    conversationId?: string | string[];
  }>();
  const userId = firstParam(params.userId);
  const conversationId = firstParam(params.conversationId);
  const { user } = useAuth();
  const theme = useTheme();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [socketStatus, setSocketStatus] = useState<ChatSocketStatus>('connecting');
  const [connectionError, setConnectionError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const requestSeq = useRef(0);
  const presenceFromSocketRef = useRef(false);
  const chatUserIdRef = useRef(userId);
  chatUserIdRef.current = userId;
  const sendingRef = useRef(false);
  const listRef = useRef<FlatList<Message>>(null);
  const chatSocketRef = useRef<ChatSocketHandle | null>(null);
  const socketStatusRef = useRef<ChatSocketStatus>('connecting');
  const markedReadConversationRef = useRef('');
  const trimmedDraft = draft.trim();
  const canSend = trimmedDraft.length > 0 && !isSending;

  useEffect(() => {
    void loadChat();
  }, [userId, conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const handle = connectChatSocket({
      conversationId,
      onStatus(status) {
        socketStatusRef.current = status;
        setSocketStatus(status);

        if (status !== 'connected') {
          setIsOtherUserTyping(false);
        }
      },
      onMessage(message) {
        appendMessage(message);
      },
      onConnectionError(message) {
        setConnectionError(message);
      },
      onJoinError(message) {
        setJoinError(message);
      },
      onUserOnline(presenceUserId) {
        if (isSameUser(presenceUserId, chatUserIdRef.current)) {
          presenceFromSocketRef.current = true;
          setIsOtherUserOnline(true);
        }
      },
      onUserOffline(presenceUserId) {
        if (isSameUser(presenceUserId, chatUserIdRef.current)) {
          presenceFromSocketRef.current = true;
          setIsOtherUserOnline(false);
        }
      },
      onUserTyping(typingUserId) {
        if (isSameUser(typingUserId, chatUserIdRef.current)) {
          setIsOtherUserTyping(true);
        }
      },
      onUserStoppedTyping(typingUserId) {
        if (isSameUser(typingUserId, chatUserIdRef.current)) {
          setIsOtherUserTyping(false);
        }
      },
      onMessagesRead(event) {
        markMessagesRead(event);
      },
    });
    chatSocketRef.current = handle;

    return () => {
      setIsOtherUserTyping(false);
      handle.disconnect();

      if (chatSocketRef.current === handle) {
        chatSocketRef.current = null;
      }
    };
  }, [conversationId]);

  useEffect(() => {
    if (socketStatus !== 'connected') {
      markedReadConversationRef.current = '';
      return;
    }

    if (!conversationId || isLoading || error) {
      return;
    }

    const socket = chatSocketRef.current;

    if (!socket || markedReadConversationRef.current === conversationId) {
      return;
    }

    markedReadConversationRef.current = conversationId;

    void socket.markConversationAsRead().catch(() => {
      if (markedReadConversationRef.current === conversationId) {
        markedReadConversationRef.current = '';
      }
    });
  }, [conversationId, isLoading, error, socketStatus]);

  async function loadChat() {
    const seq = ++requestSeq.current;

    if (!userId || !conversationId) {
      setProfile(null);
      setMessages([]);
      setError('A conversation is required.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      presenceFromSocketRef.current = false;

      const [nextProfile, history] = await Promise.all([
        getPublicProfile(userId),
        getConversationMessages(conversationId),
      ]);

      if (seq !== requestSeq.current) {
        return;
      }

      setProfile(nextProfile);
      setIsOtherUserOnline((current) =>
        presenceFromSocketRef.current ? current : nextProfile.isOnline,
      );
      setMessages((current) => mergeMessages(history.messages, current));
    } catch (loadError) {
      if (seq !== requestSeq.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : 'Could not load messages.');
    } finally {
      if (seq === requestSeq.current) {
        setIsLoading(false);
      }
    }
  }

  function appendMessage(message: Message) {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) {
        return current;
      }

      return [...current, message];
    });
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
  }

  function markMessagesRead(event: MessagesReadEvent) {
    if (!isSameUser(event.conversationId, conversationId) || !Array.isArray(event.messageIds)) {
      return;
    }

    const readIds = new Set(event.messageIds);

    if (readIds.size === 0) {
      return;
    }

    const readAt = new Date().toISOString();

    setMessages((current) => {
      let changed = false;
      const next = current.map((message) => {
        if (!isSameUser(message.conversationId, conversationId) || !readIds.has(message.id)) {
          return message;
        }

        changed = true;
        return { ...message, readAt };
      });

      return changed ? next : current;
    });
  }

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/connections');
  }

  async function sendMessage() {
    const content = draft.trim();

    if (!conversationId || sendingRef.current || content.length === 0) {
      return;
    }

    if (content.length > MESSAGE_MAX_LENGTH) {
      setSendError('Message must be at most 5000 characters.');
      return;
    }

    if (!chatSocketRef.current || socketStatusRef.current === 'offline') {
      setSendError('Chat is offline.');
      return;
    }

    sendingRef.current = true;
    setIsSending(true);
    setSendError('');

    try {
      await chatSocketRef.current.sendMessage(conversationId, content);
      setDraft('');
    } catch (sendFailure) {
      setSendError(
        sendFailure instanceof Error ? sendFailure.message : 'Could not send message.',
      );
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  const initial = profile?.fullName.trim().charAt(0).toUpperCase() || 'T';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <FormButton label="Back" variant="secondary" onPress={goBack} />
        {profile ? (
          <View style={styles.person}>
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
            <View style={styles.personDetails}>
              <ThemedText type="default">{profile.fullName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                @{profile.username}
              </ThemedText>
              {profile.isVerified ? (
                <ThemedText type="small" style={styles.verified}>
                  Verified
                </ThemedText>
              ) : null}
              {isOtherUserOnline ? (
                <ThemedText type="small" style={styles.online}>
                  Online
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Offline
                </ThemedText>
              )}
            </View>
          </View>
        ) : null}
        {conversationId ? (
          <ThemedText type="small" themeColor="textSecondary">
            {socketStatusLabel(socketStatus)}
          </ThemedText>
        ) : null}
        {connectionError ? (
          <ThemedText type="small" style={styles.sendError}>
            {connectionError}
          </ThemedText>
        ) : null}
        {joinError ? (
          <ThemedText type="small" style={styles.sendError}>
            {joinError}
          </ThemedText>
        ) : null}
        {isLoading ? <ActivityIndicator color={Brand.teal} /> : null}
        {error ? (
          <View style={styles.errorBlock}>
            <ThemedText type="default" style={styles.error}>
              {error}
            </ThemedText>
            <FormButton label="Retry" variant="secondary" onPress={() => void loadChat()} />
          </View>
        ) : null}
      </View>

      {!isLoading && !error ? (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          ListEmptyComponent={
            <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
              No messages yet.
            </ThemedText>
          }
          renderItem={({ item }) => (
            <MessageBubble message={item} isMine={isSameUser(item.senderId, user?.userId)} />
          )}
        />
      ) : null}

      {!isLoading && !error ? (
        <View style={styles.composer}>
          {isOtherUserTyping ? (
            <ThemedText type="small" themeColor="textSecondary">
              {profile?.fullName.trim() || 'They'} is typing...
            </ThemedText>
          ) : null}
          {sendError ? (
            <ThemedText type="small" style={styles.sendError}>
              {sendError}
            </ThemedText>
          ) : null}
          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              placeholderTextColor={theme.textSecondary}
              editable={!isSending}
              multiline
              maxLength={MESSAGE_MAX_LENGTH}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                },
              ]}
            />
            <View style={styles.sendButton}>
              <FormButton
                label="Send"
                loading={isSending}
                disabled={!canSend}
                onPress={() => void sendMessage()}
              />
            </View>
          </View>
        </View>
      ) : null}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function MessageBubble({ message, isMine }: { message: Message; isMine: boolean }) {
  return (
    <View style={[styles.bubbleRow, isMine ? styles.mineRow : styles.theirRow]}>
      <ThemedView
        type={isMine ? undefined : 'backgroundElement'}
        style={[styles.bubble, isMine ? styles.mineBubble : styles.theirBubble]}>
        <ThemedText type="default" style={isMine ? styles.mineText : undefined}>
          {message.content}
        </ThemedText>
        <ThemedText type="small" style={isMine ? styles.mineTime : undefined} themeColor={isMine ? undefined : 'textSecondary'}>
          {formatMessageTime(message.createdAt)}
        </ThemedText>
        {isMine ? (
          <ThemedText
            type="small"
            style={styles.mineTime}
            accessibilityLabel={message.readAt != null ? 'Read' : 'Sent'}>
            {message.readAt != null ? '✓✓' : '✓'}
          </ThemedText>
        ) : null}
      </ThemedView>
    </View>
  );
}

function mergeMessages(history: Message[], current: Message[]): Message[] {
  const ids = new Set(history.map((message) => message.id));
  const realtime = current.filter((message) => !ids.has(message.id));
  return [...history, ...realtime];
}

function socketStatusLabel(status: ChatSocketStatus): string {
  if (status === 'connected') {
    return 'Connected';
  }

  if (status === 'reconnecting') {
    return 'Reconnecting...';
  }

  if (status === 'offline') {
    return 'Offline';
  }

  return 'Connecting...';
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function isSameUser(left: string, right: string | undefined): boolean {
  if (!right) {
    return false;
  }

  return left.toLowerCase() === right.toLowerCase();
}

function formatMessageTime(value: string): string {
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
  header: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  personDetails: {
    flex: 1,
    gap: Spacing.half,
  },
  photo: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  photoFallback: {
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoGlyph: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 700,
  },
  verified: {
    color: Brand.teal,
  },
  online: {
    color: Brand.teal,
  },
  errorBlock: {
    gap: Spacing.three,
  },
  error: {
    color: Brand.danger,
    textAlign: 'center',
  },
  messages: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    flexGrow: 1,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  bubbleRow: {
    width: '100%',
  },
  mineRow: {
    alignItems: 'flex-end',
  },
  theirRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  mineBubble: {
    backgroundColor: Brand.teal,
  },
  theirBubble: {},
  mineText: {
    color: '#ffffff',
  },
  mineTime: {
    color: '#ffffff',
  },
  composer: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.two,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  sendButton: {
    width: 96,
  },
  sendError: {
    color: Brand.danger,
    textAlign: 'center',
  },
});
