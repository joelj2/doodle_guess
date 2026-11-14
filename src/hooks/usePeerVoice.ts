'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaConnection, Peer } from 'peerjs';
import type { Player } from '../shared/types.ts';

interface Link {
  call: MediaConnection;
  audio: HTMLAudioElement;
}

export interface PeerVoiceState {
  joined: boolean;
  joining: boolean;
  micMuted: boolean;
  deafened: boolean;
  isSpeaking: boolean;
  micLevel: number;
  error: string | null;
  connectedPeerCount: number;
  talkingMap: Record<string, boolean>;
  joinVoice: () => Promise<void>;
  leaveVoice: () => void;
  toggleMicMute: () => void;
  toggleDeafen: () => void;
  handleIncomingSignals: (signals: any[]) => void;
  syncActiveVoicePeers: (activePeerIds: string[]) => void;
}

export function usePeerVoice(
  peer: Peer | null,
  players: Player[],
  onSpeakingChange?: (isSpeaking: boolean) => void
): PeerVoiceState {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connectedPeerCount, setConnectedPeerCount] = useState(0);
  const [talkingMap, setTalkingMap] = useState<Record<string, boolean>>({});

  const micStreamRef = useRef<MediaStream | null>(null);
  const silentStreamRef = useRef<MediaStream | null>(null);
  const linksRef = useRef<Record<string, Link>>({});
  const metersRef = useRef<Record<string, AnalyserNode>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const localMeterRef = useRef<AnalyserNode | null>(null);

  const playersRef = useRef(players);
  playersRef.current = players;

  const joinedRef = useRef(joined);
  joinedRef.current = joined;
  const micMutedRef = useRef(micMuted);
  micMutedRef.current = micMuted;
  const deafenedRef = useRef(deafened);
  deafenedRef.current = deafened;

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtxClass();
    }
    return audioCtxRef.current;
  }, []);

  const getSilentStream = useCallback(() => {
    if (!silentStreamRef.current) {
      try {
        const ctx = getAudioCtx();
        const dest = ctx.createMediaStreamDestination();
        silentStreamRef.current = dest.stream;
      } catch {
        silentStreamRef.current = null;
      }
    }
    return silentStreamRef.current;
  }, [getAudioCtx]);

  const getOutStream = useCallback(() => {
    if (micStreamRef.current) return micStreamRef.current;
    return getSilentStream();
  }, [getSilentStream]);

  const attachMeter = useCallback((id: string, stream: MediaStream) => {
    try {
      const ctx = getAudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      metersRef.current[id] = analyser;
    } catch {
      // ignore
    }
  }, [getAudioCtx]);

  const attachCall = useCallback((remotePeerId: string, call: MediaConnection) => {
    if (linksRef.current[remotePeerId]) {
      try {
        linksRef.current[remotePeerId].call.close();
      } catch {
        // ignore
      }
    }

    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = deafenedRef.current;

    const link: Link = { call, audio };
    linksRef.current[remotePeerId] = link;
    setConnectedPeerCount(Object.keys(linksRef.current).length);

    const cleanup = () => {
      audio.pause();
      audio.srcObject = null;
      if (linksRef.current[remotePeerId] === link) {
        delete linksRef.current[remotePeerId];
        delete metersRef.current[remotePeerId];
        setConnectedPeerCount(Object.keys(linksRef.current).length);
      }
    };

    call.on('stream', (remoteStream) => {
      audio.srcObject = remoteStream;
      audio.play().catch(() => {});
      attachMeter(remotePeerId, remoteStream);
    });

    call.on('close', cleanup);
    call.on('error', cleanup);
  }, [attachMeter]);

  // Mesh caller: Player with smaller peer.id calls player with larger peer.id
  const syncMeshCalls = useCallback(() => {
    if (!peer || !joinedRef.current) return;
    const currentList = playersRef.current;
    const myId = peer.id;

    // Hang up on departed players
    Object.keys(linksRef.current).forEach((remoteId) => {
      if (!currentList.some((p) => p.id === remoteId)) {
        try {
          linksRef.current[remoteId].call.close();
        } catch {
          // ignore
        }
        delete linksRef.current[remoteId];
        delete metersRef.current[remoteId];
      }
    });

    const outStream = getOutStream();
    if (!outStream) return;

    currentList.forEach((player) => {
      const remoteId = player.id;
      if (!remoteId || remoteId === myId) return;
      if (linksRef.current[remoteId]) return;

      // Smallest peer id initiates the call to avoid race
      if (myId < remoteId) {
        try {
          const call = peer.call(remoteId, outStream);
          if (call) {
            attachCall(remoteId, call);
          }
        } catch {
          // ignore transient connect error
        }
      }
    });

    setConnectedPeerCount(Object.keys(linksRef.current).length);
  }, [peer, getOutStream, attachCall]);

  // Handle incoming media calls
  useEffect(() => {
    if (!peer) return;

    const onIncomingCall = (call: MediaConnection) => {
      const outStream = getOutStream();
      if (outStream) {
        call.answer(outStream);
      }
      attachCall(call.peer, call);
    };

    peer.on('call', onIncomingCall);
    return () => {
      peer.off('call', onIncomingCall);
    };
  }, [peer, getOutStream, attachCall]);

  // Sync calls when players or joined state changes
  const playersKey = players.map((p) => p.id).join(',');
  useEffect(() => {
    if (joined) {
      syncMeshCalls();
      const interval = setInterval(syncMeshCalls, 3500);
      return () => clearInterval(interval);
    }
  }, [joined, playersKey, syncMeshCalls]);

  // Apply mute state to local mic track
  useEffect(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !micMuted && joined;
      });
    }
  }, [micMuted, joined]);

  // Apply deafened state to incoming audio
  useEffect(() => {
    Object.values(linksRef.current).forEach(({ audio }) => {
      audio.muted = deafened;
    });
  }, [deafened]);

  // VAD loop for speaking detection
  useEffect(() => {
    const handlePointerDown = () => {
      audioCtxRef.current?.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', handlePointerDown);

    const buf = new Uint8Array(256);
    let prevSpeaking = false;

    const vadTimer = setInterval(() => {
      const nextTalking: Record<string, boolean> = {};

      // Check remote speakers
      for (const [id, analyser] of Object.entries(metersRef.current)) {
        try {
          analyser.getByteTimeDomainData(buf);
          let max = 0;
          for (let i = 0; i < buf.length; i++) {
            const dev = Math.abs(buf[i] - 128);
            if (dev > max) max = dev;
          }
          nextTalking[id] = max > 8;
        } catch {
          nextTalking[id] = false;
        }
      }

      // Check local speaker
      let localSpeakingNow = false;
      let level = 0;
      if (localMeterRef.current && joinedRef.current && !micMutedRef.current) {
        try {
          localMeterRef.current.getByteTimeDomainData(buf);
          let max = 0;
          for (let i = 0; i < buf.length; i++) {
            const dev = Math.abs(buf[i] - 128);
            if (dev > max) max = dev;
          }
          level = Math.min(1, max / 64);
          localSpeakingNow = max > 8;
        } catch {
          localSpeakingNow = false;
        }
      }

      setMicLevel(level);
      setIsSpeaking(localSpeakingNow);
      if (localSpeakingNow !== prevSpeaking) {
        prevSpeaking = localSpeakingNow;
        onSpeakingChange?.(localSpeakingNow);
      }

      setTalkingMap((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(nextTalking);
        if (prevKeys.length !== nextKeys.length) return nextTalking;
        for (const k of nextKeys) {
          if (prev[k] !== nextTalking[k]) return nextTalking;
        }
        return prev;
      });
    }, 180);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      clearInterval(vadTimer);
    };
  }, [onSpeakingChange]);

  const joinVoice = useCallback(async () => {
    if (joining || joined) return;
    setJoining(true);
    setError(null);

    try {
      const ctx = getAudioCtx();
      await ctx.resume().catch(() => {});

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Microphone access denied';
        setError(`Mic unavailable: ${errorMsg}`);
        // Fall back to silent stream so player can still hear others
        stream = getSilentStream();
      }

      if (stream) {
        micStreamRef.current = stream;
        try {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          const src = ctx.createMediaStreamSource(stream);
          src.connect(analyser);
          localMeterRef.current = analyser;
        } catch {
          // ignore
        }

        // Replace tracks in active outgoing calls
        const realTrack = stream.getAudioTracks()[0];
        if (realTrack) {
          Object.values(linksRef.current).forEach(({ call }) => {
            const senders = (call.peerConnection as RTCPeerConnection)?.getSenders?.() ?? [];
            const audioSender = senders.find((s) => s.track?.kind === 'audio');
            if (audioSender) {
              audioSender.replaceTrack(realTrack).catch(() => {});
            }
          });
        }
      }

      setJoined(true);
      setMicMuted(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join voice');
    } finally {
      setJoining(false);
    }
  }, [joining, joined, getAudioCtx, getSilentStream]);

  const leaveVoice = useCallback(() => {
    setJoined(false);
    setMicMuted(false);
    setIsSpeaking(false);
    setMicLevel(0);

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    localMeterRef.current = null;

    Object.values(linksRef.current).forEach(({ call, audio }) => {
      try {
        call.close();
      } catch {
        // ignore
      }
      audio.pause();
      audio.srcObject = null;
    });
    linksRef.current = {};
    metersRef.current = {};
    setConnectedPeerCount(0);
    setTalkingMap({});
  }, []);

  const toggleMicMute = useCallback(() => {
    setMicMuted((prev) => !prev);
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => !prev);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveVoice();
      try {
        audioCtxRef.current?.close().catch(() => {});
      } catch {
        // ignore
      }
    };
  }, [leaveVoice]);

  return {
    joined,
    joining,
    micMuted,
    deafened,
    isSpeaking,
    micLevel,
    error,
    connectedPeerCount,
    talkingMap,
    joinVoice,
    leaveVoice,
    toggleMicMute,
    toggleDeafen,
    handleIncomingSignals: () => {},
    syncActiveVoicePeers: () => {},
  };
}
