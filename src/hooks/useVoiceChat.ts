'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  pendingCandidates: RTCIceCandidateInit[];
}

export interface IncomingVoiceSignal {
  from: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface VoiceTransportAdapter {
  mode: 'socketio' | 'http';
  socket: Socket | null;
  onJoinVoice: () => Promise<string[]>;
  onLeaveVoice: () => void;
  onMuteVoice: (muted: boolean) => void;
  onSpeakingVoice: (speaking: boolean) => void;
  onSignalVoice: (payload: {
    to: string;
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
}

export interface VoiceChatState {
  joined: boolean;
  joining: boolean;
  micMuted: boolean;
  deafened: boolean;
  isSpeaking: boolean;
  micLevel: number;
  error: string | null;
  connectedPeerCount: number;
  joinVoice: () => Promise<void>;
  leaveVoice: () => void;
  toggleMicMute: () => void;
  toggleDeafen: () => void;
  handleIncomingSignals: (signals: IncomingVoiceSignal[]) => void;
  syncActiveVoicePeers: (activePeerIds: string[]) => void;
}

export function useVoiceChat(
  transport: VoiceTransportAdapter,
  inRoom: boolean
): VoiceChatState {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connectedPeerCount, setConnectedPeerCount] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakingRef = useRef(false);
  const lastSpeakTimeRef = useRef(0);
  const deafenedRef = useRef(false);
  const micMutedRef = useRef(false);
  const transportRef = useRef(transport);

  deafenedRef.current = deafened;
  micMutedRef.current = micMuted;
  transportRef.current = transport;

  const updatePeerCount = useCallback(() => {
    setConnectedPeerCount(peersRef.current.size);
  }, []);

  const closePeer = useCallback(
    (peerId: string) => {
      const entry = peersRef.current.get(peerId);
      if (!entry) return;
      try {
        entry.pc.onicecandidate = null;
        entry.pc.ontrack = null;
        entry.pc.close();
      } catch {
        // ignore close errors
      }
      try {
        entry.audioEl.pause();
        entry.audioEl.srcObject = null;
        entry.audioEl.remove();
      } catch {
        // ignore cleanup errors
      }
      peersRef.current.delete(peerId);
      updatePeerCount();
    },
    [updatePeerCount]
  );

  const cleanupAll = useCallback(() => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    for (const peerId of Array.from(peersRef.current.keys())) {
      closePeer(peerId);
    }
    speakingRef.current = false;
    setIsSpeaking(false);
    setMicLevel(0);
    setJoined(false);
    setJoining(false);
    setMicMuted(false);
  }, [closePeer]);

  const createPeerConnection = useCallback(
    (peerId: string): PeerEntry => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.muted = deafenedRef.current;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      const entry: PeerEntry = { pc, audioEl, pendingCandidates: [] };
      peersRef.current.set(peerId, entry);
      updatePeerCount();

      pc.onicecandidate = (evt) => {
        if (evt.candidate) {
          transportRef.current.onSignalVoice({
            to: peerId,
            candidate: evt.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (evt) => {
        const [stream] = evt.streams;
        if (stream) {
          audioEl.srcObject = stream;
          audioEl.muted = deafenedRef.current;
          audioEl.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closePeer(peerId);
        }
      };

      return entry;
    },
    [closePeer, updatePeerCount]
  );

  const initiateOffersToPeers = useCallback(
    async (peerIds: string[]) => {
      for (const peerId of peerIds) {
        try {
          const entry = createPeerConnection(peerId);
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          transportRef.current.onSignalVoice({
            to: peerId,
            description: entry.pc.localDescription?.toJSON() as RTCSessionDescriptionInit | undefined,
          });
        } catch {
          // ignore individual peer negotiation error
        }
      }
    },
    [createPeerConnection]
  );

  const handleIncomingSignal = useCallback(
    async ({ from, description, candidate }: IncomingVoiceSignal) => {
      if (!localStreamRef.current) return;
      const entry = createPeerConnection(from);

      try {
        if (description) {
          await entry.pc.setRemoteDescription(new RTCSessionDescription(description));
          for (const queued of entry.pendingCandidates) {
            await entry.pc.addIceCandidate(new RTCIceCandidate(queued));
          }
          entry.pendingCandidates = [];

          if (description.type === 'offer') {
            const answer = await entry.pc.createAnswer();
            await entry.pc.setLocalDescription(answer);
            transportRef.current.onSignalVoice({
              to: from,
              description: entry.pc.localDescription?.toJSON() as RTCSessionDescriptionInit | undefined,
            });
          }
        } else if (candidate) {
          if (entry.pc.remoteDescription) {
            await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            entry.pendingCandidates.push(candidate);
          }
        }
      } catch {
        // ignore transient signaling race
      }
    },
    [createPeerConnection]
  );

  const handleIncomingSignals = useCallback(
    (signals: IncomingVoiceSignal[]) => {
      for (const sig of signals) {
        void handleIncomingSignal(sig);
      }
    },
    [handleIncomingSignal]
  );

  const syncActiveVoicePeers = useCallback(
    (activePeerIds: string[]) => {
      const activeSet = new Set(activePeerIds);
      for (const peerId of Array.from(peersRef.current.keys())) {
        if (!activeSet.has(peerId)) {
          closePeer(peerId);
        }
      }
    },
    [closePeer]
  );

  // Socket.IO signaling listeners (when in socketio mode)
  useEffect(() => {
    const socket = transport.socket;
    if (!socket || transport.mode !== 'socketio') return;

    const handlePeers = ({ peerIds }: { peerIds: string[] }) => {
      void initiateOffersToPeers(peerIds);
    };

    const handlePeerLeft = ({ peerId }: { peerId: string }) => {
      closePeer(peerId);
    };

    const handleSignal = (sig: IncomingVoiceSignal) => {
      void handleIncomingSignal(sig);
    };

    socket.on('voice:peers', handlePeers);
    socket.on('voice:peerLeft', handlePeerLeft);
    socket.on('voice:signal', handleSignal);

    return () => {
      socket.off('voice:peers', handlePeers);
      socket.off('voice:peerLeft', handlePeerLeft);
      socket.off('voice:signal', handleSignal);
    };
  }, [transport.socket, transport.mode, initiateOffersToPeers, closePeer, handleIncomingSignal]);

  useEffect(() => {
    if (!inRoom && joined) {
      transportRef.current.onLeaveVoice();
      cleanupAll();
    }
  }, [inRoom, joined, cleanupAll]);

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  const startVadMonitor = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);

      vadTimerRef.current = setInterval(() => {
        if (micMutedRef.current) {
          setMicLevel(0);
          if (speakingRef.current) {
            speakingRef.current = false;
            setIsSpeaking(false);
            transportRef.current.onSpeakingVoice(false);
          }
          return;
        }

        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const scaled = Math.min(100, Math.round(rms * 420));
        setMicLevel(scaled);

        const now = Date.now();
        if (rms > 0.025) {
          lastSpeakTimeRef.current = now;
          if (!speakingRef.current) {
            speakingRef.current = true;
            setIsSpeaking(true);
            transportRef.current.onSpeakingVoice(true);
          }
        } else if (speakingRef.current && now - lastSpeakTimeRef.current > 350) {
          speakingRef.current = false;
          setIsSpeaking(false);
          transportRef.current.onSpeakingVoice(false);
        }
      }, 90);
    } catch {
      // ignore AudioContext restriction
    }
  }, []);

