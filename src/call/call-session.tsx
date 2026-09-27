import { router, usePathname } from 'expo-router';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import {
  addVoiceIceCandidate,
  applyVoiceAnswer,
  createVoiceAnswer,
  createVoiceCall,
  createVoiceOffer,
  setVoiceMicrophoneMuted,
  watchVoiceConnectionState,
  watchVoiceIceCandidates,
  type VoiceCall,
  type VoiceConnectionState,
  type VoiceSessionDescription,
} from '@/call/webrtc';
import { getPublicProfile } from '@/services/api';
import {
  connectCallSocket,
  type CallAnswerEvent,
  type CallIceCandidateEvent,
  type CallOfferEvent,
  type CallSocketHandle,
} from '@/services/socket';

export type CallPhase = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' | 'rejected';

type CallSessionState = {
  phase: CallPhase;
  callId: string;
  conversationId: string;
  peerName: string;
  peerUserId: string;
  error: string;
  webrtcState: VoiceConnectionState | null;
  webrtcEstablished: boolean;
  muted: boolean;
};

type CallSessionContextValue = CallSessionState & {
  startOutgoing: (conversationId: string, peerName: string) => void;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  end: () => Promise<void>;
  toggleMute: () => void;
};

const IDLE: CallSessionState = {
  phase: 'idle',
  callId: '',
  conversationId: '',
  peerName: '',
  peerUserId: '',
  error: '',
  webrtcState: null,
  webrtcEstablished: false,
  muted: false,
};

const CallSessionContext = createContext<CallSessionContextValue | undefined>(undefined);

function closeVoiceCall(voiceRef: { current: VoiceCall | null }) {
  voiceRef.current?.close();
  voiceRef.current = null;
}

type CallRole = 'caller' | 'callee';

type NegotiationRefs = {
  sessionRef: { current: CallSessionState };
  voiceRef: { current: VoiceCall | null };
  handleRef: { current: CallSocketHandle | null };
  roleRef: { current: CallRole | null };
  offerSentRef: { current: string };
  answerSentRef: { current: string };
  answerAppliedRef: { current: string };
  pendingOfferRef: { current: CallOfferEvent | null };
  pendingAnswerRef: { current: CallAnswerEvent | null };
  pendingIceRef: { current: CallIceCandidateEvent[] };
  appliedIceRef: { current: Set<string> };
  reportError: (callId: string, error: unknown, fallback: string) => void;
};

function iceCandidateKey(event: CallIceCandidateEvent): string {
  return `${event.callId}:${event.candidate.candidate}:${event.candidate.sdpMid ?? ''}:${event.candidate.sdpMLineIndex ?? ''}`;
}

function queueRemoteOffer(refs: NegotiationRefs, event: CallOfferEvent) {
  const current = refs.sessionRef.current;

  if (refs.roleRef.current !== 'callee' || current.callId !== event.callId || event.sdp.type !== 'offer') {
    return;
  }

  if (current.phase !== 'connected' || !refs.voiceRef.current) {
    refs.pendingOfferRef.current = event;
    return;
  }

  refs.pendingOfferRef.current = null;
  void sendVoiceAnswer(refs, refs.voiceRef.current, event.callId, event.sdp);
}

function queueRemoteAnswer(refs: NegotiationRefs, event: CallAnswerEvent) {
  const current = refs.sessionRef.current;

  if (refs.roleRef.current !== 'caller' || current.callId !== event.callId || event.sdp.type !== 'answer') {
    return;
  }

  const voice = refs.voiceRef.current;

  if (current.phase !== 'connected' || !voice || voice.connection.signalingState !== 'have-local-offer') {
    refs.pendingAnswerRef.current = event;
    return;
  }

  refs.pendingAnswerRef.current = null;
  void applyRemoteAnswer(refs, voice, event.callId, event.sdp);
}

