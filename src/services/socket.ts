import { io, type Socket } from 'socket.io-client';

import type { Message } from '@/services/api';
import { parseMessageAttachments, parseMessageReactions, parseMessageReply } from '@/services/api';
import { getAccessToken } from '@/services/auth-storage';

const SOCKET_URL = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10000;

export type ChatSocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export type MessagesReadEvent = {
  conversationId: string;
  messageIds: string[];
  readBy: string;
};

export type MessagesDeliveredEvent = {
  conversationId: string;
  messageIds: string[];
  deliveredBy: string;
};

type PendingAck = {
  reject: (error: Error) => void;
};

type ConnectedWaiter = {
  resolve: (current: Socket) => void;
  reject: (error: Error) => void;
};

type ChatSocketOptions = {
  conversationId: string;
  onStatus: (status: ChatSocketStatus) => void;
  onMessage: (message: Message) => void;
  onConnectionError: (message: string) => void;
  onJoinError: (message: string) => void;
  onUserOnline?: (userId: string) => void;
  onUserOffline?: (userId: string) => void;
  onUserTyping?: (userId: string) => void;
  onUserStoppedTyping?: (userId: string) => void;
  onMessagesRead?: (event: MessagesReadEvent) => void;
  onMessagesDelivered?: (event: MessagesDeliveredEvent) => void;
  onMessageDeletedForEveryone?: (message: Message) => void;
  onMessageHiddenForMe?: (event: { conversationId: string; messageId: string }) => void;
  onMessageEdited?: (message: Message) => void;
  onMessageReactionsUpdated?: (event: MessageReactionsUpdate) => void;
  onMessageAttachmentAdded?: (message: Message) => void;
};

export type MessageReactionsUpdate = {
  messageId: string;
  reactions: Message['reactions'];
};

