import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useCallSession, type CallPhase } from '@/call/call-session';
import { FormButton } from '@/components/form/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/brand';
import { Spacing } from '@/constants/theme';

export default function CallScreen() {
  const session = useCallSession();
  const peerLabel = session.peerName || 'Voice call';

  function leave() {
    if (session.phase === 'incoming') {
      void session.reject();
    } else if (session.phase === 'calling' || session.phase === 'connected') {
      void session.end();
    }

    goBack();
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        <FormButton label="Back" variant="secondary" onPress={leave} />
        <ThemedText type="title">{statusLabel(session.phase)}</ThemedText>
        <ThemedText type="subtitle">{peerLabel}</ThemedText>
        {session.error ? (
          <ThemedText type="small" style={styles.error}>
            {session.error}
          </ThemedText>
        ) : null}
        {session.phase === 'incoming' ? (
          <View style={styles.actions}>
            <FormButton label="Accept" accessibilityLabel="Accept call" onPress={() => void session.accept()} />
            <FormButton
              label="Reject"
              accessibilityLabel="Reject call"
              variant="secondary"
              onPress={() => void session.reject()}
            />
          </View>
        ) : null}
        {session.phase === 'calling' ? (
          <FormButton
            label="End call"
            accessibilityLabel="End call"
            variant="secondary"
            onPress={() => void session.end()}
          />
        ) : null}
        {session.phase === 'connected' ? (
          <View style={styles.actions}>
            <FormButton
              label={session.muted ? 'Unmute' : 'Mute'}
              accessibilityLabel={session.muted ? 'Unmute microphone' : 'Mute microphone'}
              variant="secondary"
              onPress={session.toggleMute}
            />
            <FormButton
              label="End call"
              accessibilityLabel="End call"
              variant="secondary"
              onPress={() => void session.end()}
            />
          </View>
        ) : null}
      </View>
    </ThemedView>
  );
}

function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/home');
}

function statusLabel(phase: CallPhase): string {
  switch (phase) {
    case 'calling':
      return 'Calling...';
    case 'incoming':
      return 'Incoming call';
    case 'connected':
      return 'Connected';
    case 'rejected':
      return 'Call rejected';
    case 'ended':
      return 'Call ended';
    default:
      return 'No active call';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  actions: {
    gap: Spacing.three,
  },
  error: {
    color: Brand.danger,
    textAlign: 'center',
  },
});
