import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import {
  addPostComment,
  deletePostComment,
  getCurrentUser,
  getPost,
  getPostComments,
  togglePostLike,
  type Post,
  type PostComment,
} from '@/services/api';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const postId = Array.isArray(id) ? id[0] : id;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [liking, setLiking] = useState(false);
  const [liked, setLiked] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadPost = useCallback(async () => {
    if (!postId) {
      return;
    }

    try {
      setLoading(true);

      const result = await getPost(postId);

      setPost(result);
      setLiked(result.liked ?? false);
    } catch (error) {
      console.error('Failed to load post:', error);

      Alert.alert(
        'Post unavailable',
        error instanceof Error
          ? error.message
          : 'Could not load this post.',
        [
          {
            text: 'Go back',
            onPress: () => router.back(),
          },
        ],
      );
    } finally {
      setLoading(false);
    }
  }, [postId]);

  const loadComments = useCallback(async () => {
    if (!postId) {
      return;
    }

    try {
      setCommentsLoading(true);

      const result = await getPostComments(postId);

      setComments(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error('Failed to load comments:', error);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadPost();
    void loadComments();

    void getCurrentUser()
      .then((user) => {
        setCurrentUserId(user?.id ?? null);
      })
      .catch((error) => {
        console.error('Failed to load current user:', error);
        setCurrentUserId(null);
      });
  }, [loadPost, loadComments]);

  const handleShare = async () => {
    if (!post) {
      return;
    }

    const message = `Check out this post on TrustSocial: ${post.content}`;

    try {
      if (Platform.OS === 'web') {
        const webNavigator = globalThis.navigator as Navigator & {
          clipboard?: {
            writeText: (text: string) => Promise<void>;
          };
        };

        if (webNavigator.clipboard) {
          await webNavigator.clipboard.writeText(message);
          Alert.alert('Copied', 'Post text copied to clipboard.');
        } else {
          Alert.alert('Share', message);
        }

        return;
      }

      await Share.share({
        message,
      });
    } catch (error) {
      console.error('Failed to share post:', error);
    }
  };

  const handleLike = async () => {
    if (!post || liking) {
      return;
    }

    try {
      setLiking(true);

      const result = await togglePostLike(post.id);

      setLiked(result.liked);

      setPost((current) =>
        current
          ? {
              ...current,
              likeCount: result.likeCount,
            }
          : current,
      );
    } catch (error) {
      Alert.alert(
        'Like failed',
        error instanceof Error
          ? error.message
          : 'Could not update the like.',
      );
    } finally {
      setLiking(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deletePostComment(commentId);

      setComments((current) =>
        current.filter((comment) => comment.id !== commentId),
      );

      setPost((current) =>
        current
          ? {
              ...current,
              commentCount: Math.max(0, current.commentCount - 1),
            }
          : current,
      );
    } catch (error) {
      Alert.alert(
        'Delete failed',
        error instanceof Error
          ? error.message
          : 'Could not delete the comment.',
      );
    }
  };

  const handleAddComment = async () => {
    if (!post || commenting) {
      return;
    }

    const content = commentText.trim();

    if (!content) {
      return;
    }

    try {
      setCommenting(true);

      const comment = await addPostComment(post.id, content);

      setComments((current) => [...current, comment]);
      setCommentText('');

      setPost((current) =>
        current
          ? {
              ...current,
              commentCount: current.commentCount + 1,
            }
          : current,
      );
    } catch (error) {
      Alert.alert(
        'Comment failed',
        error instanceof Error
          ? error.message
          : 'Could not add your comment.',
      );
    } finally {
      setCommenting(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={Brand.teal} />
        <ThemedText
          type="default"
          themeColor="textSecondary"
          style={styles.loadingText}>
          Loading post...
        </ThemedText>
      </ThemedView>
    );
  }

  if (!post) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">
          Post not found
        </ThemedText>

        <Pressable
          onPress={() => router.replace('/(tabs)/home')}
          style={styles.backButton}>
          <ThemedText style={styles.backButtonText}>
            Go back
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const authorName =
    post.author?.fullName?.trim() || 'TrustSocial member';

  const username = post.author?.username
    ? `@${post.author.username}`
    : '';

  const initial =
    authorName.charAt(0).toUpperCase() || 'T';

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.replace('/(tabs)/home')}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}>
          <ThemedText style={styles.backIcon}>
            ‹
          </ThemedText>
        </Pressable>

        <ThemedText type="subtitle" style={styles.headerTitle}>
          Post
        </ThemedText>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <ThemedView
          type="backgroundElement"
          style={styles.postCard}>

          {/* Author */}
          <View style={styles.authorRow}>
            {post.author?.profilePhotoUrl ? (
              <Image
                source={{ uri: post.author.profilePhotoUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <ThemedText style={styles.avatarText}>
                  {initial}
                </ThemedText>
              </View>
            )}

            <View style={styles.authorInfo}>
              <View style={styles.nameRow}>
                <ThemedText
                  type="smallBold"
                  numberOfLines={1}
                  style={styles.authorName}>
                  {authorName}
                </ThemedText>

                {post.author?.isVerified ? (
                  <View style={styles.verifiedBadge}>
                    <ThemedText style={styles.verifiedText}>
                      ✓
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              {username ? (
                <ThemedText
                  type="small"
                  themeColor="textSecondary">
                  {username}
                </ThemedText>
              ) : null}

              <ThemedText
                type="small"
                themeColor="textSecondary">
                {formatDate(post.createdAt)}
              </ThemedText>
            </View>
          </View>

          {/* Post text */}
          {post.content ? (
            <ThemedText
              type="default"
              style={styles.postText}>
              {post.content}
            </ThemedText>
          ) : null}

          {/* Post image */}
          {post.imageUrl ? (
            <Image
              source={{ uri: post.imageUrl }}
              style={styles.postImage}
              resizeMode="cover"
            />
          ) : null}

          {/* Interaction row */}
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                liked ? 'Unlike post' : 'Like post'
              }
              disabled={liking}
              onPress={handleLike}
              style={({ pressed }) => [
                styles.actionButton,
                styles.webPressable,
                pressed && styles.pressed,
              ]}>
              <ThemedText
                style={[
                  styles.actionIcon,
                  liked && styles.likedIcon,
                ]}>
                {liked ? '♥' : '♡'}
              </ThemedText>

              <ThemedText
                type="default"
                style={liked ? styles.likedText : undefined}>
                {post.likeCount ?? 0}
              </ThemedText>
            </Pressable>

            <View style={styles.actionButton}>
              <ThemedText style={styles.actionIcon}>
                💬
              </ThemedText>

              <ThemedText>
                {post.commentCount ?? comments.length}
              </ThemedText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share post"
              onPress={handleShare}
              style={({ pressed }) => [
                styles.actionButton,
                styles.webPressable,
                pressed && styles.pressed,
              ]}>
              <ThemedText style={styles.actionIcon}>
                ↗
              </ThemedText>

              <ThemedText>
                Share
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>

        {/* Comments */}
        <View style={styles.commentsSection}>
          <ThemedText type="subtitle">
            Comments
          </ThemedText>

          {commentsLoading ? (
            <View style={styles.commentsLoading}>
              <ActivityIndicator
                size="small"
                color={Brand.teal}
              />

              <ThemedText
                type="small"
                themeColor="textSecondary">
                Loading comments...
              </ThemedText>
            </View>
          ) : comments.length === 0 ? (
            <ThemedView
              type="backgroundElement"
              style={styles.emptyComments}>
              <ThemedText
                type="default"
                themeColor="textSecondary">
                No comments yet.
              </ThemedText>

              <ThemedText
                type="small"
                themeColor="textSecondary">
                Be the first to comment.
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={styles.commentsList}>
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  isOwnComment={comment.userId === currentUserId}
                  onDelete={() => void handleDeleteComment(comment.id)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Comment composer */}
        <ThemedView
          type="backgroundElement"
          style={styles.composer}>
          <TextInput
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Write a comment..."
            placeholderTextColor="#8A8A8A"
            multiline
            maxLength={2000}
            editable={!commenting}
            style={styles.input}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            disabled={!commentText.trim() || commenting}
            onPress={() => void handleAddComment()}
            style={({ pressed }) => [
              styles.sendButton,
              (!commentText.trim() || commenting) &&
                styles.sendButtonDisabled,
              pressed && styles.pressed,
            ]}>
            {commenting ? (
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />
            ) : (
              <ThemedText style={styles.sendText}>
                Post
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </ThemedView>
  );
}

function CommentItem({
  comment,
  isOwnComment,
  onDelete,
}: {
  comment: PostComment;
  isOwnComment: boolean;
  onDelete: () => void;
}) {
  const authorName =
    comment.author?.fullName?.trim() || 'TrustSocial member';

  const username = comment.author?.username
    ? `@${comment.author.username}`
    : '';

  const initial =
    authorName.charAt(0).toUpperCase() || 'T';

  return (
    <ThemedView
      type="backgroundElement"
      style={styles.commentCard}>
      {comment.author?.profilePhotoUrl ? (
        <Image
          source={{ uri: comment.author.profilePhotoUrl }}
          style={styles.commentAvatarImage}
        />
      ) : (
        <View style={styles.commentAvatar}>
          <ThemedText style={styles.commentAvatarText}>
            {initial}
          </ThemedText>
        </View>
      )}

      <View style={styles.commentBody}>
        <View style={styles.commentNameRow}>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            style={styles.commentAuthor}>
            {authorName}
          </ThemedText>

          {comment.author?.isVerified ? (
            <View style={styles.commentVerifiedBadge}>
              <ThemedText style={styles.commentVerifiedText}>
                ✓
              </ThemedText>
            </View>
          ) : null}
        </View>

        {username ? (
          <ThemedText
            type="small"
            themeColor="textSecondary">
            {username}
          </ThemedText>
        ) : null}

        <ThemedText style={styles.commentText}>
          {comment.content}
        </ThemedText>

        <View style={styles.commentFooter}>
          <ThemedText
            type="small"
            themeColor="textSecondary">
            {formatDate(comment.createdAt)}
          </ThemedText>

          {isOwnComment ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete comment"
              onPress={onDelete}
              style={({ pressed }) => [
                styles.deleteCommentButton,
                pressed && styles.pressed,
              ]}>
              <ThemedText style={styles.deleteCommentText}>
                Delete
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ThemedView>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },

  loadingText: {
    marginTop: Spacing.one,
  },

  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },

  headerButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },

  backIcon: {
    fontSize: 38,
    lineHeight: 38,
    fontWeight: '300',
  },

  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },

  headerSpacer: {
    width: 42,
  },

  scroll: {
    flex: 1,
  },

  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },

  postCard: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
  },

  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },

  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.teal,
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },

  authorInfo: {
    flex: 1,
    gap: 2,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  authorName: {
    flexShrink: 1,
  },

  verifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Brand.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },

  verifiedText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  postText: {
    fontSize: 17,
    lineHeight: 25,
  },

  postImage: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    backgroundColor: '#E5E5E5',
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
  },

  actionButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: Spacing.one,
  },

  webPressable: {
    cursor: 'pointer',
    zIndex: 10,
  },

  actionIcon: {
    fontSize: 25,
  },

  likedIcon: {
    color: '#E53935',
  },

  likedText: {
    color: '#E53935',
  },

  commentsSection: {
    gap: Spacing.three,
  },

  commentsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },

  emptyComments: {
    borderRadius: 14,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },

  commentsList: {
    gap: Spacing.two,
  },

  commentCard: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderRadius: 14,
    padding: Spacing.three,
  },

  commentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Brand.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },

  commentAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },

  commentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  commentVerifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Brand.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },

  commentVerifiedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  commentAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  commentBody: {
    flex: 1,
    gap: 3,
  },

  commentAuthor: {
    fontSize: 14,
  },

  commentText: {
    fontSize: 15,
    lineHeight: 21,
  },

  commentDate: {
    marginTop: 2,
  },

  commentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: 2,
  },

  deleteCommentButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  deleteCommentText: {
    color: '#D32F2F',
    fontSize: 13,
    fontWeight: '600',
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    borderRadius: 16,
    padding: Spacing.two,
  },

  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(128,128,128,0.12)',
    color: '#111111',
    fontSize: 15,
  },

  sendButton: {
    minWidth: 62,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.teal,
    paddingHorizontal: 14,
  },

  sendButtonDisabled: {
    opacity: 0.45,
  },

  sendText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Brand.teal,
  },

  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  bottomSpace: {
    height: 30,
  },

  pressed: {
    opacity: 0.65,
  },
});