export type ChatSocketHandle = {
  sendMessage: (conversationId: string, content: string, replyToMessageId?: string) => Promise<Message>;
  deleteMessageForEveryone: (conversationId: string, messageId: string) => Promise<void>;
  deleteMessageForMe: (conversationId: string, messageId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  setReaction: (messageId: string, reaction: string) => Promise<void>;
  removeReaction: (messageId: string) => Promise<void>;
  markConversationAsRead: () => Promise<void>;
  markConversationAsDelivered: (conversationId: string) => Promise<void>;
  disconnect: () => void;
};

export type InboxSocketHandle = {
  joinConversations: (conversationIds: string[]) => void;
  disconnect: () => void;
};

let sharedSocket: Socket | null = null;
let sharedConnect: Promise<Socket> | null = null;
let sharedHolders = 0;
const inboxRooms = new Set<string>();
const joinedRooms = new Set<string>();
const inboxReadListeners = new Set<(event: MessagesReadEvent) => void>();
const inboxHiddenListeners = new Set<
  (event: { conversationId: string; messageId: string }) => void
>();

export function connectInboxSocket(
  onMessage: (message: Message) => void,
  onMessagesRead: (event: MessagesReadEvent) => void,
  onMessageDeletedForEveryone: (message: Message) => void,
  onMessageHiddenForMe: (event: { conversationId: string; messageId: string }) => void,
  onMessageEdited: (message: Message) => void,
  onMessageAttachmentAdded: (message: Message) => void,
): InboxSocketHandle {
  let stopped = false;
  let held = false;
  let socket: Socket | null = null;

  const deliverRead = (event: MessagesReadEvent) => {
    if (!stopped) {
      onMessagesRead(event);
    }
  };

  const handleMessage = (payload: unknown) => {
    const message = parseMessage(payload);

    if (message) {
      onMessage(message);
    }
  };

  const handleMessagesRead = (payload: unknown) => {
    const event = readMessagesReadEvent(payload);

    if (event) {
      deliverRead(event);
    }
  };

  const handleMessageDeleted = (payload: unknown) => {
    const message = parseMessage(payload);

    if (message?.deletedForEveryone && !stopped) {
      onMessageDeletedForEveryone(message);
    }
  };

  const handleMessageEdited = (payload: unknown) => {
    const message = parseMessage(payload);

    if (message && !stopped) {
      onMessageEdited(message);
    }
  };

  const handleMessageAttachmentAdded = (payload: unknown) => {
    const message = parseMessage(payload);

    if (message && !stopped) {
      onMessageAttachmentAdded(message);
    }
  };

  inboxReadListeners.add(deliverRead);
  inboxHiddenListeners.add(onMessageHiddenForMe);

  void (async () => {
    const token = await getAccessToken();

    if (stopped || !token) {
      return;
    }

    holdSharedSocket();
    held = true;

    try {
      socket = await ensureSharedSocket();
    } catch {
      if (held) {
        held = false;
        releaseSharedSocket();
      }
      return;
    }

    if (stopped || !socket) {
      return;
    }

    socket.on('new_message', handleMessage);
    socket.on('messages_read', handleMessagesRead);
    socket.on('message_deleted_for_everyone', handleMessageDeleted);
    socket.on('message_edited', handleMessageEdited);
    socket.on('message_attachment_added', handleMessageAttachmentAdded);

    if (socket.connected) {
      void rejoinInboxRooms(socket);
    }
  })();

  return {
    joinConversations(conversationIds) {
      for (const conversationId of conversationIds) {
        if (conversationId) {
          inboxRooms.add(conversationId);
        }
      }

      if (socket?.connected) {
        void rejoinInboxRooms(socket);
      }
    },
    disconnect() {
      if (stopped) {
        return;
      }

      stopped = true;
      inboxReadListeners.delete(deliverRead);
      inboxHiddenListeners.delete(onMessageHiddenForMe);
      socket?.off('new_message', handleMessage);
      socket?.off('messages_read', handleMessagesRead);
      socket?.off('message_deleted_for_everyone', handleMessageDeleted);
      socket?.off('message_edited', handleMessageEdited);
      socket?.off('message_attachment_added', handleMessageAttachmentAdded);
      inboxRooms.clear();

      if (held) {
        held = false;
        releaseSharedSocket();
      }
    },
  };
}

function notifyInboxMarkedRead(conversationId: string) {
  const event: MessagesReadEvent = {
    conversationId,
    messageIds: [],
    readBy: '',
  };

  for (const listener of [...inboxReadListeners]) {
    listener(event);
  }
}

function notifyInboxMessageHidden(conversationId: string, messageId: string) {
  const event = { conversationId, messageId };

  for (const listener of [...inboxHiddenListeners]) {
    listener(event);
  }
}

function holdSharedSocket() {
  sharedHolders += 1;
}

function releaseSharedSocket() {
  sharedHolders = Math.max(0, sharedHolders - 1);

  if (sharedHolders > 0) {
    return;
  }

  const current = sharedSocket;
  sharedSocket = null;
  sharedConnect = null;
  inboxRooms.clear();
  joinedRooms.clear();

  if (!current) {
    return;
  }

  current.removeAllListeners();
  current.io.removeAllListeners();
  current.disconnect();
}

function ensureSharedSocket(): Promise<Socket> {
  if (sharedSocket) {
    return Promise.resolve(sharedSocket);
  }

  if (!sharedConnect) {
    sharedConnect = createSharedSocket();
  }

  return sharedConnect;
}

async function createSharedSocket(): Promise<Socket> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  if (sharedSocket) {
    return sharedSocket;
  }

  const socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: false,
    reconnection: true,
  });
  sharedSocket = socket;
  socket.on('connect', () => {
    void rejoinInboxRooms(socket);
  });
  socket.on('disconnect', () => {
    joinedRooms.clear();
  });
  socket.io.on('reconnect_attempt', () => {
    void refreshAuthToken(socket);
  });
  socket.connect();
  return socket;
}

async function rejoinInboxRooms(socket: Socket) {
  for (const conversationId of inboxRooms) {
    await joinSharedConversation(socket, conversationId);
  }
}