  const joinVoice = useCallback(async () => {
    if (joined || joining) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not supported in this browser.');
      return;
    }

    setJoining(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setJoined(true);
      setJoining(false);
      setMicMuted(false);
      startVadMonitor(stream);

      const peerIds = await transportRef.current.onJoinVoice();
      if (peerIds.length > 0 && transportRef.current.mode === 'http') {
        await initiateOffersToPeers(peerIds);
      }
    } catch (err) {
      setJoining(false);
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow mic access in browser settings to join voice chat.'
          : 'Could not access microphone. Check your audio input device.';
      setError(msg);
    }
  }, [joined, joining, startVadMonitor, initiateOffersToPeers]);

  const leaveVoice = useCallback(() => {
    transportRef.current.onLeaveVoice();
    cleanupAll();
  }, [cleanupAll]);

  const toggleMicMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !micMutedRef.current;
    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = !next;
    }
    setMicMuted(next);
    if (next) {
      speakingRef.current = false;
      setIsSpeaking(false);
      setMicLevel(0);
    }
    transportRef.current.onMuteVoice(next);
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    setDeafened(next);
    for (const entry of peersRef.current.values()) {
      entry.audioEl.muted = next;
    }
  }, []);

  return {
    joined,
    joining,
    micMuted,
    deafened,
    isSpeaking,
    micLevel,
    error,
    connectedPeerCount,
    joinVoice,
    leaveVoice,
    toggleMicMute,
    toggleDeafen,
    handleIncomingSignals,
    syncActiveVoicePeers,
  };
}
