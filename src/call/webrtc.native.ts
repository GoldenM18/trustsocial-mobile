import { mediaDevices, MediaStream, RTCPeerConnection, type MediaStreamTrack } from 'react-native-webrtc';

const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

export type VoiceCall = {
  connection: RTCPeerConnection;
  localStream: MediaStream;
  close: () => void;
};

export type VoiceConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export async function createVoiceCall(onRemoteStream: (stream: MediaStream) => void): Promise<VoiceCall> {
  const connection = new RTCPeerConnection({ iceServers });
  const remoteStream = new MediaStream();

  connection.ontrack = (event: { track?: MediaStreamTrack | null }) => {
    const track = event.track;

    if (!track) {
      return;
    }

    remoteStream.addTrack(track);
    onRemoteStream(remoteStream);
  };

  let localStream: MediaStream;

  try {
    localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (error) {
    connection.ontrack = null;
    connection.close();
    throw error;
  }

  for (const track of localStream.getAudioTracks()) {
    connection.addTrack(track, localStream);
  }

  let stopped = false;

  return {
    connection,
    localStream,
    close() {
      if (stopped) {
        return;
      }

      stopped = true;
      connection.ontrack = null;
      connection.onicecandidate = null;

      for (const track of localStream.getTracks()) {
        track.stop();
      }

      connection.close();
      connection.onconnectionstatechange = null;
    },
  };
}

export function setVoiceMicrophoneMuted(voice: VoiceCall, muted: boolean): boolean {
  if (voice.connection.connectionState === 'closed') {
    return false;
  }

  const tracks = voice.localStream.getAudioTracks().filter((track) => track.readyState !== 'ended');

  if (tracks.length === 0) {
    return false;
  }

  for (const track of tracks) {
    track.enabled = !muted;
  }

  return true;
}

export function watchVoiceConnectionState(
  voice: VoiceCall,
  onState: (state: VoiceConnectionState) => void,
): void {
  const publish = () => {
    const state = readVoiceConnectionState(voice.connection.connectionState);

    if (state) {
      onState(state);
    }
  };

  voice.connection.onconnectionstatechange = publish;
  publish();
}

function readVoiceConnectionState(value: string): VoiceConnectionState | null {
  switch (value) {
    case 'new':
    case 'connecting':
    case 'connected':
    case 'disconnected':
    case 'failed':
    case 'closed':
      return value;
    default:
      return null;
  }
}

export type VoiceIceCandidate = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

export function watchVoiceIceCandidates(
  voice: VoiceCall,
  onCandidate: (candidate: VoiceIceCandidate) => void,
): void {
  voice.connection.onicecandidate = (event: {
    candidate?: {
      candidate?: string;
      sdpMid?: string | null;
      sdpMLineIndex?: number | null;
    } | null;
  }) => {
    const candidate = event.candidate;

    if (!candidate || typeof candidate.candidate !== 'string') {
      return;
    }

    onCandidate({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid ?? null,
      sdpMLineIndex: candidate.sdpMLineIndex ?? null,
    });
  };
}

export async function addVoiceIceCandidate(voice: VoiceCall, candidate: VoiceIceCandidate): Promise<void> {
  await voice.connection.addIceCandidate(candidate);
}

export type VoiceSessionDescription = {
  type: 'offer' | 'answer';
  sdp: string;
};

export async function createVoiceOffer(voice: VoiceCall): Promise<VoiceSessionDescription> {
  const offer = await voice.connection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
  });
  const description = readVoiceDescription(offer, 'offer');

  await voice.connection.setLocalDescription(description);
  return description;
}

export async function createVoiceAnswer(
  voice: VoiceCall,
  offer: VoiceSessionDescription,
): Promise<VoiceSessionDescription> {
  await voice.connection.setRemoteDescription(offer);
  const answer = await voice.connection.createAnswer();
  const description = readVoiceDescription(answer, 'answer');

  await voice.connection.setLocalDescription(description);
  return description;
}

export async function applyVoiceAnswer(voice: VoiceCall, answer: VoiceSessionDescription): Promise<void> {
  await voice.connection.setRemoteDescription(answer);
}

function readVoiceDescription(value: unknown, type: 'offer' | 'answer'): VoiceSessionDescription {
  if (!value || typeof value !== 'object') {
    throw new Error(type === 'offer' ? 'Unable to create call offer' : 'Unable to create call answer');
  }

  const description = value as { type?: unknown; sdp?: unknown };

  if (description.type !== type || typeof description.sdp !== 'string' || description.sdp.length === 0) {
    throw new Error(type === 'offer' ? 'Unable to create call offer' : 'Unable to create call answer');
  }

  return { type, sdp: description.sdp };
}
