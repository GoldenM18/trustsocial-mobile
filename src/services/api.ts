import { getAccessToken } from '@/services/auth-storage';
const API_URL = 'http://localhost:3000';

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

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
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
    messages: Array.isArray(result.messages)
      ? result.messages.map((message: Message) => ({
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          createdAt: message.createdAt,
          readAt: typeof message.readAt === 'string' ? message.readAt : null,
        }))
      : [],
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  };
}

export async function sendConversationMessage(
  conversationId: string,
  content: string,
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
      body: JSON.stringify({ content }),
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
    createdAt: result.createdAt,
    readAt: typeof result.readAt === 'string' ? result.readAt : null,
  };
}
