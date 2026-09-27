import { getAccessToken } from '@/services/auth-storage';
const API_URL = 'http://192.168.0.105:3000';

export async function registerUser(data: {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}) {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Registration failed',
    );
  }

  return result;
}
export async function loginUser(data: {
  identifier: string;
  password: string;
}) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Login failed',
    );
  }

  return result;
}
export async function getCurrentUser() {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Authentication failed',
    );
  }

  return result;
}

export type UserProfile = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  profilePhotoUrl: string | null;
  isVerified: boolean;
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function getMyProfile(): Promise<UserProfile> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/users/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load profile',
    );
  }

  return toUserProfile(result);
}

export async function updateMyProfile(data: {
  fullName?: string;
  username?: string;
  phone?: string;
}): Promise<UserProfile> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/users/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not update profile',
    );
  }

  return toUserProfile(result);
}

export async function uploadProfilePhoto(file: {
  uri: string;
  mimeType: string;
  fileName?: string | null;
  file?: Blob;
}): Promise<UserProfile> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const formData = new FormData();
  const extension = file.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const name = file.fileName || `profile.${extension}`;

  if (file.file) {
    formData.append('photo', file.file, name);
  } else {
    formData.append('photo', {
      uri: file.uri,
      name,
      type: file.mimeType,
    } as unknown as Blob);
  }

  const response = await fetch(`${API_URL}/users/me/photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not upload profile photo',
    );
  }

  return toUserProfile(result);
}

export type DiscoverUser = {
  id: string;
  fullName: string;
  username: string;
  profilePhotoUrl: string | null;
  isVerified: boolean;
  isOnline: boolean;
};

export type DiscoverUsersPage = {
  users: DiscoverUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export async function discoverUsers(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<DiscoverUsersPage> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const query = new URLSearchParams();

  if (params.search) {
    query.set('search', params.search);
  }

  if (params.page) {
    query.set('page', String(params.page));
  }

  if (params.limit) {
    query.set('limit', String(params.limit));
  }

  const searchParams = query.toString();
  const response = await fetch(
    `${API_URL}/users/discover${searchParams ? `?${searchParams}` : ''}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load people',
    );
  }

  return {
    users: Array.isArray(result.users)
      ? result.users.map((user: DiscoverUser) => ({
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          profilePhotoUrl: user.profilePhotoUrl ?? null,
          isVerified: user.isVerified,
          isOnline: user.isOnline,
        }))
      : [],
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  };
}

function toUserProfile(result: UserProfile): UserProfile {
  return {
    id: result.id,
    fullName: result.fullName,
    username: result.username,
    email: result.email,
    phone: result.phone,
    profilePhotoUrl: result.profilePhotoUrl ?? null,
    isVerified: result.isVerified,
    isOnline: result.isOnline,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

export type ConnectionUser = {
  id: string;
  fullName: string;
  username: string;
  profilePhotoUrl: string | null;
  isVerified: boolean;
  isOnline: boolean;
};

export type AcceptedConnection = {
  connectionId: string;
  user: ConnectionUser;
};

export type IncomingConnectionRequest = {
  connectionId: string;
  requester: ConnectionUser;
};

export type OutgoingConnectionRequest = {
  connectionId: string;
  recipient: ConnectionUser;
};

export type ConnectionRecord = {
  id: string;
  requesterId: string;
  recipientId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
};

export async function getConnections(): Promise<{ connections: AcceptedConnection[] }> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/connections`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load connections',
    );
  }

  return {
    connections: Array.isArray(result.connections)
      ? result.connections.map((connection: AcceptedConnection) => ({
          connectionId: connection.connectionId,
          user: toConnectionUser(connection.user),
        }))
      : [],
  };
}

export async function getIncomingConnectionRequests(): Promise<{
  requests: IncomingConnectionRequest[];
}> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/connections/requests`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load connection requests',
    );
  }

  return {
    requests: Array.isArray(result.requests)
      ? result.requests.map((request: IncomingConnectionRequest) => ({
          connectionId: request.connectionId,
          requester: toConnectionUser(request.requester),
        }))
      : [],
  };
}

