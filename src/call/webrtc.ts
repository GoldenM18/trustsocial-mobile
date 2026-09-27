export type {
  VoiceCall,
  VoiceConnectionState,
  VoiceIceCandidate,
  VoiceSessionDescription,
} from './webrtc.native';

export {
  createVoiceCall,
  setVoiceMicrophoneMuted,
  createVoiceOffer,
  createVoiceAnswer,
  applyVoiceAnswer,
  addVoiceIceCandidate,
  watchVoiceIceCandidates,
  watchVoiceConnectionState,
} from './webrtc.native';