function joinSharedConversation(socket: Socket, conversationId: string): Promise<void> {
  if (!conversationId || joinedRooms.has(conversationId) || !socket.connected) {
    return Promise.resolve();
  }

  joinedRooms.add(conversationId);

  return new Promise((resolve) => {
    socket.emit('join_conversation', { conversationId }, (response: unknown) => {
      if (isAckError(response)) {
        joinedRooms.delete(conversationId);
      }

      resolve();
    });
  });
}

let nextSessionId = 0;
let activeSessionId = 0;

export function connectChatSocket(options: ChatSocketOptions): ChatSocketHandle {
  const previousDisconnect = activeDisconnect;
  activeDisconnect = null;
  previousDisconnect?.();

  const sessionId = ++nextSessionId;
  activeSessionId = sessionId;

  let socket: Socket | null = null;
  let closed = false;
  let joined = false;
  let heldSocket = false;
  let detachSocketListeners: (() => void) | null = null;
  let handleSocketConnect: (() => void) | null = null;
  const pendingAcks: PendingAck[] = [];
  const connectedWaiters: ConnectedWaiter[] = [];

  const handle: ChatSocketHandle = {
    sendMessage(conversationId, content, replyToMessageId) {
      return sendConversation(conversationId, content, replyToMessageId);
    },
    deleteMessageForEveryone(conversationId, messageId) {
      return deleteMessageForEveryone(conversationId, messageId);
    },
    deleteMessageForMe(conversationId, messageId) {
      return deleteMessageForMe(conversationId, messageId);
    },
    editMessage(messageId, content) {
      return editMessage(messageId, content);
    },
    setReaction(messageId, reaction) {
      return setReaction(messageId, reaction);
    },
    removeReaction(messageId) {
      return removeReaction(messageId);
    },
    markConversationAsRead() {
      return markCurrentConversationAsRead();
    },
    markConversationAsDelivered(conversationId) {
      return markCurrentConversationAsDelivered(conversationId);
    },
    disconnect() {
      closeSession();
    },
  };

  activeDisconnect = () => {
    if (sessionId === activeSessionId) {
      closeSession();
    }
  };

  void openSocket();

  return handle;

  async function openSocket() {
    const token = await getAccessToken();

    if (closed || sessionId !== activeSessionId) {
      return;
    }

    if (!token) {
      options.onStatus('offline');
      options.onConnectionError('Could not authenticate the chat connection.');
      rejectConnectedWaiters(new Error('Could not authenticate the chat connection.'));
      return;
    }

    options.onStatus('connecting');
    holdSharedSocket();
    heldSocket = true;

    try {
      const nextSocket = await ensureSharedSocket();

      if (closed || sessionId !== activeSessionId) {
        return;
      }

      socket = nextSocket;
      bindSocket(nextSocket);

      if (nextSocket.connected) {
        handleSocketConnect?.();
      }
    } catch {
      options.onStatus('offline');
      options.onConnectionError('Could not connect to chat.');

      if (heldSocket && !closed) {
        heldSocket = false;
        releaseSharedSocket();
      }
    }
  }

  function bindSocket(current: Socket) {
    const handleUserOnline = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const presenceUserId = readPresenceUserId(payload);

      if (presenceUserId) {
        options.onUserOnline?.(presenceUserId);
      }
    };

    const handleUserOffline = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const presenceUserId = readPresenceUserId(payload);

      if (presenceUserId) {
        options.onUserOffline?.(presenceUserId);
      }
    };

    const handleUserTyping = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const typingUserId = readPresenceUserId(payload);

      if (typingUserId) {
        options.onUserTyping?.(typingUserId);
      }
    };

    const handleUserStoppedTyping = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const typingUserId = readPresenceUserId(payload);

      if (typingUserId) {
        options.onUserStoppedTyping?.(typingUserId);
      }
    };

    const handleMessagesRead = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const event = readMessagesReadEvent(payload);

      if (!event || event.conversationId !== options.conversationId) {
        return;
      }

      options.onMessagesRead?.(event);
    };

    const handleMessagesDelivered = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const event = readMessagesDeliveredEvent(payload);

      if (!event || event.conversationId !== options.conversationId) {
        return;
      }

      options.onMessagesDelivered?.(event);
    };

    const handleSocketConnected = () => {
      if (!isCurrent(current)) {
        return;
      }

      joined = false;
      options.onStatus('connected');
      options.onConnectionError('');
      current.off('user_online', handleUserOnline);
      current.off('user_offline', handleUserOffline);
      current.off('user_typing', handleUserTyping);
      current.off('user_stopped_typing', handleUserStoppedTyping);
      current.off('messages_read', handleMessagesRead);
      current.off('messages_delivered', handleMessagesDelivered);
      current.on('user_online', handleUserOnline);
      current.on('user_offline', handleUserOffline);
      current.on('user_typing', handleUserTyping);
      current.on('user_stopped_typing', handleUserStoppedTyping);
      current.on('messages_read', handleMessagesRead);
      current.on('messages_delivered', handleMessagesDelivered);
      resolveConnectedWaiters(current);
      void joinConversation();
    };
    handleSocketConnect = handleSocketConnected;

    current.on('connect', handleSocketConnected);

    const handleDisconnect = (reason: string) => {
      current.off('user_online', handleUserOnline);
      current.off('user_offline', handleUserOffline);
      current.off('user_typing', handleUserTyping);
      current.off('user_stopped_typing', handleUserStoppedTyping);
      current.off('messages_read', handleMessagesRead);
      current.off('messages_delivered', handleMessagesDelivered);

      if (!isCurrent(current)) {
        return;
      }

      joined = false;
      options.onStatus(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
    };

    const handleConnectError = (error: Error) => {
      if (!isCurrent(current)) {
        return;
      }

      if (/unauthorized/i.test(error.message)) {
        current.io.opts.reconnection = false;
        options.onStatus('offline');
        options.onConnectionError('Could not authenticate the chat connection.');
        current.disconnect();
        rejectConnectedWaiters(new Error('Could not authenticate the chat connection.'));
        return;
      }

      options.onStatus('reconnecting');
      options.onConnectionError('Could not connect to chat.');
    };

    const handleReconnectAttempt = () => {
      if (!isCurrent(current)) {
        return;
      }

      options.onStatus('reconnecting');
      void refreshAuthToken(current);
    };

    const handleNewMessage = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const message = parseMessage(payload);

      if (!message || message.conversationId !== options.conversationId) {
        return;
      }

      options.onMessage(message);
    };

    const handleMessageDeletedForEveryone = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const message = parseMessage(payload);

      if (!message?.deletedForEveryone || message.conversationId !== options.conversationId) {
        return;
      }

      options.onMessageDeletedForEveryone?.(message);
    };

    const handleMessageEdited = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const message = parseMessage(payload);

      if (!message || message.deletedForEveryone || message.conversationId !== options.conversationId) {
        return;
      }

      options.onMessageEdited?.(message);
    };

    const handleMessageReactionsUpdated = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const update = parseReactionUpdate(payload);

      if (!update) {
        return;
      }

      options.onMessageReactionsUpdated?.(update);
    };

    const handleMessageAttachmentAdded = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const message = parseMessage(payload);

      if (!message || message.conversationId !== options.conversationId) {
        return;
      }

      options.onMessageAttachmentAdded?.(message);
    };

    const handleException = (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const pending = pendingAcks.shift();

      if (pending) {
        pending.reject(new Error(publicMessage(payload, 'Chat request failed.')));
        return;
      }

      options.onConnectionError(publicMessage(payload, 'Chat connection failed.'));
    };

    current.on('disconnect', handleDisconnect);
    current.on('connect_error', handleConnectError);
    current.io.on('reconnect_attempt', handleReconnectAttempt);
    current.on('new_message', handleNewMessage);
    current.on('message_deleted_for_everyone', handleMessageDeletedForEveryone);
    current.on('message_edited', handleMessageEdited);
    current.on('message_reactions_updated', handleMessageReactionsUpdated);
    current.on('message_attachment_added', handleMessageAttachmentAdded);
    current.on('exception', handleException);

    detachSocketListeners = () => {
      current.off('connect', handleSocketConnected);
      current.off('disconnect', handleDisconnect);
      current.off('connect_error', handleConnectError);
      current.io.off('reconnect_attempt', handleReconnectAttempt);
      current.off('new_message', handleNewMessage);
      current.off('message_deleted_for_everyone', handleMessageDeletedForEveryone);
      current.off('message_edited', handleMessageEdited);
      current.off('message_reactions_updated', handleMessageReactionsUpdated);
      current.off('message_attachment_added', handleMessageAttachmentAdded);
      current.off('exception', handleException);
      current.off('user_online', handleUserOnline);
      current.off('user_offline', handleUserOffline);
      current.off('user_typing', handleUserTyping);
      current.off('user_stopped_typing', handleUserStoppedTyping);
      current.off('messages_read', handleMessagesRead);
      current.off('messages_delivered', handleMessagesDelivered);
    };
  }

  async function joinConversation() {
    const current = socket;

    if (!current?.connected || closed) {
      return;
    }

    try {
      await emitWithAck(
        current,
        'join_conversation',
        { conversationId: options.conversationId },
        'Could not join conversation.',
      );
      joined = true;
      options.onJoinError('');
    } catch (error) {
      joined = false;
      options.onJoinError(
        error instanceof Error ? error.message : 'Could not join conversation.',
      );
    }
  }

  async function sendConversation(conversationId: string, content: string, replyToMessageId?: string) {
    const current = await waitForSocket();
    await ensureJoined(current, conversationId);
    const response = await emitWithAck(
      current,
      'send_message',
      replyToMessageId ? { conversationId, content, replyToMessageId } : { conversationId, content },
      'Could not send message.',
    );
    const message = parseMessage(response);

    if (!message || message.conversationId !== conversationId) {
      throw new Error('Could not send message.');
    }

    return message;
  }

  async function deleteMessageForEveryone(conversationId: string, messageId: string) {
    const current = await waitForSocket();
    await ensureJoined(current, conversationId);
    const response = await emitWithAck(
      current,
      'delete_message_for_everyone',
      { conversationId, messageId },
      'Could not delete message.',
    );
    const message = parseMessage(response);

    if (message?.deletedForEveryone && message.conversationId === options.conversationId) {
      options.onMessageDeletedForEveryone?.(message);
    }
  }

  async function deleteMessageForMe(conversationId: string, messageId: string) {
    const current = await waitForSocket();
    await ensureJoined(current, conversationId);
    await emitWithAck(
      current,
      'delete_message_for_me',
      { conversationId, messageId },
      'Could not delete message.',
    );
    options.onMessageHiddenForMe?.({ conversationId, messageId });
    notifyInboxMessageHidden(conversationId, messageId);
  }

  async function editMessage(messageId: string, content: string) {
    const current = await waitForSocket();
    await ensureJoined(current, options.conversationId);
    const response = await emitWithAck(
      current,
      'edit_message',
      { messageId, content },
      'Could not edit message.',
    );
    const message = parseMessage(response);

    if (
      message &&
      !message.deletedForEveryone &&
      message.conversationId === options.conversationId &&
      message.id === messageId
    ) {
      options.onMessageEdited?.(message);
    }
  }

  async function setReaction(messageId: string, reaction: string) {
    const current = await waitForSocket();
    await ensureJoined(current, options.conversationId);
    const response = await emitWithAck(
      current,
      'add_reaction',
      { messageId, reaction },
      'Could not add reaction.',
    );
    deliverReactionUpdate(response);
  }

  async function removeReaction(messageId: string) {
    const current = await waitForSocket();
    await ensureJoined(current, options.conversationId);
    const response = await emitWithAck(
      current,
      'remove_reaction',
      { messageId },
      'Could not remove reaction.',
    );
    deliverReactionUpdate(response);
  }

  function deliverReactionUpdate(response: unknown) {
    const update = parseReactionUpdate(response);

    if (update) {
      options.onMessageReactionsUpdated?.(update);
    }
  }

  async function markCurrentConversationAsRead() {
    const current = await waitForSocket();

    if (closed || !isCurrent(current)) {
      throw new Error('Chat is offline.');
    }

    await ensureJoined(current, options.conversationId);

    if (closed || !joined) {
      throw new Error('Could not mark messages as read.');
    }

    await emitWithAck(
      current,
      'mark_as_read',
      { conversationId: options.conversationId },
      'Could not mark messages as read.',
    );
    notifyInboxMarkedRead(options.conversationId);
  }

  async function markCurrentConversationAsDelivered(conversationId: string) {
    if (conversationId !== options.conversationId) {
      return;
    }

    const current = await waitForSocket();

    if (closed || !isCurrent(current) || !current.connected) {
      throw new Error('Chat is offline.');
    }

    await ensureJoined(current, options.conversationId);

    if (closed || !joined || !current.connected) {
      throw new Error('Could not mark messages as delivered.');
    }

    await emitWithAck(
      current,
      'mark_as_delivered',
      { conversationId },
      'Could not mark messages as delivered.',
    );
  }

  async function ensureJoined(current: Socket, conversationId: string) {
    if (joined && conversationId === options.conversationId) {
      return;
    }

    await emitWithAck(
      current,
      'join_conversation',
      { conversationId },
      'Could not join conversation.',
    );
    joined = true;
    options.onJoinError('');
  }

  function waitForSocket(): Promise<Socket> {
    if (closed) {
      return Promise.reject(new Error('Chat is offline.'));
    }

    if (socket?.connected) {
      return Promise.resolve(socket);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        removeWaiter();
        reject(new Error('Chat is offline.'));
      }, REQUEST_TIMEOUT_MS);
      const waiter: ConnectedWaiter = {
        resolve(current) {
          clearTimeout(timer);
          resolve(current);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      };

      function removeWaiter() {
        const index = connectedWaiters.indexOf(waiter);

        if (index >= 0) {
          connectedWaiters.splice(index, 1);
        }
      }

      connectedWaiters.push(waiter);
    });
  }

  function resolveConnectedWaiters(current: Socket) {
    const waiters = connectedWaiters.splice(0);
    waiters.forEach((waiter) => waiter.resolve(current));
  }

  function rejectConnectedWaiters(error: Error) {
    const waiters = connectedWaiters.splice(0);
    waiters.forEach((waiter) => waiter.reject(error));
    pendingAcks.splice(0).forEach((pending) => pending.reject(error));
  }

  function emitWithAck(
    current: Socket,
    event: string,
    payload: {
      conversationId?: string;
      content?: string;
      messageId?: string;
      reaction?: string;
      replyToMessageId?: string;
    },
    fallback: string,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const pending: PendingAck = {
        reject(error) {
          settle(() => reject(error));
        },
      };
      const timer = setTimeout(() => {
        settle(() => reject(new Error(fallback)));
      }, REQUEST_TIMEOUT_MS);

      pendingAcks.push(pending);

      current.emit(event, payload, (response: unknown) => {
        if (isAckError(response)) {
          settle(() => reject(new Error(publicMessage(response, fallback))));
          return;
        }

        settle(() => resolve(response));
      });

      function settle(action: () => void) {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        const index = pendingAcks.indexOf(pending);

        if (index >= 0) {
          pendingAcks.splice(index, 1);
        }

        action();
      }
    });
  }

  function closeSession() {
    if (closed) {
      return;
    }

    closed = true;
    joined = false;
    detachSocketListeners?.();
    detachSocketListeners = null;
    handleSocketConnect = null;

    if (activeDisconnect === closeSession) {
      activeDisconnect = null;
    }

    const offline = new Error('Chat is offline.');
    rejectConnectedWaiters(offline);

    if (heldSocket) {
      heldSocket = false;
      releaseSharedSocket();
    }

    socket = null;
  }

  function isCurrent(current: Socket) {
    return !closed && socket === current && sessionId === activeSessionId;
  }
}