async function sendVoiceOffer(refs: NegotiationRefs, voice: VoiceCall, callId: string) {
  if (refs.roleRef.current !== 'caller' || refs.offerSentRef.current === callId) {
    return;
  }

  refs.offerSentRef.current = callId;

  try {
    const offer = await createVoiceOffer(voice);

    if (refs.voiceRef.current !== voice || refs.sessionRef.current.callId !== callId) {
      return;
    }

    await refs.handleRef.current?.offer(callId, offer);

    const pending = refs.pendingAnswerRef.current;

    if (pending?.callId === callId && refs.voiceRef.current === voice) {
      refs.pendingAnswerRef.current = null;
      await applyRemoteAnswer(refs, voice, callId, pending.sdp);
    }
  } catch (offerError) {
    if (refs.voiceRef.current !== voice || refs.sessionRef.current.phase !== 'connected') {
      return;
    }

    if (refs.offerSentRef.current === callId) {
      refs.offerSentRef.current = '';
    }

    refs.reportError(callId, offerError, 'Unable to create call offer');
  }
}

async function sendVoiceAnswer(
  refs: NegotiationRefs,
  voice: VoiceCall,
  callId: string,
  offer: VoiceSessionDescription,
) {
  if (refs.roleRef.current !== 'callee' || refs.answerSentRef.current === callId) {
    return;
  }

  refs.answerSentRef.current = callId;

  try {
    const answer = await createVoiceAnswer(voice, offer);

    if (refs.voiceRef.current !== voice || refs.sessionRef.current.callId !== callId) {
      return;
    }

    await flushQueuedIce(refs, voice, callId);
    await refs.handleRef.current?.answer(callId, answer);
  } catch (answerError) {
    if (refs.voiceRef.current !== voice || refs.sessionRef.current.phase !== 'connected') {
      return;
    }

    if (refs.answerSentRef.current === callId) {
      refs.answerSentRef.current = '';
    }

    refs.reportError(callId, answerError, 'Unable to create call answer');
  }
}

async function applyRemoteAnswer(
  refs: NegotiationRefs,
  voice: VoiceCall,
  callId: string,
  answer: VoiceSessionDescription,
) {
  if (refs.answerAppliedRef.current === callId) {
    return;
  }

  refs.answerAppliedRef.current = callId;

  try {
    await applyVoiceAnswer(voice, answer);
    await flushQueuedIce(refs, voice, callId);
  } catch (answerError) {
    if (refs.voiceRef.current !== voice || refs.sessionRef.current.phase !== 'connected') {
      return;
    }

    if (refs.answerAppliedRef.current === callId) {
      refs.answerAppliedRef.current = '';
    }

    refs.reportError(callId, answerError, 'Unable to apply call answer');
  }
}

function queueRemoteIce(refs: NegotiationRefs, event: CallIceCandidateEvent) {
  const current = refs.sessionRef.current;

  if (current.callId !== event.callId || current.phase !== 'connected') {
    return;
  }

  const key = iceCandidateKey(event);

  if (refs.appliedIceRef.current.has(key)) {
    return;
  }

  const voice = refs.voiceRef.current;

  if (!voice || !voice.connection.remoteDescription) {
    if (!refs.pendingIceRef.current.some((queued) => iceCandidateKey(queued) === key)) {
      refs.pendingIceRef.current.push(event);
    }

    return;
  }

  void applyIncomingIce(refs, voice, event);
}

async function applyIncomingIce(refs: NegotiationRefs, voice: VoiceCall, event: CallIceCandidateEvent) {
  if (refs.sessionRef.current.callId !== event.callId || refs.voiceRef.current !== voice) {
    return;
  }

  const key = iceCandidateKey(event);

  if (refs.appliedIceRef.current.has(key)) {
    return;
  }

  if (!voice.connection.remoteDescription) {
    if (!refs.pendingIceRef.current.some((queued) => iceCandidateKey(queued) === key)) {
      refs.pendingIceRef.current.push(event);
    }

    return;
  }

  refs.appliedIceRef.current.add(key);

  try {
    await addVoiceIceCandidate(voice, event.candidate);
  } catch (iceError) {
    refs.appliedIceRef.current.delete(key);

    if (refs.voiceRef.current !== voice || refs.sessionRef.current.phase !== 'connected') {
      return;
    }

    refs.reportError(event.callId, iceError, 'Unable to apply ICE candidate');
  }
}

