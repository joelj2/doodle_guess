'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

export default function App() {
  const initialProfile = useRef(loadSavedProfile());
  const [name, setName] = useState(initialProfile.current.name);
  const [avatar, setAvatar] = useState<AvatarConfig>(initialProfile.current.avatar);

  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [roomState, setRoomState] = useState<RoomStateSync | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [eventBanner, setEventBanner] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [muted, setMuted] = useState(() => soundFX.isMuted());

  const socketRef = useRef<Socket | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    try {
      localStorage.setItem('dg_profile', JSON.stringify({ name, avatar }));
    } catch {
      // ignore
    }
  }, [name, avatar]);

  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 800,
    });
    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => {
      setSocketId(socket.id ?? null);
    });

    socket.on('rooms:updated', (list: PublicRoomSummary[]) => {
      setPublicRooms(list);
    });

    socket.on('room:state', (next: RoomStateSync) => {
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
          const isMeDrawing = next.drawerId === socket.id;
          showBanner(
            isMeDrawing
              ? `Round ${next.currentRound} · Your turn to draw!`
              : `Round ${next.currentRound} · ${next.drawerName ?? 'Artist'} is drawing`
          );
        } else if (next.phase === 'GAME_OVER') {
          soundFX.playVictory();
          confetti({
            particleCount: 95,
            spread: 75,
            origin: { y: 0.55 },
          });
        }
        prevPhaseRef.current = next.phase;
      }
    });

    socket.on('timer:tick', ({ timeLeft, nextHintIn }: { timeLeft: number; nextHintIn: number | null }) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        if (prev.phase === 'DRAWING' && timeLeft > 0 && timeLeft <= 10) {
          soundFX.playTick();
        }
        return { ...prev, timeLeft, nextHintIn };
      });
    });

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
      ({ playerId, isSpeaking }: { playerId: string; isSpeaking: boolean }) => {
        setRoomState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map((p) =>
              p.id === playerId ? { ...p, isSpeaking } : p
            ),
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
      ({ strokes, canUndo, canRedo }: { strokes: DrawAction[]; canUndo: boolean; canRedo: boolean }) => {
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

    return () => {
      socket.disconnect();
    };
  }, [showBanner]);

  const voice = useVoiceChat(socketInstance, Boolean(roomState));

  const handleCreateRoom = useCallback(
    (settings?: Partial<RoomSettings>) => {
      const socket = socketRef.current;
      if (!socket) return;
      setConnecting(true);
      setErrorMsg(null);
      socket.emit('room:create', { name, avatar, settings }, (res: { ok: boolean; error?: string }) => {
        setConnecting(false);
        if (!res?.ok) {
          setErrorMsg(res?.error ?? 'Could not create room.');
        }
      });
    },
    [name, avatar]
  );

  const handleJoinRoom = useCallback(
    (code: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      setConnecting(true);
      setErrorMsg(null);
      socket.emit('room:join', { code, name, avatar }, (res: { ok: boolean; error?: string }) => {
        setConnecting(false);
        if (!res?.ok) {
          setErrorMsg(res?.error ?? 'Could not join room.');
        }
      });
    },
    [name, avatar]
  );

  const handleLeaveRoom = useCallback(() => {
    if (voice.joined) {
      voice.leaveVoice();
    }
    socketRef.current?.emit('room:leave');
    setRoomState(null);
    setStartError(null);
    prevPhaseRef.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, [voice]);

  const handleEmitDrawAction = useCallback((action: DrawAction) => {
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
    socketRef.current?.emit('draw:action', action);
  }, []);

  const handleUndo = useCallback(() => {
    socketRef.current?.emit('draw:undo');
  }, []);

  const handleRedo = useCallback(() => {
    socketRef.current?.emit('draw:redo');
  }, []);

  const handleClear = useCallback(() => {
    handleEmitDrawAction({ id: `clr_${Date.now()}`, type: 'clear' });
  }, [handleEmitDrawAction]);

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    soundFX.setMuted(next);
    setMuted(next);
  }, [muted]);

  const handleToggleVoiceQuick = useCallback(() => {
    if (!voice.joined) {
      voice.joinVoice();
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

  const me = roomState.players.find((p) => p.id === socketId);
  const isHost = Boolean(me?.isHost);
  const isDrawer = roomState.drawerId === socketId;
  const hasGuessed = Boolean(me?.hasGuessed);
  const canDraw = roomState.phase === 'LOBBY' || (roomState.phase === 'DRAWING' && isDrawer);
  const voiceCount = roomState.players.filter((p) => p.voiceJoined).length;

  return (
    <div className="min-h-screen bg-[#F4F2ED] text-zinc-900">
      <div className="w-full max-w-[1400px] mx-auto px-2.5 sm:px-5 py-2.5 sm:py-4 space-y-2.5 sm:space-y-3">
        {/* Top Word, Timer, Hint & Voice Quick Bar */}
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

        {/* Desktop: 3-Column Studio Grid | Mobile: Canvas First + Tabbed Thumb Zone */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          {/* Desktop Left Column: Players + Voice Channel */}
          <div className="hidden lg:flex lg:col-span-3 flex-col gap-3">
            <PlayerList players={roomState.players} currentPlayerId={socketId} />
            <VoiceBar voice={voice} players={roomState.players} />
          </div>

          {/* Center Column: Drawing Canvas + Lobby / Round Summary */}
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

            {/* Desktop Lobby Panel */}
            {roomState.phase === 'LOBBY' && (
              <div className="hidden lg:block">
                <LobbyPanel
                  settings={roomState.settings}
                  isHost={isHost}
                  playerCount={roomState.players.length}
                  startError={startError}
                  onUpdateSettings={(partial) =>
                    socketRef.current?.emit('room:updateSettings', partial)
                  }
                  onStartGame={() => {
                    setStartError(null);
                    socketRef.current?.emit('game:start', (res: { ok: boolean; error?: string }) => {
                      if (!res?.ok) {
                        setStartError(res?.error ?? 'Could not start match.');
                      }
                    });
                  }}
                />
              </div>
            )}
          </div>

          {/* Desktop Right Column: Guess Chat */}
          <div className="hidden lg:block lg:col-span-3">
            <GuessChat
              messages={roomState.messages}
              phase={roomState.phase}
              isDrawer={isDrawer}
              hasGuessed={hasGuessed}
              onSendGuess={(text) => socketRef.current?.emit('chat:guess', text)}
              onSendReaction={(emoji) => socketRef.current?.emit('canvas:reaction', emoji)}
            />
          </div>

          {/* Mobile Ergonomic Panel (< lg): Tabbed Chat, Players, Voice & Lobby */}
          <div className="lg:hidden space-y-2.5">
            {roomState.phase === 'LOBBY' && (
              <LobbyPanel
                settings={roomState.settings}
                isHost={isHost}
                playerCount={roomState.players.length}
                startError={startError}
                onUpdateSettings={(partial) =>
                  socketRef.current?.emit('room:updateSettings', partial)
                }
                onStartGame={() => {
                  setStartError(null);
                  socketRef.current?.emit('game:start', (res: { ok: boolean; error?: string }) => {
                    if (!res?.ok) {
                      setStartError(res?.error ?? 'Could not start match.');
                    }
                  });
                }}
              />
            )}

            {/* Segmented Switcher right under canvas */}
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
                onSendGuess={(text) => socketRef.current?.emit('chat:guess', text)}
                onSendReaction={(emoji) => socketRef.current?.emit('canvas:reaction', emoji)}
              />
            )}

            {mobileTab === 'players' && (
              <PlayerList players={roomState.players} currentPlayerId={socketId} />
            )}

            {mobileTab === 'voice' && <VoiceBar voice={voice} players={roomState.players} />}
          </div>
        </div>
      </div>

      {/* Word Choice Modal (Active Drawer Only) */}
      {roomState.phase === 'CHOOSING_WORD' && isDrawer && roomState.wordOptions && (
        <WordChoiceOverlay
          options={roomState.wordOptions}
          timeLeft={roomState.timeLeft}
          onSelect={(word) => socketRef.current?.emit('word:select', word)}
        />
      )}

      {/* Final Podium Modal */}
      {roomState.phase === 'GAME_OVER' && (
        <GameOverOverlay
          players={roomState.players}
          isHost={isHost}
          onPlayAgain={() => socketRef.current?.emit('game:playAgain')}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}
