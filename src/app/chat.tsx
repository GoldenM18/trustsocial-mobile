import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useCallSession } from '@/call/call-session';
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
  messageImageSource,
  searchConversationMessages,
  uploadMessageImage,
  type Message,
  type MessageAttachment,
  type PublicProfile,
} from '@/services/api';
import { getAccessToken } from '@/services/auth-storage';
import {
  connectChatSocket,
  type ChatSocketHandle,
  type ChatSocketStatus,
  type MessageReactionsUpdate,
  type MessagesDeliveredEvent,
  type MessagesReadEvent,
} from '@/services/socket';

const MESSAGE_MAX_LENGTH = 5000;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 20;
const HISTORY_PAGE_SIZE = 50;
const HISTORY_PAGE_CAP = 100;
const MESSAGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const MESSAGE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MESSAGE_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '😡'] as const;

type SelectedChatImage = {
  uri: string;
  mimeType: string;
  fileName?: string | null;
  file?: Blob;
};

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    userId?: string | string[];
    conversationId?: string | string[];
  }>();
  const userId = firstParam(params.userId);
  const conversationId = firstParam(params.conversationId);
  const { user } = useAuth();
  const { startOutgoing } = useCallSession();
  const theme = useTheme();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [replyToMessageId, setReplyToMessageId] = useState('');
  const [selectedImage, setSelectedImage] = useState<SelectedChatImage | null>(null);
  const [pendingAttachmentMessageId, setPendingAttachmentMessageId] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [reactionError, setReactionError] = useState('');
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState('');
  const [pendingReactionMessageId, setPendingReactionMessageId] = useState('');
  const [menuMessageId, setMenuMessageId] = useState('');
  const [deleteChoiceMessageId, setDeleteChoiceMessageId] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchNotice, setSearchNotice] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState('');
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
  const searchSeq = useRef(0);
  const locatingSearchResult = useRef(false);
  const chatSocketRef = useRef<ChatSocketHandle | null>(null);
  const socketStatusRef = useRef<ChatSocketStatus>('connecting');
  const markedReadConversationRef = useRef('');
  const markedDeliveredConversationRef = useRef('');
  const trimmedDraft = draft.trim();
  const canSend = (trimmedDraft.length > 0 || selectedImage !== null) && !isSending && !isUploadingImage;
  const replyTarget = replyToMessageId
    ? messages.find((message) => message.id === replyToMessageId) ?? null
    : null;

  useEffect(() => {
    void getAccessToken().then((token) => {
      setAccessToken(token ?? '');
    });
  }, []);

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
      onMessagesDelivered(event) {
        markMessagesDelivered(event);
      },
      onMessageDeletedForEveryone(message) {
        applyDeletedMessage(message);
      },
      onMessageHiddenForMe(event) {
        if (isSameUser(event.conversationId, conversationId)) {
          hideMessage(event.messageId);
        }
      },
      onMessageEdited(message) {
        applyEditedMessage(message);
      },
      onMessageReactionsUpdated(event) {
        applyReactionUpdate(event);
      },
      onMessageAttachmentAdded(message) {
        applyMessageAttachments(message);
      },
      onCallHistoryUpdated(event) {
        console.log('[CALL HISTORY] received', event);
        void loadChat();
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

  useEffect(() => {
    if (socketStatus !== 'connected') {
      markedDeliveredConversationRef.current = '';
      return;
    }

    if (!conversationId || isLoading || error) {
      return;
    }

    const socket = chatSocketRef.current;

    if (!socket || markedDeliveredConversationRef.current === conversationId) {
      return;
    }

    markedDeliveredConversationRef.current = conversationId;

    void socket.markConversationAsDelivered(conversationId).catch(() => {
      if (markedDeliveredConversationRef.current === conversationId) {
        markedDeliveredConversationRef.current = '';
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
      console.log(
        '[CHAT HISTORY]',
        history.messages.map((message) => ({
          id: message.id,
          type: message.messageType,
          status: message.callStatus,
          duration: message.callDurationSeconds,
          createdAt: message.createdAt,
        })),
      );

      console.log(
        '[CHAT HISTORY]',
        history.messages.map((message) => ({
          id: message.id,
          type: message.messageType,
          status: message.callStatus,
          duration: message.callDurationSeconds,
          createdAt: message.createdAt,
        })),
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

  useEffect(() => {
    if (!searchOpen || !conversationId) {
      return;
    }

    const query = searchQuery.trim();

    if (query.length === 0) {
      searchSeq.current += 1;
      setSearchResults([]);
      setSearchPage(1);
      setSearchTotalPages(0);
      setSearchLoading(false);
      setSearchError('');
      return;
    }

    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      void runSearch(query, 1, seq, false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [searchOpen, searchQuery, conversationId]);

  useEffect(() => {
    if (!highlightedMessageId) {
      return;
    }

    const index = messages.findIndex((item) => item.id === highlightedMessageId);

    if (index < 0) {
      if (!locatingSearchResult.current) {
        setHighlightedMessageId('');
      }

      return;
    }

    const scrollTimer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }, 80);
    const clearTimer = setTimeout(() => {
      setHighlightedMessageId((current) => (current === highlightedMessageId ? '' : current));
    }, 2500);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [highlightedMessageId, messages]);

  async function runSearch(query: string, page: number, seq: number, append: boolean) {
    if (!conversationId) {
      return;
    }

    setSearchLoading(true);
    setSearchError('');

    try {
      const result = await searchConversationMessages(conversationId, query, page, SEARCH_PAGE_SIZE);

      if (seq !== searchSeq.current) {
        return;
      }

      setSearchResults((current) => {
        const next = append ? [...current, ...result.items] : result.items;
        const seen = new Set<string>();

        return next.filter((item) => {
          if (seen.has(item.id)) {
            return false;
          }

          seen.add(item.id);
          return true;
        });
      });
      setSearchPage(result.page);
      setSearchTotalPages(result.totalPages);
    } catch (searchFailure) {
      if (seq !== searchSeq.current) {
        return;
      }

      setSearchError(searchFailure instanceof Error ? searchFailure.message : 'Could not search messages.');
    } finally {
      if (seq === searchSeq.current) {
        setSearchLoading(false);
      }
    }
  }

  function closeSearch() {
    searchSeq.current += 1;
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchPage(1);
    setSearchTotalPages(0);
    setSearchLoading(false);
    setSearchError('');
    setSearchNotice('');
  }

  function loadMoreSearchResults() {
    const query = searchQuery.trim();

    if (!query || searchLoading || searchPage >= searchTotalPages) {
      return;
    }

    void runSearch(query, searchPage + 1, searchSeq.current, true);
  }

  async function openSearchResult(result: Message) {
    if (!conversationId || locatingSearchResult.current) {
      return;
    }

    setSearchNotice('');
    const existing = messages.find((item) => item.id === result.id);

    if (existing) {
      if (existing.deletedForEveryone) {
        setSearchNotice('This message was deleted.');
      }

      setHighlightedMessageId(existing.id);
      return;
    }

    locatingSearchResult.current = true;
    setSearchLoading(true);

    try {
      const collected: Message[] = [];
      let page = 1;
      let totalPages = 1;
      let found: Message | undefined;

      do {
        const history = await getConversationMessages(conversationId, page, HISTORY_PAGE_SIZE);
        totalPages = history.totalPages;
        collected.push(...history.messages);
        found = history.messages.find((item) => item.id === result.id);
        page += 1;
      } while (!found && page <= totalPages && page <= HISTORY_PAGE_CAP);

      if (!found) {
        setSearchNotice('This message is no longer available.');
        return;
      }

      setMessages((current) => mergeLoadedMessages(collected, current));
      setHighlightedMessageId(found.id);

      if (found.deletedForEveryone) {
        setSearchNotice('This message was deleted.');
      }
    } catch (locateError) {
      setSearchNotice(locateError instanceof Error ? locateError.message : 'Could not open that message.');
    } finally {
      locatingSearchResult.current = false;
      setSearchLoading(false);
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

  function markMessagesDelivered(event: MessagesDeliveredEvent) {
    if (!isSameUser(event.conversationId, conversationId) || !Array.isArray(event.messageIds)) {
      return;
    }

    const deliveredIds = new Set(event.messageIds);

    if (deliveredIds.size === 0) {
      return;
    }

    const deliveredAt = new Date().toISOString();

    setMessages((current) => {
      let changed = false;
      const next = current.map((message) => {
        if (!isSameUser(message.conversationId, conversationId) || !deliveredIds.has(message.id)) {
          return message;
        }

        changed = true;
        return { ...message, deliveredAt };
      });

      return changed ? next : current;
    });
  }

  function applyDeletedMessage(message: Message) {
    setEditingMessage((current) => (current?.id === message.id ? null : current));
    setReactionPickerMessageId((current) => (current === message.id ? '' : current));
    setMenuMessageId((current) => (current === message.id ? '' : current));
    setDeleteChoiceMessageId((current) => (current === message.id ? '' : current));
    setMessages((current) =>
      current.map((item) => {
        if (item.id === message.id) {
          return {
            ...item,
            content: 'Message deleted',
            deletedForEveryone: true,
            attachments: [],
            deliveredAt: message.deliveredAt,
            readAt: message.readAt,
            editedAt: message.editedAt ?? item.editedAt,
          };
        }

        if (item.replyTo?.messageId === message.id) {
          return {
            ...item,
            replyTo: {
              ...item.replyTo,
              content: 'Message deleted',
              isDeleted: true,
            },
          };
        }

        return item;
      }),
    );
  }

  function hideMessage(messageId: string) {
    setEditingMessage((current) => (current?.id === messageId ? null : current));
    setReplyToMessageId((current) => (current === messageId ? '' : current));
    setReactionPickerMessageId((current) => (current === messageId ? '' : current));
    setMenuMessageId((current) => (current === messageId ? '' : current));
    setDeleteChoiceMessageId((current) => (current === messageId ? '' : current));
    setMessages((current) =>
      current
        .filter((item) => item.id !== messageId)
        .map((item) =>
          item.replyTo?.messageId === messageId
            ? {
                ...item,
                replyTo: {
                  ...item.replyTo,
                  content: 'Message deleted',
                  isDeleted: true,
                },
              }
            : item,
        ),
    );
  }

  function applyEditedMessage(message: Message) {
    setMessages((current) =>
      current.map((item) => {
        if (item.id === message.id) {
          return {
            ...item,
            content: message.content,
            createdAt: item.createdAt,
            editedAt: message.editedAt,
            deliveredAt: message.deliveredAt,
            readAt: message.readAt,
          };
        }

        if (item.replyTo?.messageId === message.id && !item.replyTo.isDeleted) {
          return {
            ...item,
            replyTo: {
              ...item.replyTo,
              content: message.content,
            },
          };
        }

        return item;
      }),
    );
  }

  function applyMessageAttachments(message: Message) {
    if (message.deletedForEveryone) {
      return;
    }

    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, attachments: message.attachments } : item)),
    );
  }

  function mergeAttachment(messageId: string, attachment: MessageAttachment) {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? {
              ...item,
              attachments: [
                ...item.attachments.filter((existing) => existing.id !== attachment.id),
                attachment,
              ],
            }
          : item,
      ),
    );
  }

  function applyReactionUpdate(event: MessageReactionsUpdate) {
    setMessages((current) =>
      current.map((item) => (item.id === event.messageId ? { ...item, reactions: event.reactions } : item)),
    );
  }

  async function chooseReaction(message: Message, reaction: string) {
    const socket = chatSocketRef.current;

    if (message.deletedForEveryone || pendingReactionMessageId || !conversationId) {
      return;
    }

    if (!socket || socketStatus === 'offline') {
      setReactionError('Chat is offline.');
      return;
    }

    const selected = message.reactions.find((item) => item.reactedByMe)?.reaction;
    setPendingReactionMessageId(message.id);
    setReactionError('');

    try {
      if (selected === reaction) {
        await socket.removeReaction(message.id);
      } else {
        await socket.setReaction(message.id, reaction);
      }

      setReactionPickerMessageId('');
      setMenuMessageId('');
      setDeleteChoiceMessageId('');
    } catch (nextError) {
      setReactionError(nextError instanceof Error ? nextError.message : 'Could not update reaction.');
    } finally {
      setPendingReactionMessageId('');
    }
  }

  function requestEdit(message: Message) {
    if (message.deletedForEveryone) {
      return;
    }

    if (!isUploadingImage) {
      setSelectedImage(null);
      setPendingAttachmentMessageId('');
    }
    setReplyToMessageId('');
    setMenuMessageId('');
    setDeleteChoiceMessageId('');
    setReactionPickerMessageId('');
    setEditingMessage(message);
    setEditDraft(message.content);
    setEditError('');
  }

  function requestReply(message: Message) {
    setEditingMessage(null);
    setEditDraft('');
    setEditError('');
    setMenuMessageId('');
    setDeleteChoiceMessageId('');
    setReactionPickerMessageId('');
    setReplyToMessageId(message.id);
  }

  function toggleMessageMenu(messageId: string) {
    setDeleteChoiceMessageId('');
    setReactionPickerMessageId('');
    setMenuMessageId((current) => (current === messageId ? '' : messageId));
  }

  function openReactionPicker(messageId: string) {
    setMenuMessageId('');
    setDeleteChoiceMessageId('');
    setReactionPickerMessageId(messageId);
  }

  function scrollToMessage(messageId: string) {
    const index = messages.findIndex((item) => item.id === messageId);

    if (index < 0) {
      return;
    }

    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }

  function cancelEdit() {
    setEditingMessage(null);
    setEditDraft('');
    setEditError('');
  }

  async function saveEdit() {
    const content = editDraft.trim();
    const message = editingMessage;
    const socket = chatSocketRef.current;

    if (!message || !conversationId || isSavingEdit) {
      return;
    }

    if (content.length === 0) {
      setEditError('Message content is required.');
      return;
    }

    if (content.length > MESSAGE_MAX_LENGTH) {
      setEditError('Message must be at most 5000 characters.');
      return;
    }

    if (!socket || socketStatusRef.current === 'offline') {
      setEditError('Chat is offline.');
      return;
    }

    setIsSavingEdit(true);
    setEditError('');

    try {
      await socket.editMessage(message.id, content);
      setEditingMessage(null);
      setEditDraft('');
    } catch (editFailure) {
      setEditError(editFailure instanceof Error ? editFailure.message : 'Could not edit message.');
    } finally {
      setIsSavingEdit(false);
    }
  }

  function requestDelete(message: Message) {
    setMenuMessageId('');
    setReactionPickerMessageId('');
    setDeleteChoiceMessageId(message.id);
  }

  async function performDelete(message: Message, scope: 'me' | 'everyone') {
    const socket = chatSocketRef.current;

    if (!socket || !conversationId || deletingMessageId) {
      return;
    }

    setDeletingMessageId(message.id);
    setDeleteError('');

    try {
      if (scope === 'everyone') {
        await socket.deleteMessageForEveryone(conversationId, message.id);
      } else {
        await socket.deleteMessageForMe(conversationId, message.id);
      }
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure instanceof Error ? deleteFailure.message : 'Could not delete message.',
      );
    } finally {
      setDeletingMessageId('');
    }
  }

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/connections');
  }

  async function uploadSelectedImage(messageId: string, image: SelectedChatImage) {
    if (!conversationId) {
      return;
    }

    setIsUploadingImage(true);
    setSendError('');

    try {
      const attachment = await uploadMessageImage(conversationId, messageId, image);
      mergeAttachment(messageId, attachment);
      setSelectedImage(null);
      setPendingAttachmentMessageId('');
    } catch (uploadFailure) {
      setPendingAttachmentMessageId(messageId);
      setSendError(uploadFailure instanceof Error ? uploadFailure.message : 'Could not upload image.');
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function pickImage() {
    if (isUploadingImage || isSending) {
      return;
    }

    try {
      setSendError('');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setSendError('Photo library access is needed to choose an image.');
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

      if (!asset?.uri || !asset.mimeType || !MESSAGE_IMAGE_MIME_TYPES.has(asset.mimeType)) {
        setSendError('Only JPEG, PNG, WebP, and GIF images are allowed.');
        return;
      }

      if (typeof asset.fileSize === 'number' && asset.fileSize > MESSAGE_IMAGE_MAX_BYTES) {
        setSendError('Image must be at most 5 MB.');
        return;
      }

      setSelectedImage({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        file: asset.file,
      });
    } catch (pickError) {
      setSendError(pickError instanceof Error ? pickError.message : 'Could not choose an image.');
    }
  }

  function cancelSelectedImage() {
    if (isUploadingImage) {
      return;
    }

    setSelectedImage(null);
    setPendingAttachmentMessageId('');
  }

  async function sendMessage() {
    const content = draft.trim();
    const image = selectedImage;

    if (!conversationId || sendingRef.current || isUploadingImage) {
      return;
    }

    if (content.length === 0 && !image) {
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

    if (pendingAttachmentMessageId && image) {
      await uploadSelectedImage(pendingAttachmentMessageId, image);
      return;
    }

    sendingRef.current = true;
    setIsSending(true);
    setSendError('');

    try {
      const created = await chatSocketRef.current.sendMessage(conversationId, content, replyTarget?.id);
      appendMessage(created);
      setDraft('');
      setReplyToMessageId('');

      if (image) {
        setPendingAttachmentMessageId(created.id);
        await uploadSelectedImage(created.id, image);
      }
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
        <View style={styles.headerActions}>
          <FormButton label="Back" variant="secondary" onPress={goBack} />
          {conversationId ? (
            <FormButton
              label={searchOpen ? 'Close' : 'Search'}
              accessibilityLabel={searchOpen ? 'Close search' : 'Search messages'}
              variant="secondary"
              onPress={() => {
                if (searchOpen) {
                  closeSearch();
                  return;
                }

                setSearchOpen(true);
              }}
            />
          ) : null}
          {conversationId ? (
            <FormButton
              label="Call"
              accessibilityLabel="Start voice call"
              variant="secondary"
              onPress={() =>
                startOutgoing(conversationId, profile?.fullName.trim() || profile?.username || 'Voice call')
              }
            />
          ) : null}
        </View>
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

      {searchOpen && !isLoading && !error ? (
        <View style={styles.searchPanel}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search messages"
            accessibilityLabel="Search messages"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.searchInput,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          />
          {searchLoading ? <ActivityIndicator color={Brand.teal} /> : null}
          {searchError ? (
            <ThemedText type="small" style={styles.sendError}>
              {searchError}
            </ThemedText>
          ) : null}
          {searchNotice ? (
            <ThemedText type="small" style={styles.sendError}>
              {searchNotice}
            </ThemedText>
          ) : null}
          {searchQuery.trim().length > 0 && !searchLoading && !searchError && searchResults.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No matches.
            </ThemedText>
          ) : null}
          {searchResults.length > 0 ? (
            <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
              {searchResults.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel="Open search result"
                  onPress={() => void openSearchResult(item)}
                  style={styles.searchResult}>
                  <ThemedText type="small" numberOfLines={2}>
                    {item.content}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatMessageTime(item.createdAt)}
                  </ThemedText>
                </Pressable>
              ))}
              {searchPage < searchTotalPages ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Load more search results"
                  onPress={loadMoreSearchResults}
                  style={styles.searchResult}>
                  <ThemedText type="small">More results</ThemedText>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {!isLoading && !error ? (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.messages}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index),
              animated: true,
            });
          }}
          onContentSizeChange={() => {
            if (
              highlightedMessageId ||
              locatingSearchResult.current ||
              menuMessageId ||
              deleteChoiceMessageId ||
              reactionPickerMessageId
            ) {
              return;
            }

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
            <MessageBubble
              message={item}
              isMine={isSameUser(item.senderId, user?.userId)}
              deleting={deletingMessageId === item.id}
              menuOpen={menuMessageId === item.id}
              deleteChoicesOpen={deleteChoiceMessageId === item.id}
              onOpenMenu={() => toggleMessageMenu(item.id)}
              onEdit={
                isSameUser(item.senderId, user?.userId) && !item.deletedForEveryone
                  ? requestEdit
                  : undefined
              }
              onDelete={
                isSameUser(item.senderId, user?.userId) && !item.deletedForEveryone
                  ? requestDelete
                  : undefined
              }
              onDeleteForMe={(message) => void performDelete(message, 'me')}
              onDeleteForEveryone={(message) => void performDelete(message, 'everyone')}
              onCancelDelete={() => setDeleteChoiceMessageId('')}
              onReact={item.deletedForEveryone ? undefined : chooseReaction}
              pickerOpen={reactionPickerMessageId === item.id}
              reacting={pendingReactionMessageId === item.id}
              onOpenReactions={() => openReactionPicker(item.id)}
              onReply={requestReply}
              onQuotePress={scrollToMessage}
              accessToken={accessToken}
              onOpenImage={setPreviewAttachmentUrl}
              highlighted={item.id === highlightedMessageId}
            />
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
          {deleteError ? (
            <ThemedText type="small" style={styles.sendError}>
              {deleteError}
            </ThemedText>
          ) : null}
          {reactionError ? (
            <ThemedText type="small" style={styles.sendError}>
              {reactionError}
            </ThemedText>
          ) : null}
          {editingMessage ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Editing message
              </ThemedText>
              {editError ? (
                <ThemedText type="small" style={styles.sendError}>
                  {editError}
                </ThemedText>
              ) : null}
              <View style={styles.composerRow}>
                <TextInput
                  value={editDraft}
                  onChangeText={setEditDraft}
                  placeholder="Edit message..."
                  placeholderTextColor={theme.textSecondary}
                  editable={!isSavingEdit}
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
                <View style={styles.editActions}>
                  <FormButton
                    label="Cancel"
                    variant="secondary"
                    disabled={isSavingEdit}
                    onPress={cancelEdit}
                  />
                  <FormButton
                    label="Save"
                    loading={isSavingEdit}
                    disabled={editDraft.trim().length === 0 || isSavingEdit}
                    onPress={() => void saveEdit()}
                  />
                </View>
              </View>
            </>
          ) : (
          <>
          {selectedImage ? (
            <View style={styles.imageComposer}>
              <Image source={{ uri: selectedImage.uri }} style={styles.imageComposerPreview} contentFit="cover" />
              <View style={styles.replyComposerText}>
                <ThemedText type="small">{isUploadingImage ? 'Uploading image...' : 'Image ready to send'}</ThemedText>
              </View>
              {isUploadingImage ? <ActivityIndicator color={Brand.teal} /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel image"
                disabled={isUploadingImage}
                onPress={cancelSelectedImage}>
                <ThemedText type="small">Cancel</ThemedText>
              </Pressable>
            </View>
          ) : null}
          {replyTarget ? (
            <View style={styles.replyComposer}>
              <View style={styles.replyComposerText}>
                <ThemedText type="small">{replySenderLabel(replyTarget, user?.userId, profile)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {replyPreviewText(replyTarget)}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                onPress={() => setReplyToMessageId('')}>
                <ThemedText type="small">Cancel</ThemedText>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add image"
              disabled={isSending || isUploadingImage}
              onPress={() => void pickImage()}
              style={styles.imageButton}>
              <SymbolView
                name={{ ios: 'photo', android: 'photo_library', web: 'photo_library' }}
                size={24}
                tintColor={theme.text}
              />
            </Pressable>
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
                loading={isSending || isUploadingImage}
                disabled={!canSend}
                onPress={() => void sendMessage()}
              />
            </View>
          </View>
          </>
          )}
        </View>
      ) : null}
      </KeyboardAvoidingView>
      <Modal
        visible={previewAttachmentUrl.length > 0}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewAttachmentUrl('')}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close image preview"
          style={styles.previewBackdrop}
          onPress={() => setPreviewAttachmentUrl('')}>
          {previewAttachmentUrl && accessToken ? (
            <AuthedChatImage url={previewAttachmentUrl} token={accessToken} large />
          ) : (
            <ActivityIndicator color="#ffffff" />
          )}
          <ThemedText type="small" style={styles.previewClose}>
            Close
          </ThemedText>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function MessageBubble({
  message,
  isMine,
  deleting,
  menuOpen,
  deleteChoicesOpen,
  onOpenMenu,
  onEdit,
  onDelete,
  onDeleteForMe,
  onDeleteForEveryone,
  onCancelDelete,
  onReact,
  pickerOpen,
  reacting,
  onOpenReactions,
  onReply,
  onQuotePress,
  accessToken,
  onOpenImage,
  highlighted,
}: {
  message: Message;
  isMine: boolean;
  deleting: boolean;
  menuOpen: boolean;
  deleteChoicesOpen: boolean;
  onOpenMenu: () => void;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onDeleteForMe: (message: Message) => void;
  onDeleteForEveryone: (message: Message) => void;
  onCancelDelete: () => void;
  onReact?: (message: Message, reaction: string) => void;
  pickerOpen: boolean;
  reacting: boolean;
  onOpenReactions: () => void;
  onReply?: (message: Message) => void;
  onQuotePress?: (messageId: string) => void;
  accessToken: string;
  onOpenImage: (url: string) => void;
  highlighted: boolean;
}) {
  const theme = useTheme();
  const deleted = message.deletedForEveryone;
  const actionColor = isMine ? styles.mineTime : undefined;
  const hasActions = Boolean(onReply || onReact || onEdit || onDelete);

  return (
    <View style={[styles.bubbleRow, isMine ? styles.mineRow : styles.theirRow]}>
      <View style={styles.bubbleColumn}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open message actions"
          accessibilityState={{ expanded: menuOpen }}
          disabled={!hasActions}
          onPress={onOpenMenu}>
          <ThemedView
            type={isMine ? undefined : 'backgroundElement'}
            style={[
              styles.bubble,
              isMine ? styles.mineBubble : styles.theirBubble,
              highlighted ? styles.highlightedBubble : undefined,
            ]}>
            {!deleted && message.replyTo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show replied message"
                onPress={(event) => {
                  event.stopPropagation();
                  onQuotePress?.(message.replyTo?.messageId ?? '');
                }}
                style={[styles.quote, isMine ? styles.quoteMine : styles.quoteTheirs]}>
                <ThemedText type="small" style={isMine ? styles.mineTime : styles.quoteName} numberOfLines={1}>
                  {message.replyTo.senderName}
                </ThemedText>
                <ThemedText type="small" numberOfLines={2} style={isMine ? styles.mineText : undefined}>
                  {message.replyTo.isDeleted ? 'Message deleted' : message.replyTo.content.trim() || 'Image'}
                </ThemedText>
              </Pressable>
            ) : null}
            {!deleted && message.attachments.length > 0 ? (
              <View style={styles.attachmentList}>
                {message.attachments.map((attachment) => (
                  <Pressable
                    key={attachment.id}
                    accessibilityRole="button"
                    accessibilityLabel="Open image"
                    onPress={(event) => {
                      event.stopPropagation();
                      onOpenImage(attachment.url);
                    }}>
                    {accessToken ? (
                      <AuthedChatImage url={attachment.url} token={accessToken} />
                    ) : (
                      <ActivityIndicator color={Brand.teal} />
                    )}
                  </Pressable>
                ))}
              </View>
            ) : null}
            {message.messageType === 'call' ? (
              <View style={styles.callHistoryCard}>
                <ThemedText
                  type="default"
                  style={[styles.callHistoryTitle, isMine ? styles.mineText : undefined]}>
                  Voice call
                </ThemedText>
                <ThemedText
                  type="small"
                  style={[styles.callHistoryStatus, isMine ? styles.mineTime : undefined]}>
                  {message.callStatus === 'completed'
                    ? `Completed${
                        message.callDurationSeconds != null
                          ? ` • ${Math.floor(message.callDurationSeconds / 60)}m ${message.callDurationSeconds % 60}s`
                          : ''
                      }`
                    : message.callStatus === 'rejected'
                      ? 'Declined'
                      : 'Missed'}
                </ThemedText>
              </View>
            ) : deleted || message.content.trim().length > 0 ? (
              <ThemedText
                type="default"
                style={[isMine ? styles.mineText : undefined, deleted ? styles.deletedText : undefined]}>
                {deleted ? 'Message deleted' : message.content}
              </ThemedText>
            ) : null}
            <View style={styles.metaRow}>
              <ThemedText type="small" style={actionColor} themeColor={isMine ? undefined : 'textSecondary'}>
                {formatMessageTime(message.createdAt)}
              </ThemedText>
              {message.editedAt && !deleted ? (
                <ThemedText type="small" style={actionColor} themeColor={isMine ? undefined : 'textSecondary'}>
                  Edited
                </ThemedText>
              ) : null}
              {isMine ? <SentReceipt message={message} /> : null}
            </View>
          </ThemedView>
        </Pressable>
        {menuOpen && hasActions ? (
          <View style={[styles.actionMenu, isMine ? styles.alignEnd : styles.alignStart, { backgroundColor: theme.backgroundElement }]}>
            {onReply ? (
              <MessageActionButton
                label="Reply"
                icon={{ ios: 'arrowshape.turn.up.left', android: 'reply', web: 'reply' }}
                tintColor={theme.text}
                disabled={deleting}
                onPress={() => onReply(message)}
              />
            ) : null}
            {onReact ? (
              <MessageActionButton
                label="React"
                icon={{ ios: 'face.smiling', android: 'mood', web: 'mood' }}
                tintColor={theme.text}
                disabled={deleting || reacting}
                onPress={onOpenReactions}
              />
            ) : null}
            {onEdit ? (
              <MessageActionButton
                label="Edit message"
                icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                tintColor={theme.text}
                disabled={deleting}
                onPress={() => onEdit(message)}
              />
            ) : null}
            {onDelete ? (
              <MessageActionButton
                label="Delete message"
                icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
                tintColor={Brand.danger}
                destructive
                disabled={deleting}
                onPress={() => onDelete(message)}
              />
            ) : null}
          </View>
        ) : null}
        {deleteChoicesOpen && onDelete ? (
          <View style={[styles.deleteChoices, isMine ? styles.alignEnd : styles.alignStart, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small">Delete this message</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete for me"
              disabled={deleting}
              onPress={() => onDeleteForMe(message)}
              style={styles.deleteChoice}>
              <ThemedText type="small">Delete for me</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete for everyone"
              disabled={deleting}
              onPress={() => onDeleteForEveryone(message)}
              style={styles.deleteChoice}>
              <SymbolView
                name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                size={16}
                tintColor={Brand.danger}
              />
              <ThemedText type="small" style={styles.deleteLabel}>
                {deleting ? 'Deleting...' : 'Delete for everyone'}
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel delete"
              disabled={deleting}
              onPress={onCancelDelete}
              style={styles.deleteChoice}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
        {pickerOpen && onReact ? (
          <View style={[styles.reactionPicker, isMine ? styles.alignEnd : styles.alignStart, { backgroundColor: theme.backgroundElement }]}>
            {MESSAGE_REACTIONS.map((reaction) => {
              const selected = message.reactions.some((item) => item.reaction === reaction && item.reactedByMe);

              return (
                <Pressable
                  key={reaction}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${reaction}`}
                  accessibilityState={{ selected }}
                  disabled={reacting}
                  onPress={() => onReact(message, reaction)}
                  style={[styles.reactionChoice, selected ? styles.reactionChoiceSelected : undefined]}>
                  <ThemedText type="default">{reaction}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {!deleted && message.reactions.length > 0 ? (
          <View style={styles.reactionChips}>
            {message.reactions.map((item) => (
              <Pressable
                key={item.reaction}
                accessibilityRole="button"
                accessibilityState={{ selected: item.reactedByMe }}
                disabled={!onReact || reacting}
                onPress={() => onReact?.(message, item.reaction)}
                style={[styles.reactionChip, item.reactedByMe ? styles.reactionChipSelected : undefined]}>
                <ThemedText
                  type="small"
                  style={item.reactedByMe ? styles.reactionChipSelectedText : styles.reactionChipText}>
                  {item.reaction} {item.count}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MessageActionButton({
  label,
  icon,
  tintColor,
  onPress,
  disabled,
  destructive = false,
}: {
  label: string;
  icon: ComponentProps<typeof SymbolView>['name'];
  tintColor: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, destructive ? styles.actionButtonDestructive : undefined]}>
      <SymbolView name={icon} size={18} tintColor={tintColor} />
      {destructive ? <ThemedText type="small" style={styles.deleteLabel}>Delete</ThemedText> : null}
    </Pressable>
  );
}

function SentReceipt({ message }: { message: Message }) {
  const isRead = message.readAt !== null;
  const isDelivered = message.deliveredAt !== null;

  return (
    <ThemedText
      type="small"
      style={isRead ? styles.mineReadReceipt : styles.mineTime}
      accessibilityLabel={isRead ? 'Read' : isDelivered ? 'Delivered' : 'Sent'}>
      {isRead || isDelivered ? '✓✓' : '✓'}
    </ThemedText>
  );
}

function replySenderLabel(
  message: Message,
  currentUserId: string | undefined,
  profile: PublicProfile | null,
): string {
  if (isSameUser(message.senderId, currentUserId)) {
    return 'You';
  }

  return profile?.fullName.trim() || profile?.username || 'Message';
}

function AuthedChatImage({ url, token, large = false }: { url: string; token: string; large?: boolean }) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <View style={large ? styles.previewImageFrame : styles.chatImageFrame}>
      <Image
        source={messageImageSource(url, token)}
        style={large ? styles.previewImage : styles.chatImage}
        contentFit="contain"
        accessibilityLabel="Message image"
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
      />
      {isLoading ? (
        <View style={styles.imageLoading}>
          <ActivityIndicator color={large ? '#ffffff' : Brand.teal} />
        </View>
      ) : null}
    </View>
  );
}

function replyPreviewText(message: Message): string {
  if (message.deletedForEveryone) {
    return 'Message deleted';
  }

  const compact = message.content.replace(/\s+/g, ' ').trim();

  if (compact.length === 0 && message.attachments.length > 0) {
    return 'Image';
  }

  if (compact.length <= 80) {
    return compact;
  }

  return `${compact.slice(0, 80)}…`;
}

function mergeLoadedMessages(history: Message[], current: Message[]): Message[] {
  const byId = new Map<string, Message>();

  for (const message of history) {
    byId.set(message.id, message);
  }

  for (const message of current) {
    const loaded = byId.get(message.id);
    byId.set(message.id, loaded ? { ...loaded, ...message } : message);
  }

  return [...byId.values()].sort((left, right) => {
    const time = left.createdAt.localeCompare(right.createdAt);
    return time === 0 ? left.id.localeCompare(right.id) : time;
  });
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  searchPanel: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  searchInput: {
    minHeight: 44,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  searchResults: {
    maxHeight: 180,
  },
  searchResult: {
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  highlightedBubble: {
    borderWidth: 2,
    borderColor: Brand.navy,
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
  bubbleColumn: {
    maxWidth: '80%',
    gap: Spacing.half,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    borderRadius: Spacing.three,
    padding: Spacing.half,
  },
  actionButton: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  actionButtonDestructive: {
    flexDirection: 'row',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  deleteLabel: {
    color: Brand.danger,
  },
  alignEnd: {
    alignSelf: 'flex-end',
  },
  alignStart: {
    alignSelf: 'flex-start',
  },
  deleteChoices: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  deleteChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 36,
  },
  reactionPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    borderRadius: Spacing.three,
    padding: Spacing.half,
  },
  reactionChoice: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionChoiceSelected: {
    backgroundColor: 'rgba(42, 157, 143, 0.28)',
  },
  reactionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.half,
  },
  reactionChip: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    backgroundColor: Brand.navy,
  },
  reactionChipSelected: {
    backgroundColor: Brand.teal,
  },
  reactionChipText: {
    color: '#ffffff',
  },
  reactionChipSelectedText: {
    color: '#ffffff',
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
  callHistoryCard: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginVertical: 2,
  },
  callHistoryTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  callHistoryStatus: {
    fontSize: 13,
    marginTop: 3,
    opacity: 0.7,
  },
  deletedText: {
    fontStyle: 'italic',
  },
  mineTime: {
    color: '#ffffff',
  },
  mineReadReceipt: {
    color: Brand.navy,
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
  editActions: {
    width: 96,
    gap: Spacing.two,
  },
  quote: {
    borderLeftWidth: 3,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    gap: Spacing.half,
  },
  quoteMine: {
    borderLeftColor: '#ffffff',
    backgroundColor: 'rgba(29, 53, 87, 0.28)',
  },
  quoteTheirs: {
    borderLeftColor: Brand.teal,
    backgroundColor: 'rgba(42, 157, 143, 0.16)',
  },
  quoteName: {
    color: Brand.navy,
  },
  replyComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderLeftWidth: 3,
    borderLeftColor: Brand.teal,
    backgroundColor: 'rgba(42, 157, 143, 0.12)',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  replyComposerText: {
    flex: 1,
    gap: Spacing.half,
  },
  imageButton: {
    width: 44,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  imageComposerPreview: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
  },
  attachmentList: {
    gap: Spacing.two,
  },
  chatImageFrame: {
    width: 220,
    maxWidth: '100%',
    height: 180,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  chatImage: {
    width: '100%',
    height: '100%',
  },
  imageLoading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  previewImageFrame: {
    width: '100%',
    maxWidth: 720,
    height: '70%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewClose: {
    color: '#ffffff',
  },
  sendError: {
    color: Brand.danger,
    textAlign: 'center',
  },
});