export async function getOutgoingConnectionRequests(): Promise<{
  requests: OutgoingConnectionRequest[];
}> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/connections/sent`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load sent connection requests',
    );
  }

  return {
    requests: Array.isArray(result.requests)
      ? result.requests.map((request: OutgoingConnectionRequest) => ({
          connectionId: request.connectionId,
          recipient: toConnectionUser(request.recipient),
        }))
      : [],
  };
}

export async function sendConnectionRequest(recipientId: string): Promise<ConnectionRecord> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/connections`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipientId }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not send connection request',
    );
  }

  return toConnectionRecord(result);
}

export async function acceptConnectionRequest(connectionId: string): Promise<ConnectionRecord> {
  return updateConnection(connectionId, 'accept', 'Could not accept connection request');
}

export async function rejectConnectionRequest(connectionId: string): Promise<ConnectionRecord> {
  return updateConnection(connectionId, 'reject', 'Could not reject connection request');
}

export async function cancelConnectionRequest(connectionId: string): Promise<void> {
  await deleteConnection(connectionId, '', 'Could not cancel connection request');
}

export async function removeConnection(connectionId: string): Promise<void> {
  await deleteConnection(connectionId, '/remove', 'Could not remove connection');
}

function toConnectionUser(user: ConnectionUser): ConnectionUser {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    isVerified: user.isVerified,
    isOnline: user.isOnline,
  };
}

function toConnectionRecord(result: ConnectionRecord): ConnectionRecord {
  return {
    id: result.id,
    requesterId: result.requesterId,
    recipientId: result.recipientId,
    status: result.status,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

async function updateConnection(
  connectionId: string,
  action: 'accept' | 'reject',
  fallback: string,
): Promise<ConnectionRecord> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/connections/${connectionId}/${action}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message) ? result.message.join('\n') : result.message || fallback,
    );
  }

  return toConnectionRecord(result);
}

async function deleteConnection(
  connectionId: string,
  suffix: '' | '/remove',
  fallback: string,
): Promise<void> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/connections/${connectionId}${suffix}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 204) {
    return;
  }

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message) ? result.message.join('\n') : result.message || fallback,
    );
  }
}

export type PublicProfile = {
  id: string;
  fullName: string;
  username: string;
  profilePhotoUrl: string | null;
  isVerified: boolean;
  isOnline: boolean;
  createdAt: string;
};

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load profile',
    );
  }

  return {
    id: result.id,
    fullName: result.fullName,
    username: result.username,
    profilePhotoUrl: result.profilePhotoUrl ?? null,
    isVerified: result.isVerified,
    isOnline: result.isOnline,
    createdAt: result.createdAt,
  };
}

export type Conversation = {
  id: string;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type MessageReaction = {
  reaction: string;
  count: number;
  reactedByMe: boolean;
};

export type MessageAttachment = {
  id: string;
  type: 'image';
  mimeType: string;
  originalName: string;
  url: string;
  size: number;
  createdAt: string;
};

const MESSAGE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function parseMessageAttachments(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const attachment = item as {
      id?: unknown;
      type?: unknown;
      mimeType?: unknown;
      originalName?: unknown;
      url?: unknown;
      size?: unknown;
      createdAt?: unknown;
    };

    if (attachment.type !== 'image' || typeof attachment.id !== 'string' || attachment.id.length === 0) {
      return [];
    }

    if (typeof attachment.mimeType !== 'string' || !MESSAGE_IMAGE_MIME_TYPES.has(attachment.mimeType)) {
      return [];
    }

    if (typeof attachment.url !== 'string' || attachment.url.length === 0 || attachment.url.includes('..')) {
      return [];
    }

    const createdAt =
      attachment.createdAt instanceof Date
        ? attachment.createdAt.toISOString()
        : typeof attachment.createdAt === 'string'
          ? attachment.createdAt
          : '';

    if (createdAt.length === 0 || typeof attachment.size !== 'number' || attachment.size < 1) {
      return [];
    }

    return [
      {
        id: attachment.id,
        type: 'image' as const,
        mimeType: attachment.mimeType,
        originalName: typeof attachment.originalName === 'string' ? attachment.originalName : 'image',
        url: attachment.url,
        size: attachment.size,
        createdAt,
      },
    ];
  });
}