let activeDisconnect: (() => void) | null = null;

async function refreshAuthToken(current: Socket) {
  const token = await getAccessToken();

  if (!token) {
    return;
  }

  current.auth = { token };
}

function readMessagesDeliveredEvent(payload: unknown): MessagesDeliveredEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;

  if (
    typeof value.conversationId !== 'string' ||
    value.conversationId.length === 0 ||
    typeof value.deliveredBy !== 'string' ||
    value.deliveredBy.length === 0 ||
    !isMessageIdList(value.messageIds)
  ) {
    return null;
  }

  return {
    conversationId: value.conversationId,
    messageIds: value.messageIds,
    deliveredBy: value.deliveredBy,
  };
}

function readMessagesReadEvent(payload: unknown): MessagesReadEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;

  if (
    typeof value.conversationId !== 'string' ||
    value.conversationId.length === 0 ||
    typeof value.readBy !== 'string' ||
    value.readBy.length === 0 ||
    !isMessageIdList(value.messageIds)
  ) {
    return null;
  }

  return {
    conversationId: value.conversationId,
    messageIds: value.messageIds,
    readBy: value.readBy,
  };
}

function isMessageIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((messageId) => typeof messageId === 'string' && messageId.length > 0)
  );
}

function readPresenceUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('userId' in payload)) {
    return null;
  }

  const userId = (payload as { userId?: unknown }).userId;

  if (typeof userId !== 'string' || userId.length === 0) {
    return null;
  }

  return userId;
}

