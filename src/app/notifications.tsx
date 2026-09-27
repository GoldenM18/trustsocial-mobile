import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { FormButton } from '@/components/form/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type Notification,
} from '@/services/api';
import { connectNotificationSocket, mergeNotification } from '@/services/socket';

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [readingId, setReadingId] = useState('');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const requestSeq = useRef(0);
  const hasUnread = notifications.some((notification) => !notification.isRead);

  useEffect(() => {
    void loadPage(1, true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const subscription = connectNotificationSocket((notification) => {
        setNotifications((current) => mergeNotification(current, notification));
      });

      return () => {
        subscription.disconnect();
      };
    }, []),
  );

  async function loadPage(nextPage: number, replace: boolean) {
    const seq = ++requestSeq.current;

    if (replace) {
      setIsLoading(nextPage === 1 && notifications.length === 0);
      setError('');
    } else {
      setIsLoadingMore(true);
    }

    try {
      const result = await getNotifications(nextPage, PAGE_SIZE);

      if (seq !== requestSeq.current) {
        return;
      }

      setNotifications((current) =>
        replace ? result.notifications : mergeNotifications(current, result.notifications),
      );
      setPage(result.page);
      setTotalPages(result.totalPages);
      setError('');
    } catch (loadError) {
      if (seq !== requestSeq.current) {
        return;
      }

      if (replace) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load notifications.');
      } else {
        setActionError(loadError instanceof Error ? loadError.message : 'Could not load more notifications.');
      }
    } finally {
      if (seq === requestSeq.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }

  async function refresh() {
    setIsRefreshing(true);
    setActionError('');
    await loadPage(1, true);
    setIsRefreshing(false);
  }

  async function markOne(notification: Notification) {
    if (notification.isRead || readingId || isMarkingAll) {
      return;
    }

    setReadingId(notification.id);
    setActionError('');
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
    );

    try {
      const updated = await markNotificationAsRead(notification.id);
      setNotifications((current) => current.map((item) => (item.id === notification.id ? updated : item)));
    } catch (readError) {
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? notification : item)),
      );
      setActionError(readError instanceof Error ? readError.message : 'Could not mark notification as read.');
    } finally {
      setReadingId('');
    }
  }

  async function markAll() {
    if (!hasUnread || isMarkingAll || readingId) {
      return;
    }

    const previous = notifications;
    setIsMarkingAll(true);
    setActionError('');
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));

    try {
      await markAllNotificationsAsRead();
    } catch (readError) {
      setNotifications(previous);
      setActionError(readError instanceof Error ? readError.message : 'Could not mark notifications as read.');
    } finally {
      setIsMarkingAll(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/home');
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}>
        <FormButton label="Back" variant="secondary" onPress={goBack} />
        <ThemedText type="title">Notifications</ThemedText>

        {hasUnread ? (
          <FormButton
            label="Mark all as read"
            accessibilityLabel="Mark all as read"
            variant="secondary"
            loading={isMarkingAll}
            disabled={isMarkingAll || readingId.length > 0}
            onPress={() => void markAll()}
          />
        ) : null}

        {actionError ? (
          <ThemedText type="small" style={styles.error}>
            {actionError}
          </ThemedText>
        ) : null}

        {isLoading ? <ActivityIndicator color={Brand.teal} /> : null}

        {error ? (
          <View style={styles.errorBlock}>
            <ThemedText type="default" style={styles.error}>
              {error}
            </ThemedText>
            <FormButton label="Retry" variant="secondary" onPress={() => void loadPage(1, true)} />
          </View>
        ) : null}

        {!isLoading && !error && notifications.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
            No notifications yet.
          </ThemedText>
        ) : null}

        {notifications.map((notification) => (
          <Pressable
            key={notification.id}
            accessibilityRole="button"
            accessibilityLabel={`${notification.title}. ${notification.isRead ? 'Read' : 'Unread'}`}
            accessibilityState={{ disabled: notification.isRead || readingId === notification.id }}
            disabled={notification.isRead || readingId.length > 0 || isMarkingAll}
            onPress={() => void markOne(notification)}
            style={({ pressed }) => [pressed && !notification.isRead ? styles.pressed : undefined]}>
            <ThemedView
              type="backgroundElement"
              style={[styles.row, notification.isRead ? styles.readRow : styles.unreadRow]}>
              <View style={styles.rowText}>
                <ThemedText type="default">{notification.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {notification.message}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatNotificationTime(notification.createdAt)}
                </ThemedText>
              </View>
              <ThemedText
                type="small"
                themeColor={notification.isRead ? 'textSecondary' : undefined}
                style={notification.isRead ? undefined : styles.unreadLabel}>
                {notification.isRead ? 'Read' : 'Unread'}
              </ThemedText>
            </ThemedView>
          </Pressable>
        ))}

        {!error && page < totalPages ? (
          <FormButton
            label="Load more"
            accessibilityLabel="Load more notifications"
            variant="secondary"
            loading={isLoadingMore}
            disabled={isLoadingMore}
            onPress={() => void loadPage(page + 1, false)}
          />
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function mergeNotifications(current: Notification[], next: Notification[]): Notification[] {
  const seen = new Set(current.map((notification) => notification.id));
  return [...current, ...next.filter((notification) => !seen.has(notification.id))];
}

function formatNotificationTime(value: string): string {
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  unreadRow: {
    borderLeftWidth: 4,
    borderLeftColor: Brand.teal,
  },
  readRow: {
    opacity: 0.72,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  unreadLabel: {
    color: Brand.teal,
  },
  pressed: {
    opacity: 0.7,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  errorBlock: {
    gap: Spacing.three,
  },
  error: {
    color: Brand.danger,
    textAlign: 'center',
  },
});