export function messageImageSource(url: string, token: string): { uri: string; headers: { Authorization: string } } {
  const uri =
    url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  return {
    uri,
    headers: { Authorization: `Bearer ${token}` },
  };
}

export type MessageReply = {
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  isDeleted: boolean;
};

export function parseMessageReply(value: unknown): MessageReply | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const reply = value as {
    messageId?: unknown;
    senderId?: unknown;
    senderName?: unknown;
    content?: unknown;
    createdAt?: unknown;
    isDeleted?: unknown;
  };

  if (typeof reply.messageId !== 'string' || reply.messageId.length === 0) {
    return null;
  }

  if (typeof reply.senderId !== 'string' || reply.senderId.length === 0) {
    return null;
  }

  const createdAt =
    reply.createdAt instanceof Date
      ? reply.createdAt.toISOString()
      : typeof reply.createdAt === 'string'
        ? reply.createdAt
        : '';

  if (createdAt.length === 0) {
    return null;
  }

  const isDeleted = reply.isDeleted === true;

  return {
    messageId: reply.messageId,
    senderId: reply.senderId,
    senderName: typeof reply.senderName === 'string' ? reply.senderName : '',
    content: isDeleted ? 'Message deleted' : typeof reply.content === 'string' ? reply.content : '',
    createdAt,
    isDeleted,
  };
}

const MESSAGE_REACTION_SET = new Set(['❤️', '👍', '😂', '😮', '😢', '😡']);

export function parseMessageReactions(value: unknown): MessageReaction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const reaction = (item as { reaction?: unknown }).reaction;
    const count = (item as { count?: unknown }).count;
    const reactedByMe = (item as { reactedByMe?: unknown }).reactedByMe === true;

    if (typeof reaction !== 'string' || !MESSAGE_REACTION_SET.has(reaction)) {
      return [];
    }

    if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) {
      return [];
    }

    return [{ reaction, count, reactedByMe }];
  });
}

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'call';
  callId: string | null;
  callStatus: 'completed' | 'rejected' | 'missed' | null;
  callDurationSeconds: number | null;
  createdAt: string;
  readAt: string | null;
  deliveredAt: string | null;
  editedAt: string | null;
  deletedForEveryone: boolean;
  reactions: MessageReaction[];
  replyTo: MessageReply | null;
  attachments: MessageAttachment[];
};