async function flushQueuedIce(refs: NegotiationRefs, voice: VoiceCall, callId: string) {
  if (refs.voiceRef.current !== voice || !voice.connection.remoteDescription) {
    return;
  }

  const queued = refs.pendingIceRef.current.filter((event) => event.callId === callId);
  refs.pendingIceRef.current = refs.pendingIceRef.current.filter((event) => event.callId !== callId);

  for (const event of queued) {
    if (refs.voiceRef.current !== voice) {
      return;
    }

    await applyIncomingIce(refs, voice, event);
  }
}

function matchesCall(current: CallSessionState, callId: string, conversationId: string): boolean {
  if (current.phase === 'idle' || current.phase === 'ended' || current.phase === 'rejected') {
    return false;
  }

  if (current.callId) {
    return current.callId === callId;
  }

  return current.conversationId === conversationId;
}

export function CallSessionProvider({
  enabled,
  children,
}: PropsWithChildren<{ enabled: boolean }>) {
  const pathname = usePathname();
  const [session, setSession] = useState<CallSessionState>(IDLE);
  const sessionRef = useRef(session);
  const handleRef = useRef<CallSocketHandle | null>(null);
  const inviteKeyRef = useRef('');
  const voiceRef = useRef<VoiceCall | null>(null);
  const roleRef = useRef<CallRole | null>(null);
  const offerSentRef = useRef('');
  const answerSentRef = useRef('');
  const answerAppliedRef = useRef('');
  const pendingOfferRef = useRef<CallOfferEvent | null>(null);
  const pendingAnswerRef = useRef<CallAnswerEvent | null>(null);
  const pendingIceRef = useRef<CallIceCandidateEvent[]>([]);
  const appliedIceRef = useRef(new Set<string>());
  sessionRef.current = session;

  function reportNegotiationError(callId: string, error: unknown, fallback: string) {
    const message = error instanceof Error && error.message ? error.message : fallback;

    setSession((current) =>
      current.phase === 'connected' && current.callId === callId ? { ...current, error: message } : current,
    );
  }

  const negotiationRef = useRef<NegotiationRefs>({
    sessionRef,
    voiceRef,
    handleRef,
    roleRef,
    offerSentRef,
    answerSentRef,
    answerAppliedRef,
    pendingOfferRef,
    pendingAnswerRef,
    pendingIceRef,
    appliedIceRef,
    reportError: reportNegotiationError,
  });
  negotiationRef.current = {
    sessionRef,
    voiceRef,
    handleRef,
    roleRef,
    offerSentRef,
    answerSentRef,
    answerAppliedRef,
    pendingOfferRef,
    pendingAnswerRef,
    pendingIceRef,
    appliedIceRef,
    reportError: reportNegotiationError,
  };

  useEffect(() => {
    if (!enabled) {
      closeVoiceCall(voiceRef);
      handleRef.current?.disconnect();
      handleRef.current = null;
      inviteKeyRef.current = '';
      roleRef.current = null;
      offerSentRef.current = '';
      answerSentRef.current = '';
      answerAppliedRef.current = '';
      pendingOfferRef.current = null;
      pendingAnswerRef.current = null;
      pendingIceRef.current = [];
      appliedIceRef.current.clear();
      setSession(IDLE);
      return;
    }

    const handle = connectCallSocket({
      onIncoming(event) {
        const current = sessionRef.current;

        if (current.phase !== 'idle') {
          return;
        }

        inviteKeyRef.current = '';
        roleRef.current = 'callee';
        setSession({
          phase: 'incoming',
          callId: event.callId,
          conversationId: event.conversationId,
          peerName: '',
          peerUserId: event.callerId,
          error: '',
          webrtcState: null,
          webrtcEstablished: false,
          muted: false,
        });
        router.push('/call');
      },
      onAccepted(event) {
        setSession((current) =>
          current.callId === event.callId ? { ...current, phase: 'connected', error: '' } : current,
        );
      },
      onRejected(event) {
        setSession((current) =>
          matchesCall(current, event.callId, event.conversationId)
            ? { ...current, callId: event.callId, phase: 'rejected', muted: false }
            : current,
        );
      },
      onEnded(event) {
        setSession((current) =>
          matchesCall(current, event.callId, event.conversationId)
            ? { ...current, callId: event.callId, phase: 'ended', muted: false }
            : current,
        );
      },
      onOffer(event) {
        queueRemoteOffer(negotiationRef.current, event);
      },
      onAnswer(event) {
        queueRemoteAnswer(negotiationRef.current, event);
      },
      onIceCandidate(event) {
        queueRemoteIce(negotiationRef.current, event);
      },
    });
    handleRef.current = handle;

    return () => {
      closeVoiceCall(voiceRef);
      handle.disconnect();
      if (handleRef.current === handle) {
        handleRef.current = null;
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!session.peerUserId || session.peerName) {
      return;
    }

    let cancelled = false;

    void getPublicProfile(session.peerUserId)
      .then((profile) => {
        if (cancelled) {
          return;
        }

        const name = profile.fullName.trim() || profile.username;
        setSession((current) =>
          current.peerUserId === session.peerUserId ? { ...current, peerName: name } : current,
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [session.peerUserId, session.peerName]);

  useEffect(() => {
    if (session.phase !== 'calling' || !session.conversationId || session.callId) {
      return;
    }

    if (inviteKeyRef.current === session.conversationId) {
      return;
    }

    const conversationId = session.conversationId;
    inviteKeyRef.current = conversationId;

    void handleRef.current
      ?.invite(conversationId)
      .then((result) => {
        const current = sessionRef.current;

        if (current.phase !== 'calling' || current.conversationId !== conversationId) {
          void handleRef.current?.end(result.callId).catch(() => undefined);
          return;
        }

        setSession({ ...current, callId: result.callId, error: '' });
      })
      .catch((inviteError: unknown) => {
        if (inviteKeyRef.current === conversationId) {
          inviteKeyRef.current = '';
        }

        setSession((current) => {
          if (current.conversationId !== conversationId || current.phase !== 'calling') {
            return current;
          }

          return {
            ...current,
            phase: 'ended',
            error: inviteError instanceof Error ? inviteError.message : 'Unable to start call',
          };
        });
      });
  }, [session.phase, session.conversationId, session.callId]);

  useEffect(() => {
    if (session.phase !== 'connected' || !session.callId) {
      return;
    }

    const callId = session.callId;
    let cancelled = false;

    void createVoiceCall(() => undefined)
      .then(async (voice) => {
        if (cancelled || sessionRef.current.phase !== 'connected' || sessionRef.current.callId !== callId) {
          voice.close();
          return;
        }

        voiceRef.current = voice;
        watchVoiceIceCandidates(voice, (candidate) => {
          if (sessionRef.current.phase !== 'connected' || sessionRef.current.callId !== callId || voiceRef.current !== voice) {
            return;
          }

          void handleRef.current?.iceCandidate(callId, candidate).catch((iceError: unknown) => {
            if (sessionRef.current.phase !== 'connected' || sessionRef.current.callId !== callId || voiceRef.current !== voice) {
              return;
            }

            reportNegotiationError(callId, iceError, 'Unable to send ICE candidate');
          });
        });
        watchVoiceConnectionState(voice, (state) => {
          if (sessionRef.current.callId !== callId) {
            return;
          }

          setSession((current) => {
            if (current.callId !== callId) {
              return current;
            }

            return {
              ...current,
              webrtcState: state,
              webrtcEstablished: state === 'connected' || current.webrtcEstablished,
              error: state === 'failed' ? 'The voice connection failed.' : current.error,
              muted: state === 'closed' ? false : current.muted,
            };
          });

          if (state === 'closed' && voiceRef.current === voice) {
            closeVoiceCall(voiceRef);
          }
        });

        if (roleRef.current === 'caller') {
          await sendVoiceOffer(negotiationRef.current, voice, callId);
          return;
        }

        const pendingOffer = pendingOfferRef.current;

        if (pendingOffer?.callId === callId) {
          pendingOfferRef.current = null;
          await sendVoiceAnswer(negotiationRef.current, voice, callId, pendingOffer.sdp);
        }
      })
      .catch((mediaError: unknown) => {
        if (cancelled || sessionRef.current.phase !== 'connected' || sessionRef.current.callId !== callId) {
          return;
        }

        setSession((current) =>
          current.phase === 'connected' && current.callId === callId
            ? {
                ...current,
                error: mediaError instanceof Error ? mediaError.message : 'Unable to access the microphone',
              }
            : current,
        );
      });

    return () => {
      cancelled = true;

      if (offerSentRef.current === callId) {
        offerSentRef.current = '';
      }

      if (answerSentRef.current === callId) {
        answerSentRef.current = '';
      }

      if (answerAppliedRef.current === callId) {
        answerAppliedRef.current = '';
      }

      pendingIceRef.current = [];
      appliedIceRef.current.clear();
      closeVoiceCall(voiceRef);
    };
  }, [session.phase, session.callId]);

  useEffect(() => {
    if (session.phase === 'connected') {
      return;
    }

    offerSentRef.current = '';
    answerSentRef.current = '';
    answerAppliedRef.current = '';
    pendingOfferRef.current = null;
    pendingAnswerRef.current = null;
    pendingIceRef.current = [];
    appliedIceRef.current.clear();

    if (session.phase === 'idle') {
      roleRef.current = null;
    }
  }, [session.phase]);

  useEffect(() => {
    if (session.phase !== 'ended' && session.phase !== 'rejected') {
      return;
    }

    const timer = setTimeout(() => {
      inviteKeyRef.current = '';
      setSession(IDLE);

      if (pathname === '/call') {
        if (router.canGoBack()) {
          router.back();
          return;
        }

        router.replace('/home');
      }
    }, 1400);

    return () => clearTimeout(timer);
  }, [pathname, session.phase]);

  async function accept() {
    const current = sessionRef.current;

    if (current.phase !== 'incoming' || !current.callId) {
      return;
    }

    try {
      await handleRef.current?.accept(current.callId);
      setSession((next) =>
        next.callId === current.callId ? { ...next, phase: 'connected', error: '' } : next,
      );
    } catch (acceptError) {
      setSession((next) =>
        next.callId === current.callId
          ? {
              ...next,
              error: acceptError instanceof Error ? acceptError.message : 'Unable to accept call',
            }
          : next,
      );
    }
  }

  async function reject() {
    const current = sessionRef.current;

    if (current.phase !== 'incoming' || !current.callId) {
      return;
    }

    try {
      await handleRef.current?.reject(current.callId);
    } catch (rejectError) {
      setSession((next) =>
        next.callId === current.callId
          ? {
              ...next,
              error: rejectError instanceof Error ? rejectError.message : 'Unable to reject call',
            }
          : next,
      );
      return;
    }

    setSession((next) =>
      next.callId === current.callId ? { ...next, phase: 'rejected', error: '', muted: false } : next,
    );
  }

  async function end() {
    const current = sessionRef.current;

    if (current.phase !== 'calling' && current.phase !== 'connected') {
      return;
    }

    if (!current.callId) {
      inviteKeyRef.current = '';
      setSession((next) =>
        next.phase === 'calling' && next.conversationId === current.conversationId
          ? { ...next, phase: 'ended', muted: false }
          : next,
      );
      return;
    }

    try {
      await handleRef.current?.end(current.callId);
    } catch (endError) {
      setSession((next) =>
        next.callId === current.callId
          ? { ...next, error: endError instanceof Error ? endError.message : 'Unable to end call' }
          : next,
      );
    }

    setSession((next) => (next.callId === current.callId ? { ...next, phase: 'ended', muted: false } : next));
  }

  function startOutgoing(conversationId: string, peerName: string) {
    if (!conversationId || sessionRef.current.phase !== 'idle') {
      return;
    }

    inviteKeyRef.current = '';
    roleRef.current = 'caller';
    setSession({
      phase: 'calling',
      callId: '',
      conversationId,
      peerName,
      peerUserId: '',
      error: '',
      webrtcState: null,
      webrtcEstablished: false,
      muted: false,
    });
    router.push('/call');
  }

  function toggleMute() {
    const voice = voiceRef.current;
    const nextMuted = !sessionRef.current.muted;

    if (!voice || !setVoiceMicrophoneMuted(voice, nextMuted)) {
      return;
    }

    setSession((current) => ({ ...current, muted: nextMuted }));
  }

  return (
    <CallSessionContext.Provider value={{ ...session, startOutgoing, accept, reject, end, toggleMute }}>
      {children}
    </CallSessionContext.Provider>
  );
}

export function useCallSession(): CallSessionContextValue {
  const session = useContext(CallSessionContext);

  if (!session) {
    throw new Error('useCallSession must be used inside CallSessionProvider');
  }

  return session;
}