function parseMessage(payload: unknown): Message | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;

  if (
    typeof value.id !== 'string' ||
    typeof value.conversationId !== 'string' ||
    typeof value.senderId !== 'string' ||
    typeof value.content !== 'string' ||
    (typeof value.createdAt !== 'string' && !(value.createdAt instanceof Date))
  ) {
    return null;
  }

  const deletedForEveryone = value.deletedForEveryone === true;

  return {
    id: value.id,
    conversationId: value.conversationId,
    senderId: value.senderId,
    content: deletedForEveryone ? 'Message deleted' : value.content,
    createdAt:
      value.createdAt instanceof Date ? value.createdAt.toISOString() : value.createdAt,
    readAt:
      value.readAt instanceof Date
        ? value.readAt.toISOString()
        : typeof value.readAt === 'string'
          ? value.readAt
          : null,
    deliveredAt:
      value.deliveredAt instanceof Date
        ? value.deliveredAt.toISOString()
        : typeof value.deliveredAt === 'string'
          ? value.deliveredAt
          : null,
    editedAt:
      value.editedAt instanceof Date
        ? value.editedAt.toISOString()
        : typeof value.editedAt === 'string'
          ? value.editedAt
          : null,
    deletedForEveryone,
    reactions: parseMessageReactions(value.reactions),
    replyTo: parseMessageReply(value.replyTo),
    attachments: deletedForEveryone ? [] : parseMessageAttachments(value.attachments),
  };
}

function parseReactionUpdate(payload: unknown): MessageReactionsUpdate | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as { messageId?: unknown; reactions?: unknown };

  if (typeof value.messageId !== 'string' || value.messageId.length === 0) {
    return null;
  }

  return {
    messageId: value.messageId,
    reactions: parseMessageReactions(value.reactions),
  };
}

function isAckError(payload: unknown): boolean {
  return (
    !!payload &&
    typeof payload === 'object' &&
    'status' in payload &&
    (payload as { status?: unknown }).status === 'error'
  );
}

function publicMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object' || !('message' in payload)) {
    return fallback;
  }

  const message = (payload as { message?: unknown }).message;

  if (typeof message !== 'string') {
    return fallback;
  }

  const trimmed = message.trim();

  if (!trimmed || /bearer\s+|eyJ[a-zA-Z0-9_-]{10,}\./i.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}