export type MessageHistory = {
  messages: Message[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export async function createConversation(userId: string): Promise<Conversation> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/conversations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not open conversation',
    );
  }

  return {
    id: result.id,
    participantIds: Array.isArray(result.participantIds) ? result.participantIds : [],
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

export type InboxParticipant = {
  id: string;
  fullName: string;
  username: string;
  profilePhotoUrl: string | null;
  isVerified: boolean;
  isOnline: boolean;
};

export type InboxLastMessage = {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export type InboxConversation = {
  conversationId: string;
  otherParticipant: InboxParticipant;
  lastMessage: InboxLastMessage | null;
  unreadCount: number;
  updatedAt: string;
};

export async function getConversations(): Promise<{ conversations: InboxConversation[] }> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/conversations`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load conversations',
    );
  }

  return {
    conversations: Array.isArray(result.conversations)
      ? result.conversations.map(toInboxConversation)
      : [],
  };
}

function toInboxConversation(value: {
  conversationId?: string;
  id?: string;
  user?: InboxParticipant;
  otherParticipant?: InboxParticipant;
  lastMessage?: InboxLastMessage | null;
  unreadCount?: number;
  updatedAt?: string;
}): InboxConversation {
  const participant = value.otherParticipant ?? value.user;

  return {
    conversationId: value.conversationId || value.id || '',
    otherParticipant: {
      id: participant?.id ?? '',
      fullName: participant?.fullName ?? '',
      username: participant?.username ?? '',
      profilePhotoUrl: participant?.profilePhotoUrl ?? null,
      isVerified: participant?.isVerified === true,
      isOnline: participant?.isOnline === true,
    },
    lastMessage: value.lastMessage
      ? {
          id: value.lastMessage.id,
          content: value.lastMessage.content,
          senderId: value.lastMessage.senderId,
          createdAt: value.lastMessage.createdAt,
          deliveredAt:
            typeof value.lastMessage.deliveredAt === 'string' ? value.lastMessage.deliveredAt : null,
          readAt: typeof value.lastMessage.readAt === 'string' ? value.lastMessage.readAt : null,
        }
      : null,
    unreadCount: typeof value.unreadCount === 'number' ? value.unreadCount : 0,
    updatedAt: value.updatedAt ?? '',
  };
}

export async function getConversationMessages(
  conversationId: string,
  page = 1,
  limit = 50,
): Promise<MessageHistory> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const response = await fetch(
    `${API_URL}/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load messages',
    );
  }

  return {
    messages: Array.isArray(result.messages) ? result.messages.map(toConversationMessage) : [],
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  };
}

export type MessageSearchResult = {
  items: Message[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export async function searchConversationMessages(
  conversationId: string,
  query: string,
  page = 1,
  limit = 20,
): Promise<MessageSearchResult> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const params = new URLSearchParams({
    q: query,
    page: String(page),
    limit: String(limit),
  });

  const response = await fetch(
    `${API_URL}/conversations/${encodeURIComponent(conversationId)}/messages/search?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not search messages',
    );
  }

  return {
    items: Array.isArray(result.items) ? result.items.map(toConversationMessage) : [],
    page: typeof result.page === 'number' ? result.page : page,
    limit: typeof result.limit === 'number' ? result.limit : limit,
    total: typeof result.total === 'number' ? result.total : 0,
    totalPages: typeof result.totalPages === 'number' ? result.totalPages : 0,
  };
}

function toConversationMessage(message: Message): Message {
  const deletedForEveryone = message.deletedForEveryone === true;

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: deletedForEveryone ? 'Message deleted' : message.content,
    messageType: message.messageType ?? 'text',
    callId: message.callId ?? null,
    callStatus: message.callStatus ?? null,
    callDurationSeconds: message.callDurationSeconds ?? null,
    createdAt: message.createdAt,
    readAt: typeof message.readAt === 'string' ? message.readAt : null,
    deliveredAt: typeof message.deliveredAt === 'string' ? message.deliveredAt : null,
    editedAt: typeof message.editedAt === 'string' ? message.editedAt : null,
    deletedForEveryone,
    reactions: parseMessageReactions(message.reactions),
    replyTo: parseMessageReply(message.replyTo),
    attachments: deletedForEveryone ? [] : parseMessageAttachments(message.attachments),
  };
}

export async function sendConversationMessage(
  conversationId: string,
  content: string,
  replyToMessageId?: string,
): Promise<Message> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(
    `${API_URL}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
      replyToMessageId ? { content, replyToMessageId } : { content },
    ),
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not send message',
    );
  }

  return {
    id: result.id,
    conversationId: result.conversationId,
    senderId: result.senderId,
    content: result.content,
    messageType: result.messageType ?? 'text',
    callId: result.callId ?? null,
    callStatus: result.callStatus ?? null,
    callDurationSeconds: result.callDurationSeconds ?? null,
    createdAt: result.createdAt,
    readAt: typeof result.readAt === 'string' ? result.readAt : null,
    deliveredAt: typeof result.deliveredAt === 'string' ? result.deliveredAt : null,
    editedAt: typeof result.editedAt === 'string' ? result.editedAt : null,
    deletedForEveryone: false,
    reactions: [],
    replyTo: parseMessageReply(result.replyTo),
    attachments: [],
  };
}

