'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import { MessageSquare, Mic, Users } from 'lucide-react';
import type {
  AvatarConfig,
  ChatMessage,
  DrawAction,
  Player,
  PublicRoomSummary,
  ReactionEvent,
  RoomSettings,
  RoomStateSync,
} from './shared/types.ts';
import { soundFX } from './utils/sound.ts';
import { useVoiceChat } from './hooks/useVoiceChat.ts';
import type { IncomingVoiceSignal, VoiceTransportAdapter } from './hooks/useVoiceChat.ts';
import { LandingView } from './components/LandingView.tsx';
import { WordHeader } from './components/WordHeader.tsx';
import { PlayerList } from './components/PlayerList.tsx';
import { DrawingCanvas } from './components/DrawingCanvas.tsx';
import { GuessChat } from './components/GuessChat.tsx';
import { VoiceBar } from './components/VoiceBar.tsx';
import {
  GameOverOverlay,
  LobbyPanel,
  RoundSummaryBanner,
  WordChoiceOverlay,
} from './components/RoomOverlays.tsx';

type MobileTab = 'chat' | 'players' | 'voice';
type TransportMode = 'detecting' | 'socketio' | 'http';

function loadSavedProfile(): { name: string; avatar: AvatarConfig } {
  try {
    const raw = localStorage.getItem('dg_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        name: typeof parsed.name === 'string' ? parsed.name : '',
        avatar: parsed.avatar ?? { color: '#2563EB', face: 'happy', accessory: 'none' },
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    name: '',
    avatar: { color: '#2563EB', face: 'happy', accessory: 'none' },
  };
}

function getOrCreateHttpPlayerId(): string {
  try {
    const existing = sessionStorage.getItem('dg_http_pid');
    if (existing) return existing;
    const created = `p_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    sessionStorage.setItem('dg_http_pid', created);
    return created;
  } catch {
    return `p_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  }
}

export default function App() {
  const initialProfile = useRef(loadSavedProfile());
  const [name, setName] = useState(initialProfile.current.name);
  const [avatar, setAvatar] = useState<AvatarConfig>(initialProfile.current.avatar);

  const [transportMode, setTransportMode] = useState<TransportMode>('detecting');
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [roomState, setRoomState] = useState<RoomStateSync | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [eventBanner, setEventBanner] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [muted, setMuted] = useState(() => soundFX.isMuted());

  const socketRef = useRef<Socket | null>(null);
  const httpPidRef = useRef<string>('');
  const prevPhaseRef = useRef<string | null>(null);
  const prevHintCountRef = useRef<number>(0);
  const lastReactionTsRef = useRef<number>(0);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceHandlersRef = useRef<{
    handleIncomingSignals: (signals: IncomingVoiceSignal[]) => void;
    syncActiveVoicePeers: (peerIds: string[]) => void;
  } | null>(null);

  const showBanner = useCallback((text: string, duration = 2600) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setEventBanner(text);
    bannerTimerRef.current = setTimeout(() => {
      setEventBanner(null);
    }, duration);
  }, []);

  const initialJoinCode = useRef(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? ''
      : ''
  );

  useEffect(() => {
    httpPidRef.current = getOrCreateHttpPlayerId();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('dg_profile', JSON.stringify({ name, avatar }));
    } catch {
      // ignore
    }
  }, [name, avatar]);

  const applySyncedRoomState = useCallback(
    (next: RoomStateSync, myId: string | null) => {
      setRoomState(next);
      setStartError(null);
      setErrorMsg(null);
      setConnecting(false);

      const url = new URL(window.location.href);
      if (url.searchParams.get('room') !== next.code) {
        url.searchParams.set('room', next.code);
        window.history.replaceState({}, '', url.toString());
      }

      if (prevPhaseRef.current !== next.phase) {
        if (next.phase === 'DRAWING') {
          soundFX.playRoundStart();
          const isMeDrawing = next.drawerId === myId;
          showBanner(
            isMeDrawing
              ? `Round ${next.currentRound} · Your turn to draw!`
              : `Round ${next.currentRound} · ${next.drawerName ?? 'Artist'} is drawing`
          );
          prevHintCountRef.current = next.revealedIndices.length;
        } else if (next.phase === 'GAME_OVER') {
          soundFX.playVictory();
          confetti({
            particleCount: 95,
            spread: 75,
            origin: { y: 0.55 },
          });
        }
        prevPhaseRef.current = next.phase;
      } else if (
        next.phase === 'DRAWING' &&
        next.revealedIndices.length > prevHintCountRef.current
      ) {
        soundFX.playHintReveal();
        showBanner('Hint unlocked a letter!', 2000);
        prevHintCountRef.current = next.revealedIndices.length;
      }
    },
    [showBanner]
  );

  // Detect transport mode: Socket.IO (custom server.ts) vs Next.js App Router HTTP Sync (Vercel)
  useEffect(() => {
    let cancelled = false;
    let activeSocket: Socket | null = null;

    async function initTransport() {
      const externalSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
      let useSocketIO = Boolean(externalSocketUrl);

      if (!useSocketIO) {
        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 3500);
          const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
          clearTimeout(timeout);
          if (res.ok) {
            const data = (await res.json()) as { transport?: string };
            useSocketIO = data.transport === 'socketio';
          }
        } catch {
          useSocketIO = false;
        }
      }

      if (cancelled) return;

      if (!useSocketIO) {
        setTransportMode('http');
        setPlayerId(httpPidRef.current || getOrCreateHttpPlayerId());
        return;
      }

      const socket = externalSocketUrl
        ? io(externalSocketUrl, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 800,
            timeout: 4500,
          })
        : io({
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 800,
            timeout: 4500,
          });

      activeSocket = socket;
      socketRef.current = socket;
      setSocketInstance(socket);

      // Fallback cleanly to HTTP mode if WebSocket server doesn't respond promptly
      const connectFallbackTimer = setTimeout(() => {
        if (!cancelled && !socket.connected) {
          socket.disconnect();
          socketRef.current = null;
          setSocketInstance(null);
          setTransportMode('http');
          setPlayerId(httpPidRef.current || getOrCreateHttpPlayerId());
        }
      }, 4500);

      socket.on('connect', () => {
        clearTimeout(connectFallbackTimer);
        if (cancelled) return;
        setTransportMode('socketio');
        setPlayerId(socket.id ?? null);
      });

      socket.on('connect_error', () => {
        if (cancelled) return;
        // If no external socket URL and initial connect fails, switch to HTTP mode cleanly
        if (!socket.connected && !externalSocketUrl) {
          clearTimeout(connectFallbackTimer);
          socket.disconnect();
          socketRef.current = null;
          setSocketInstance(null);
          setTransportMode('http');
          setPlayerId(httpPidRef.current || getOrCreateHttpPlayerId());
        }
      });

      socket.on('rooms:updated', (list: PublicRoomSummary[]) => {
        setPublicRooms(list);
      });

      socket.on('room:state', (next: RoomStateSync) => {
        applySyncedRoomState(next, socket.id ?? null);
      });

      socket.on(
        'timer:tick',
        ({ timeLeft, nextHintIn }: { timeLeft: number; nextHintIn: number | null }) => {
          setRoomState((prev) => {
            if (!prev) return prev;
            if (prev.phase === 'DRAWING' && timeLeft > 0 && timeLeft <= 10) {
              soundFX.playTick();
            }
            return { ...prev, timeLeft, nextHintIn };
          });
        }
      );

      socket.on(
        'hint:revealed',
        ({
          hintPattern,
          revealedIndices,
          nextHintIn,
        }: {
          hintPattern: string;
          revealedIndices: number[];
          nextHintIn: number | null;
        }) => {
          soundFX.playHintReveal();
          showBanner('Hint unlocked a letter!', 2000);
          prevHintCountRef.current = revealedIndices.length;
          setRoomState((prev) =>
            prev
              ? {
                  ...prev,
                  hintPattern,
                  revealedIndices,
                  nextHintIn,
                }
              : prev
          );
        }
      );

      socket.on(
        'guess:accepted',
        ({ word, points, hintPattern }: { word: string; points: number; hintPattern: string }) => {
          soundFX.playCorrectGuess();
          showBanner(`Correct! +${points} pts`, 2400);
          confetti({
            particleCount: 36,
            spread: 55,
            origin: { y: 0.35 },
          });
          setRoomState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              secretWord: word,
              hintPattern,
              players: prev.players.map((p) =>
                p.id === socket.id ? { ...p, hasGuessed: true } : p
              ),
            };
          });
        }
      );

      socket.on('players:updated', (players: Player[]) => {
        setRoomState((prev) => (prev ? { ...prev, players } : prev));
      });

      socket.on(
        'voice:speakingState',
        ({ playerId: pid, isSpeaking }: { playerId: string; isSpeaking: boolean }) => {
          setRoomState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              players: prev.players.map((p) => (p.id === pid ? { ...p, isSpeaking } : p)),
            };
          });
        }
      );

      socket.on('chat:message', (msg: ChatMessage) => {
        if (msg.kind === 'close') {
          soundFX.playCloseGuess();
        } else if (msg.kind === 'correct') {
          soundFX.playCorrectGuess();
        }
        setRoomState((prev) => {
          if (!prev) return prev;
          if (prev.messages.some((m) => m.id === msg.id)) return prev;
          return { ...prev, messages: [...prev.messages.slice(-90), msg] };
        });
      });

      socket.on('draw:action', (action: DrawAction) => {
        setRoomState((prev) => {
          if (!prev) return prev;
          if (prev.strokes.some((s) => s.id === action.id)) return prev;
          return { ...prev, strokes: [...prev.strokes, action] };
        });
      });

      socket.on(
        'canvas:sync',
        ({
          strokes,
          canUndo,
          canRedo,
        }: {
          strokes: DrawAction[];
          canUndo: boolean;
          canRedo: boolean;
        }) => {
          setRoomState((prev) => (prev ? { ...prev, strokes, canUndo, canRedo } : prev));
        }
      );

      socket.on(
        'canvas:historyState',
        ({ canUndo, canRedo }: { canUndo: boolean; canRedo: boolean }) => {
          setRoomState((prev) => (prev ? { ...prev, canUndo, canRedo } : prev));
        }
      );

      socket.on('canvas:reaction', (event: ReactionEvent) => {
        soundFX.playPop();
        setReactions((prev) => [...prev, event]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== event.id));
        }, 1900);
      });
    }

    void initTransport();

    return () => {
      cancelled = true;
      activeSocket?.disconnect();
    };
  }, [applySyncedRoomState, showBanner]);

  // HTTP mode: poll public rooms on Landing screen
  useEffect(() => {
    if (transportMode !== 'http' || roomState) return;
    let cancelled = false;

    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/rooms', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
        if (!cancelled && Array.isArray(data.rooms)) {
          setPublicRooms(data.rooms);
        }
      } catch {
        // ignore transient network error
      }
    };

    void fetchRooms();
    const timer = setInterval(fetchRooms, 3500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [transportMode, roomState]);

  // HTTP mode: adaptive real-time state polling while inside a room
  const roomCode = roomState?.code ?? null;
  const roomPhase = roomState?.phase ?? null;

  useEffect(() => {
    if (transportMode !== 'http' || !roomCode || !playerId) return;
    let cancelled = false;
    let inFlight = false;

    const pollState = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomCode)}/state?playerId=${encodeURIComponent(playerId)}&sinceReaction=${lastReactionTsRef.current}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok: boolean;
          state?: RoomStateSync;
          privateMessages?: ChatMessage[];
          voiceSignals?: IncomingVoiceSignal[];
          reactions?: (ReactionEvent & { createdAt: number })[];
        };
        if (cancelled || !data.ok || !data.state) return;

        applySyncedRoomState(data.state, playerId);

        if (data.privateMessages && data.privateMessages.length > 0) {
          for (const pm of data.privateMessages) {
            if (pm.kind === 'close') soundFX.playCloseGuess();
          }
          setRoomState((prev) => {
            if (!prev) return prev;
            const merged = [...prev.messages];
            for (const pm of data.privateMessages!) {
              if (!merged.some((m) => m.id === pm.id)) merged.push(pm);
            }
            return { ...prev, messages: merged.slice(-90) };
          });
        }

        if (data.reactions && data.reactions.length > 0) {
          for (const r of data.reactions) {
            if (r.createdAt > lastReactionTsRef.current) {
              lastReactionTsRef.current = r.createdAt;
            }
            soundFX.playPop();
            setReactions((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
            setTimeout(() => {
              setReactions((prev) => prev.filter((x) => x.id !== r.id));
            }, 1900);
          }
        }

        if (voiceHandlersRef.current) {
          const activeVoicePeers = data.state.players
            .filter((p) => p.voiceJoined && p.id !== playerId)
            .map((p) => p.id);
          voiceHandlersRef.current.syncActiveVoicePeers(activeVoicePeers);
          if (data.voiceSignals && data.voiceSignals.length > 0) {
            voiceHandlersRef.current.handleIncomingSignals(data.voiceSignals);
          }
        }
      } catch {
        // ignore transient poll error
      } finally {
        inFlight = false;
      }
    };

    const intervalMs = roomPhase === 'DRAWING' || roomPhase === 'CHOOSING_WORD' ? 450 : 900;
    const timer = setInterval(pollState, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [transportMode, roomCode, roomPhase, playerId, applySyncedRoomState]);

  const sendHttpAction = useCallback(
    async (type: string, payload?: unknown) => {
      const code = roomState?.code;
      const pid = playerId;
      if (!code || !pid) return null;
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: pid, type, payload }),
        });
        if (!res.ok) return null;
        return (await res.json()) as {
          ok: boolean;
          state?: RoomStateSync;
          peerIds?: string[];
          acceptedGuess?: { word: string; points: number } | null;
          error?: string;
        };
      } catch {
        return null;
      }
    },
    [roomState?.code, playerId]
  );

  const voiceTransport: VoiceTransportAdapter = useMemo(
    () => ({
      mode: transportMode === 'http' ? 'http' : 'socketio',
      socket: socketInstance,
      onJoinVoice: async () => {
        if (transportMode === 'http') {
          const res = await sendHttpAction('voiceJoin');
          return res?.peerIds ?? [];
        }
        socketRef.current?.emit('voice:join');
        return [];
      },
      onLeaveVoice: () => {
        if (transportMode === 'http') {
          void sendHttpAction('voiceLeave');
        } else {
          socketRef.current?.emit('voice:leave');
        }
      },
      onMuteVoice: (isMuted: boolean) => {
        if (transportMode === 'http') {
          void sendHttpAction('voiceMute', isMuted);
        } else {
          socketRef.current?.emit('voice:mute', isMuted);
        }
      },
      onSpeakingVoice: (speaking: boolean) => {
        if (transportMode === 'http') {
          void sendHttpAction('voiceSpeaking', speaking);
        } else {
          socketRef.current?.emit('voice:speaking', speaking);
        }
      },
      onSignalVoice: (sig) => {
        if (transportMode === 'http') {
          void sendHttpAction('voiceSignal', sig);
        } else {
          socketRef.current?.emit('voice:signal', sig);
        }
      },
    }),
    [transportMode, socketInstance, sendHttpAction]
  );

  const voice = useVoiceChat(voiceTransport, Boolean(roomState));
  voiceHandlersRef.current = {
    handleIncomingSignals: voice.handleIncomingSignals,
    syncActiveVoicePeers: voice.syncActiveVoicePeers,
  };

  const handleCreateRoom = useCallback(
    async (settings?: Partial<RoomSettings>) => {
      setConnecting(true);
      setErrorMsg(null);

      // Use HTTP API if Socket.IO is not active or still detecting
      if (transportMode !== 'socketio' || !socketRef.current?.connected) {
        try {
          const pid = httpPidRef.current || getOrCreateHttpPlayerId();
          setPlayerId(pid);
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch('/api/rooms/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: pid, name, avatar, settings }),
            signal: ctrl.signal,
          });
          clearTimeout(t);
          const data = (await res.json()) as {
            ok: boolean;
            state?: RoomStateSync;
            error?: string;
          };
          setConnecting(false);
          if (data.ok && data.state) {
            setTransportMode('http');
            applySyncedRoomState(data.state, pid);
          } else {
            setErrorMsg(data.error ?? 'Could not create room.');
          }
        } catch {
          setConnecting(false);
          setErrorMsg('Unable to reach server. Please try again.');
        }
        return;
      }

      const socket = socketRef.current;
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          setConnecting(false);
          setErrorMsg('Connection timed out. Please try again.');
        }
      }, 6000);

      socket.emit(
        'room:create',
        { name, avatar, settings },
        (res: { ok: boolean; error?: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          setConnecting(false);
          if (!res?.ok) {
            setErrorMsg(res?.error ?? 'Could not create room.');
          }
        }
      );
    },
    [transportMode, name, avatar, applySyncedRoomState]
  );

  const handleJoinRoom = useCallback(
    async (code: string) => {
      setConnecting(true);
      setErrorMsg(null);

      if (transportMode !== 'socketio' || !socketRef.current?.connected) {
        try {
          const pid = httpPidRef.current || getOrCreateHttpPlayerId();
          setPlayerId(pid);
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch('/api/rooms/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, playerId: pid, name, avatar }),
            signal: ctrl.signal,
          });
          clearTimeout(t);
          const data = (await res.json()) as {
            ok: boolean;
            state?: RoomStateSync;
            error?: string;
          };
          setConnecting(false);
          if (data.ok && data.state) {
            setTransportMode('http');
            applySyncedRoomState(data.state, pid);
          } else {
            setErrorMsg(data.error ?? 'Could not join room.');
          }
        } catch {
          setConnecting(false);
          setErrorMsg('Unable to reach server. Please try again.');
        }
        return;
      }

      const socket = socketRef.current;
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          setConnecting(false);
          setErrorMsg('Connection timed out. Please try again.');
        }
      }, 6000);

      socket.emit(
        'room:join',
        { code, name, avatar },
        (res: { ok: boolean; error?: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          setConnecting(false);
          if (!res?.ok) {
            setErrorMsg(res?.error ?? 'Could not join room.');
          }
        }
      );
    },
    [transportMode, name, avatar, applySyncedRoomState]
  );

  const handleLeaveRoom = useCallback(() => {
    if (voice.joined) {
      voice.leaveVoice();
    }
    if (transportMode === 'http') {
      void sendHttpAction('leave');
    } else {
      socketRef.current?.emit('room:leave');
    }
    setRoomState(null);
    setStartError(null);
    prevPhaseRef.current = null;
    prevHintCountRef.current = 0;
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, [voice, transportMode, sendHttpAction]);

  const handleEmitDrawAction = useCallback(
    (action: DrawAction) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        if (action.type === 'clear') {
          return { ...prev, strokes: [], canUndo: false, canRedo: false };
        }
        return {
          ...prev,
          strokes: [...prev.strokes, action],
          canUndo: true,
          canRedo: false,
        };
      });
      if (transportMode === 'http') {
        void sendHttpAction('draw', action);
      } else {
        socketRef.current?.emit('draw:action', action);
      }
    },
    [transportMode, sendHttpAction]
  );

  const handleUndo = useCallback(async () => {
    if (transportMode === 'http') {
      const res = await sendHttpAction('undo');
      if (res?.state) applySyncedRoomState(res.state, playerId);
    } else {
      socketRef.current?.emit('draw:undo');
    }
  }, [transportMode, sendHttpAction, applySyncedRoomState, playerId]);

  const handleRedo = useCallback(async () => {
    if (transportMode === 'http') {
      const res = await sendHttpAction('redo');
      if (res?.state) applySyncedRoomState(res.state, playerId);
    } else {
      socketRef.current?.emit('draw:redo');
    }
  }, [transportMode, sendHttpAction, applySyncedRoomState, playerId]);

  const handleClear = useCallback(() => {
    handleEmitDrawAction({ id: `clr_${Date.now()}`, type: 'clear' });
  }, [handleEmitDrawAction]);

  const handleSendGuess = useCallback(
    async (text: string) => {
      if (transportMode === 'http') {
        const res = await sendHttpAction('guess', text);
        if (res?.acceptedGuess) {
          soundFX.playCorrectGuess();
          showBanner(`Correct! +${res.acceptedGuess.points} pts`, 2400);
          confetti({ particleCount: 36, spread: 55, origin: { y: 0.35 } });
        }
        if (res?.state) {
          applySyncedRoomState(res.state, playerId);
        }
      } else {
        socketRef.current?.emit('chat:guess', text);
      }
    },
    [transportMode, sendHttpAction, applySyncedRoomState, playerId, showBanner]
  );

  const handleSendReaction = useCallback(
    (emoji: string) => {
      if (transportMode === 'http') {
        void sendHttpAction('reaction', emoji);
      } else {
        socketRef.current?.emit('canvas:reaction', emoji);
      }
    },
    [transportMode, sendHttpAction]
  );

  const handleUpdateSettings = useCallback(
    async (partial: Partial<RoomSettings>) => {
      if (transportMode === 'http') {
        const res = await sendHttpAction('updateSettings', partial);
        if (res?.state) applySyncedRoomState(res.state, playerId);
      } else {
        socketRef.current?.emit('room:updateSettings', partial);
      }
    },
    [transportMode, sendHttpAction, applySyncedRoomState, playerId]
  );

  const handleStartGame = useCallback(async () => {
    setStartError(null);
    if (transportMode === 'http') {
      const res = await sendHttpAction('start');
      if (!res?.ok) {
        setStartError(res?.error ?? 'Could not start match.');
      } else if (res.state) {
        applySyncedRoomState(res.state, playerId);
      }
      return;
    }

    socketRef.current?.emit('game:start', (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) {
        setStartError(res?.error ?? 'Could not start match.');
      }
    });
  }, [transportMode, sendHttpAction, applySyncedRoomState, playerId]);

  const handleSelectWord = useCallback(
    async (word: string) => {
      if (transportMode === 'http') {
        const res = await sendHttpAction('selectWord', word);
        if (res?.state) applySyncedRoomState(res.state, playerId);
      } else {
        socketRef.current?.emit('word:select', word);
      }
    },
    [transportMode, sendHttpAction, applySyncedRoomState, playerId]
  );

  const handlePlayAgain = useCallback(async () => {
    if (transportMode === 'http') {
      const res = await sendHttpAction('playAgain');
      if (res?.state) applySyncedRoomState(res.state, playerId);
    } else {
      socketRef.current?.emit('game:playAgain');
    }
  }, [transportMode, sendHttpAction, applySyncedRoomState, playerId]);

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    soundFX.setMuted(next);
    setMuted(next);
  }, [muted]);

  const handleToggleVoiceQuick = useCallback(() => {
    if (!voice.joined) {
      void voice.joinVoice();
    } else {
      voice.toggleMicMute();
    }
  }, [voice]);

  if (!roomState) {
    return (
      <LandingView
        name={name}
        avatar={avatar}
        publicRooms={publicRooms}
        initialJoinCode={initialJoinCode.current}
        errorMsg={errorMsg}
        connecting={connecting}
        onNameChange={setName}
        onAvatarChange={setAvatar}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  const me = roomState.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const isDrawer = roomState.drawerId === playerId;
  const hasGuessed = Boolean(me?.hasGuessed);
  const canDraw = roomState.phase === 'LOBBY' || (roomState.phase === 'DRAWING' && isDrawer);
  const voiceCount = roomState.players.filter((p) => p.voiceJoined).length;

  return (
    <div className="min-h-screen bg-[#F4F2ED] text-zinc-900">
      <div className="w-full max-w-[1400px] mx-auto px-2.5 sm:px-5 py-2.5 sm:py-4 space-y-2.5 sm:space-y-3">
        <WordHeader
          roomCode={roomState.code}
          phase={roomState.phase}
          currentRound={roomState.currentRound}
          totalRounds={roomState.totalRounds}
          timeLeft={roomState.timeLeft}
          totalTime={roomState.totalTime}
          hintPattern={roomState.hintPattern}
          revealedIndices={roomState.revealedIndices}
          nextHintIn={roomState.nextHintIn}
          secretWord={roomState.secretWord}
          isDrawer={isDrawer}
          hasGuessed={hasGuessed}
          drawerName={roomState.drawerName}
          muted={muted}
          voiceJoined={voice.joined}
          voiceMuted={voice.micMuted}
          voiceSpeaking={voice.isSpeaking}
          onToggleMute={handleToggleMute}
          onToggleVoiceQuick={handleToggleVoiceQuick}
          onLeaveRoom={handleLeaveRoom}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          {/* Desktop Left Column */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-3">
            <PlayerList players={roomState.players} currentPlayerId={playerId} />
            <VoiceBar voice={voice} players={roomState.players} />
          </div>

          {/* Center Column */}
          <div className="lg:col-span-6 space-y-2.5 sm:space-y-3">
            <DrawingCanvas
              strokes={roomState.strokes}
              canDraw={canDraw}
              canUndo={roomState.canUndo}
              canRedo={roomState.canRedo}
              reactions={reactions}
              isWarmup={roomState.phase === 'LOBBY'}
              eventBanner={eventBanner}
              onEmitAction={handleEmitDrawAction}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onClear={handleClear}
            />

            {roomState.phase === 'ROUND_END' && roomState.roundSummary && (
              <RoundSummaryBanner summary={roomState.roundSummary} timeLeft={roomState.timeLeft} />
            )}

            {roomState.phase === 'LOBBY' && (
              <div className="hidden lg:block">
                <LobbyPanel
                  settings={roomState.settings}
                  isHost={isHost}
                  playerCount={roomState.players.length}
                  startError={startError}
                  onUpdateSettings={handleUpdateSettings}
                  onStartGame={handleStartGame}
                />
              </div>
            )}
          </div>

          {/* Desktop Right Column */}
          <div className="hidden lg:block lg:col-span-3">
            <GuessChat
              messages={roomState.messages}
              phase={roomState.phase}
              isDrawer={isDrawer}
              hasGuessed={hasGuessed}
              onSendGuess={handleSendGuess}
              onSendReaction={handleSendReaction}
            />
          </div>

          {/* Mobile Responsive Tabbed Panel */}
          <div className="lg:hidden space-y-2.5">
            {roomState.phase === 'LOBBY' && (
              <LobbyPanel
                settings={roomState.settings}
                isHost={isHost}
                playerCount={roomState.players.length}
                startError={startError}
                onUpdateSettings={handleUpdateSettings}
                onStartGame={handleStartGame}
              />
            )}

            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white border border-[#E4E2DC]">
              <button
                type="button"
                onClick={() => setMobileTab('chat')}
                className={`min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mobileTab === 'chat'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Guess & Chat</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileTab('players')}
                className={`min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mobileTab === 'players'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Players ({roomState.players.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileTab('voice')}
                className={`min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mobileTab === 'voice'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Voice ({voiceCount})</span>
              </button>
            </div>

            {mobileTab === 'chat' && (
              <GuessChat
                messages={roomState.messages}
                phase={roomState.phase}
                isDrawer={isDrawer}
                hasGuessed={hasGuessed}
                onSendGuess={handleSendGuess}
                onSendReaction={handleSendReaction}
              />
            )}

            {mobileTab === 'players' && (
              <PlayerList players={roomState.players} currentPlayerId={playerId} />
            )}

            {mobileTab === 'voice' && <VoiceBar voice={voice} players={roomState.players} />}
          </div>
        </div>
      </div>

      {roomState.phase === 'CHOOSING_WORD' && isDrawer && roomState.wordOptions && (
        <WordChoiceOverlay
          options={roomState.wordOptions}
          timeLeft={roomState.timeLeft}
          onSelect={handleSelectWord}
        />
      )}

      {roomState.phase === 'GAME_OVER' && (
        <GameOverOverlay
          players={roomState.players}
          isHost={isHost}
          onPlayAgain={handlePlayAgain}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}
