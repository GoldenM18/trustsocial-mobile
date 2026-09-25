import { io, type Socket } from 'socket.io-client';

import type { Message } from '@/services/api';
import { getAccessToken } from '@/services/auth-storage';

const SOCKET_URL = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10000;

export type ChatSocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export type MessagesReadEvent = {
  conversationId: string;
  messageIds: string[];
  readBy: string;
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
};

export type ChatSocketHandle = {
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  markConversationAsRead: () => Promise<void>;
  disconnect: () => void;
};

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
  const pendingAcks: PendingAck[] = [];
  const connectedWaiters: ConnectedWaiter[] = [];

  const handle: ChatSocketHandle = {
    sendMessage(conversationId, content) {
      return sendConversation(conversationId, content);
    },
    markConversationAsRead() {
      return markCurrentConversationAsRead();
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

    const nextSocket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
    });

    if (closed || sessionId !== activeSessionId) {
      nextSocket.disconnect();
      return;
    }

    socket = nextSocket;
    bindSocket(nextSocket);
    nextSocket.connect();
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

    current.on('connect', () => {
      if (!isCurrent(current)) {
        return;
      }

      joined = false;
      options.onStatus('connected');
      options.onConnectionError('');
      current.on('user_online', handleUserOnline);
      current.on('user_offline', handleUserOffline);
      current.on('user_typing', handleUserTyping);
      current.on('user_stopped_typing', handleUserStoppedTyping);
      current.on('messages_read', handleMessagesRead);
      resolveConnectedWaiters(current);
      void joinConversation();
    });

    current.on('disconnect', (reason) => {
      current.off('user_online', handleUserOnline);
      current.off('user_offline', handleUserOffline);
      current.off('user_typing', handleUserTyping);
      current.off('user_stopped_typing', handleUserStoppedTyping);
      current.off('messages_read', handleMessagesRead);

      if (!isCurrent(current)) {
        return;
      }

      joined = false;
      options.onStatus(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
    });

    current.on('connect_error', (error) => {
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
    });

    current.io.on('reconnect_attempt', () => {
      if (!isCurrent(current)) {
        return;
      }

      options.onStatus('reconnecting');
      void refreshAuthToken(current);
    });

    current.on('new_message', (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const message = parseMessage(payload);

      if (!message || message.conversationId !== options.conversationId) {
        return;
      }

      options.onMessage(message);
    });

    current.on('exception', (payload: unknown) => {
      if (!isCurrent(current)) {
        return;
      }

      const pending = pendingAcks.shift();

      if (pending) {
        pending.reject(new Error(publicMessage(payload, 'Chat request failed.')));
        return;
      }

      options.onConnectionError(publicMessage(payload, 'Chat connection failed.'));
    });
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

  async function sendConversation(conversationId: string, content: string) {
    const current = await waitForSocket();
    await ensureJoined(current, conversationId);
    await emitWithAck(
      current,
      'send_message',
      { conversationId, content },
      'Could not send message.',
    );
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
    payload: { conversationId: string; content?: string },
    fallback: string,
  ): Promise<void> {
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

        settle(() => resolve());
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

    if (activeDisconnect === closeSession) {
      activeDisconnect = null;
    }

    const offline = new Error('Chat is offline.');
    rejectConnectedWaiters(offline);

    if (!socket) {
      return;
    }

    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
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

  return {
    id: value.id,
    conversationId: value.conversationId,
    senderId: value.senderId,
    content: value.content,
    createdAt:
      value.createdAt instanceof Date ? value.createdAt.toISOString() : value.createdAt,
    readAt:
      value.readAt instanceof Date
        ? value.readAt.toISOString()
        : typeof value.readAt === 'string'
          ? value.readAt
          : null,
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