export async function uploadMessageImage(
  conversationId: string,
  messageId: string,
  file: {
    uri: string;
    mimeType: string;
    fileName?: string | null;
    file?: Blob;
  },
): Promise<MessageAttachment> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const formData = new FormData();
  const extension = file.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const name = file.fileName || `image.${extension}`;

  if (file.file) {
    formData.append('file', file.file, name);
  } else {
    formData.append('file', {
      uri: file.uri,
      name,
      type: file.mimeType,
    } as unknown as Blob);
  }

  const response = await fetch(
    `${API_URL}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/attachments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not upload image',
    );
  }

  const attachments = parseMessageAttachments([result]);

  if (attachments.length === 0) {
    throw new Error('Could not upload image');
  }

  return attachments[0];
}

export type Notification = {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  relatedUserId: string | null;
  relatedConversationId: string | null;
  relatedMessageId: string | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotificationList = {
  notifications: Notification[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export async function getNotifications(page = 1, limit = 20): Promise<NotificationList> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const response = await fetch(`${API_URL}/notifications?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not load notifications',
    );
  }

  return {
    notifications: Array.isArray(result.notifications)
      ? result.notifications.flatMap((item: unknown) => {
          const notification = toNotification(item);
          return notification ? [notification] : [];
        })
      : [],
    page: typeof result.page === 'number' ? result.page : page,
    limit: typeof result.limit === 'number' ? result.limit : limit,
    total: typeof result.total === 'number' ? result.total : 0,
    totalPages: typeof result.totalPages === 'number' ? result.totalPages : 0,
  };
}

export async function markNotificationAsRead(notificationId: string): Promise<Notification> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(
    `${API_URL}/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not mark notification as read',
    );
  }

  const notification = toNotification(result);

  if (!notification) {
    throw new Error('Could not mark notification as read');
  }

  return notification;
}

export async function markAllNotificationsAsRead(): Promise<{ updated: number }> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${API_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      Array.isArray(result.message)
        ? result.message.join('\n')
        : result.message || 'Could not mark notifications as read',
    );
  }

  return {
    updated: typeof result.updated === 'number' ? result.updated : 0,
  };
}

function toNotification(value: unknown): Notification | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const notification = value as {
    id?: unknown;
    recipientId?: unknown;
    type?: unknown;
    title?: unknown;
    message?: unknown;
    relatedUserId?: unknown;
    relatedConversationId?: unknown;
    relatedMessageId?: unknown;
    isRead?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  if (typeof notification.id !== 'string' || notification.id.length === 0) {
    return null;
  }

  if (typeof notification.recipientId !== 'string' || notification.recipientId.length === 0) {
    return null;
  }

  const createdAt = toNotificationTimestamp(notification.createdAt);
  const updatedAt = toNotificationTimestamp(notification.updatedAt);

  if (createdAt.length === 0 || updatedAt.length === 0) {
    return null;
  }

  return {
    id: notification.id,
    recipientId: notification.recipientId,
    type: typeof notification.type === 'string' ? notification.type : '',
    title: typeof notification.title === 'string' ? notification.title : '',
    message: typeof notification.message === 'string' ? notification.message : '',
    relatedUserId: toNotificationId(notification.relatedUserId),
    relatedConversationId: toNotificationId(notification.relatedConversationId),
    relatedMessageId: toNotificationId(notification.relatedMessageId),
    isRead: notification.isRead === true,
    createdAt,
    updatedAt,
  };
}

function toNotificationTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === 'string' ? value : '';
}

function toNotificationId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
