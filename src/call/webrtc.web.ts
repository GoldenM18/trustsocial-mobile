export type VoiceConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type VoiceIceCandidate = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

export type VoiceSessionDescription = {
  type: 'offer' | 'answer';
  sdp: string;
};

export type VoiceCall = {
  connection: any;
  localStream: any;
  close: () => void;
};

const webNotSupported = (): never => {
  throw new Error(
    'Voice calling is available on the TrustSocial mobile app. Web calling is not enabled yet.'
  );
};

export async function createVoiceCall(
  _onRemoteStream: (stream: any) => void
): Promise<VoiceCall> {
  return webNotSupported();
}

export function setVoiceMicrophoneMuted(
  _voice: VoiceCall,
  _muted: boolean
): boolean {
  return false;
}

export function watchVoiceConnectionState(
  _voice: VoiceCall,
  _onState: (state: VoiceConnectionState) => void
): void {}

export function watchVoiceIceCandidates(
  _voice: VoiceCall,
  _onCandidate: (candidate: VoiceIceCandidate) => void
): void {}

export async function addVoiceIceCandidate(
  _voice: VoiceCall,
  _candidate: VoiceIceCandidate
): Promise<void> {
  return webNotSupported();
}

export async function createVoiceOffer(
  _voice: VoiceCall
): Promise<VoiceSessionDescription> {
  return webNotSupported();
}

export async function createVoiceAnswer(
  _voice: VoiceCall,
  _offer: VoiceSessionDescription
): Promise<VoiceSessionDescription> {
  return webNotSupported();
}

export async function applyVoiceAnswer(
  _voice: VoiceCall,
  _answer: VoiceSessionDescription
): Promise<void> {
  return webNotSupported();
}
