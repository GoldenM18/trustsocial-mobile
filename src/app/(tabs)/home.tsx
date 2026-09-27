import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  Image,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import {
  addPostComment,
  createPost,
  deletePost,
  deletePostComment,
  getPostComments,
  getPosts,
  togglePostLike,
  uploadPostImage,
  type Post,
  type PostComment,
} from '@/services/api';

type PostWithState = Post & {
  liked?: boolean;
  comments?: PostComment[];
  commentsLoading?: boolean;
  commentsVisible?: boolean;
};

export default function HomeScreen() {
  const { logout } = useAuth();

  const [posts, setPosts] = useState<PostWithState[]>([]);
  const [content, setContent] = useState('');
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [commenting, setCommenting] = useState<Record<string, boolean>>({});
  const [liking, setLiking] = useState<Record<string, boolean>>({});
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);
const [loadingMore, setLoadingMore] = useState(false);

  const PAGE_SIZE = 10;

const loadPosts = useCallback(
  async (requestedPage = 1, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const result = await getPosts(
        requestedPage,
        PAGE_SIZE,
      );

      if (append) {
        setPosts((current) => {
          const existingIds = new Set(
            current.map((post) => post.id),
          );

          const incomingPosts = result.posts.map((post) => {
            const existing = current.find(
              (item) => item.id === post.id,
            );

            return {
              ...post,
              liked: existing?.liked ?? false,
              comments: existing?.comments,
              commentsLoading: false,
              commentsVisible:
                existing?.commentsVisible ?? false,
            };
          });

          return [
            ...current,
            ...incomingPosts.filter(
              (post) => !existingIds.has(post.id),
            ),
          ];
        });
      } else {
        setPosts((current) =>
          result.posts.map((post) => {
            const existing = current.find(
              (item) => item.id === post.id,
            );

            return {
              ...post,
              liked: existing?.liked ?? false,
              comments: existing?.comments,
              commentsLoading: false,
              commentsVisible:
                existing?.commentsVisible ?? false,
            };
          }),
        );
      }

      setPage(result.page);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load posts:', error);

      if (!append) {
        Alert.alert(
          'Feed error',
          error instanceof Error
            ? error.message
            : 'Could not load posts.',
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  },
  [],
);

useEffect(() => {
  void loadPosts(1, false);
}, [loadPosts]);

const handleLoadMore = () => {
  if (
    loading ||
    refreshing ||
    loadingMore ||
    !hasMore
  ) {
    return;
  }

  void loadPosts(page + 1, true);
};

const handleRefresh = () => {
    setRefreshing(true);
    void loadPosts();
  };

  const handlePickImage = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Photo permission required',
        'Allow TrustSocial to access your photos to attach an image.',
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });

    if (!result.canceled && result.assets.length > 0) {
      setSelectedImage(result.assets[0]);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
  };

  const handleCreatePost = async () => {
    const trimmed = content.trim();

    if (!trimmed && !selectedImage) {
      Alert.alert(
        'Create a post',
        'Write something or select an image.',
      );
      return;
    }

    if (trimmed.length > 5000) {
      Alert.alert(
        'Post too long',
        'Posts can contain up to 5000 characters.',
      );
      return;
    }

    try {
      setPosting(true);

      let imageUrl: string | null = null;

      if (selectedImage) {
        imageUrl = await uploadPostImage(
          selectedImage.uri,
          selectedImage.fileName ?? undefined,
          selectedImage.mimeType ?? undefined,
        );
      }

      const post = await createPost(trimmed, imageUrl);

      setPosts((current) => [
        {
          ...post,
          liked: false,
          comments: [],
          commentsLoading: false,
          commentsVisible: false,
        },
        ...current,
      ]);

      setContent('');
      setSelectedImage(null);
    } catch (error) {
      console.error('Failed to create post:', error);

      Alert.alert(
        'Post failed',
        error instanceof Error
          ? error.message
          : 'We could not publish your post.',
      );
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deletePost(postId);

      setPosts((current) =>
        current.filter((post) => post.id !== postId),
      );
    } catch (error) {
      console.error('Failed to delete post:', error);
      Alert.alert(
        'Delete failed',
        error instanceof Error
          ? error.message
          : 'Could not delete the post.',
      );
    }
  };

  const handleLike = async (postId: string) => {
    if (liking[postId]) {
      return;
    }

    try {
      setLiking((current) => ({
        ...current,
        [postId]: true,
      }));

      const result = await togglePostLike(postId);

      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                liked: result.liked,
                likeCount: result.likeCount,
              }
            : post,
        ),
      );
    } catch (error) {
      console.error('Failed to update like:', error);

      Alert.alert(
        'Like failed',
        error instanceof Error
          ? error.message
          : 'We could not update the like.',
      );
    } finally {
      setLiking((current) => ({
        ...current,
        [postId]: false,
      }));
    }
  };

  const toggleComments = async (postId: string) => {
    const post = posts.find((item) => item.id === postId);

    if (!post) {
      return;
    }

    if (post.commentsVisible) {
      setPosts((current) =>
        current.map((item) =>
          item.id === postId
            ? {
                ...item,
                commentsVisible: false,
              }
            : item,
        ),
      );

      return;
    }

    setPosts((current) =>
      current.map((item) =>
        item.id === postId
          ? {
              ...item,
              commentsVisible: true,
              commentsLoading: true,
            }
          : item,
      ),
    );

    try {
      const comments = await getPostComments(postId);

      setPosts((current) =>
        current.map((item) =>
          item.id === postId
            ? {
                ...item,
                comments,
                commentsLoading: false,
                commentsVisible: true,
              }
            : item,
        ),
      );
    } catch (error) {
      console.error('Failed to load comments:', error);

      setPosts((current) =>
        current.map((item) =>
          item.id === postId
            ? {
                ...item,
                commentsLoading: false,
              }
            : item,
        ),
      );

      Alert.alert(
        'Comments unavailable',
        error instanceof Error
          ? error.message
          : 'We could not load comments.',
      );
    }
  };

  const handleAddComment = async (postId: string) => {
    const text = (commentText[postId] ?? '').trim();

    if (!text) {
      return;
    }

    if (text.length > 2000) {
      Alert.alert(
        'Comment too long',
        'Comments can contain up to 2000 characters.',
      );
      return;
    }

    if (commenting[postId]) {
      return;
    }

    try {
      setCommenting((current) => ({
        ...current,
        [postId]: true,
      }));

      const comment = await addPostComment(postId, text);

      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [...(post.comments ?? []), comment],
                commentCount: post.commentCount + 1,
                commentsVisible: true,
              }
            : post,
        ),
      );

      setCommentText((current) => ({
        ...current,
        [postId]: '',
      }));
    } catch (error) {
      console.error('Failed to add comment:', error);

      Alert.alert(
        'Comment failed',
        error instanceof Error
          ? error.message
          : 'We could not add your comment.',
      );
    } finally {
      setCommenting((current) => ({
        ...current,
        [postId]: false,
      }));
    }
  };

  const handleDeleteComment = async (
    postId: string,
    commentId: string,
  ) => {
    try {
      await deletePostComment(commentId);

      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: (post.comments ?? []).filter(
                  (comment) => comment.id !== commentId,
                ),
                commentCount: Math.max(0, post.commentCount - 1),
              }
            : post,
        ),
      );
    } catch (error) {
      console.error('Failed to delete comment:', error);
      Alert.alert(
        'Delete failed',
        error instanceof Error
          ? error.message
          : 'Could not delete the comment.',
      );
    }
  };

  const renderPost = ({ item }: { item: PostWithState }) => (
    <View style={styles.postCard}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() =>
          router.push({
            pathname: '/post-detail',
            params: { id: item.id },
          })
        }>
        <View style={styles.postHeader}>
          <View style={styles.avatar}>
            {item.author?.profilePhotoUrl ? (
              <Image
                source={{ uri: item.author.profilePhotoUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <ThemedText style={styles.avatarText}>
                {(item.author?.fullName || 'T').charAt(0).toUpperCase()}
              </ThemedText>
            )}
          </View>

          <View style={styles.authorInfo}>
            <View style={styles.authorNameRow}>
              <ThemedText style={styles.authorName}>
                {item.author?.fullName || 'TrustSocial member'}
              </ThemedText>

              {item.author?.isVerified ? (
                <ThemedText style={styles.verifiedBadge}>✓</ThemedText>
              ) : null}
            </View>

            <ThemedText style={styles.usernameText}>
              @{item.author?.username || 'member'}
            </ThemedText>

            <ThemedText style={styles.dateText}>
              {new Date(item.createdAt).toLocaleString()}
            </ThemedText>
          </View>

          <TouchableOpacity
            onPress={() => void handleDeletePost(item.id)}
            style={styles.deleteButton}>
            <ThemedText style={styles.deleteText}>Delete</ThemedText>
          </TouchableOpacity>
        </View>

        {item.content ? (
          <ThemedText style={styles.postContent}>
            {item.content}
          </ThemedText>
        ) : null}

        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.postImage}
            resizeMode="cover"
          />
        ) : null}
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => void handleLike(item.id)}
          disabled={liking[item.id]}
          style={styles.actionButton}>
          <ThemedText
            style={[
              styles.actionText,
              item.liked ? styles.likedText : undefined,
            ]}>
            {item.liked ? '♥' : '♡'} {item.likeCount}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void toggleComments(item.id)}
          style={styles.actionButton}>
          <ThemedText style={styles.actionText}>
            💬 {item.commentCount}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {item.commentsVisible && (
        <View style={styles.commentsSection}>
          {item.commentsLoading ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              {(item.comments ?? []).map((comment) => (
                <View key={comment.id} style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <ThemedText style={styles.commentAvatarText}>
                      T
                    </ThemedText>
                  </View>

                  <View style={styles.commentBody}>
                    <ThemedText style={styles.commentUser}>
                      TrustSocial member
                    </ThemedText>

                    <ThemedText style={styles.commentText}>
                      {comment.content}
                    </ThemedText>
                  </View>

                  <TouchableOpacity
                    onPress={() =>
                      void handleDeleteComment(
                        item.id,
                        comment.id,
                      )
                    }>
                    <ThemedText style={styles.commentDelete}>
                      Delete
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.commentComposer}>
                <TextInput
                  value={commentText[item.id] ?? ''}
                  onChangeText={(text) =>
                    setCommentText((current) => ({
                      ...current,
                      [item.id]: text,
                    }))
                  }
                  placeholder="Write a comment..."
                  placeholderTextColor="#888"
                  multiline
                  maxLength={2000}
                  style={styles.commentInput}
                />

                <TouchableOpacity
                  onPress={() => void handleAddComment(item.id)}
                  disabled={commenting[item.id]}
                  style={styles.commentButton}>
                  {commenting[item.id] ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.commentButtonText}>
                      Send
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText type="title">TrustSocial</ThemedText>
          <ThemedText style={styles.tagline}>
            Share. Connect. Trust.
          </ThemedText>
        </View>

        <TouchableOpacity onPress={() => void logout()}>
          <ThemedText style={styles.logoutText}>Logout</ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.composer}>
        <ThemedText type="subtitle">Create a post</ThemedText>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor="#888"
          multiline
          maxLength={5000}
          style={styles.postInput}
        />

        {selectedImage ? (
          <View style={styles.imagePreviewContainer}>
            <Image
              source={{ uri: selectedImage.uri }}
              style={styles.imagePreview}
            />

            <TouchableOpacity
              onPress={handleRemoveImage}
              style={styles.removeImageButton}>
              <ThemedText style={styles.removeImageText}>
                Remove image
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.composerFooter}>
          <View style={styles.composerActions}>
            <ThemedText style={styles.characterCount}>
              {content.length}/5000
            </ThemedText>

            <TouchableOpacity
              onPress={() => void handlePickImage()}
              disabled={posting}
              style={styles.imageButton}>
              <ThemedText style={styles.imageButtonText}>
                + Image
              </ThemedText>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => void handleCreatePost()}
            disabled={posting}
            style={styles.postButton}>
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={styles.postButtonText}>
                Post
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ThemedText type="subtitle" style={styles.feedTitle}>
        Your feed
      </ThemedText>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.loadingText}>
            Loading your feed...
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadMoreFooter}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
          contentContainerStyle={
            posts.length === 0 ? styles.emptyContainer : styles.feed
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText type="subtitle">
                No posts yet
              </ThemedText>
              <ThemedText style={styles.emptyText}>
                Be the first person to share something.
              </ThemedText>
            </View>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  tagline: {
    opacity: 0.65,
    marginTop: 2,
  },
  logoutText: {
    fontWeight: '600',
  },
  composer: {
    marginHorizontal: 16,
    marginBottom: 18,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  postInput: {
    minHeight: 100,
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    textAlignVertical: 'top',
    color: '#111',
    backgroundColor: '#fff',
  },
  imagePreviewContainer: {
    marginTop: 12,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  removeImageButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: '#111',
    minWidth: 110,
    alignItems: 'center',
  },
  removeImageText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  characterCount: {
    opacity: 0.55,
    fontSize: 12,
  },
  imageButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: '#111',
    minWidth: 82,
    alignItems: 'center',
  },
  imageButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  postButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#111',
    minWidth: 70,
    alignItems: 'center',
  },
  postButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  feedTitle: {
    marginHorizontal: 20,
    marginBottom: 10,
  },
  feed: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  postCard: {
    padding: 16,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800',
  },
  authorInfo: {
    flex: 1,
    marginLeft: 10,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  verifiedBadge: {
    fontSize: 14,
    fontWeight: '700',
  },

  usernameText: {
    marginTop: 2,
    fontSize: 12,
    opacity: 0.65,
  },

  authorName: {
    fontWeight: '700',
  },
  dateText: {
    fontSize: 12,
    opacity: 0.55,
    marginTop: 2,
  },
  deleteButton: {
    padding: 6,
  },
  deleteText: {
    fontSize: 12,
    opacity: 0.6,
  },
  postContent: {
    marginTop: 14,
    lineHeight: 22,
  },
  loadMoreFooter: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  postImage: {
    width: '100%',
    height: 280,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 14,
    paddingTop: 10,
  },
  actionButton: {
    marginRight: 24,
  },
  actionText: {
    fontWeight: '600',
  },
  likedText: {
    fontWeight: '800',
  },
  commentsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  commentBody: {
    flex: 1,
    marginLeft: 8,
  },
  commentUser: {
    fontSize: 12,
    fontWeight: '700',
  },
  commentText: {
    marginTop: 2,
    fontSize: 14,
  },
  commentDelete: {
    fontSize: 11,
    opacity: 0.6,
    marginLeft: 8,
  },
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 6,
  },
  commentInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    color: '#111',
    backgroundColor: '#fff',
  },
  commentButton: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  commentButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    opacity: 0.6,
  },
  emptyContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    marginTop: 6,
    opacity: 0.6,
  },
});
