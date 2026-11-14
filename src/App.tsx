'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { MessageSquare, Mic, Users } from 'lucide-react';
import type {
  AvatarConfig,
  Player,
  RoomSettings,
} from './shared/types.ts';
import { soundFX } from './utils/sound.ts';
import { usePeerRoom } from './hooks/usePeerRoom.ts';
import { usePeerVoice } from './hooks/usePeerVoice.ts';
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
  const [eventBanner, setEventBanner] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [muted, setMuted] = useState(() => soundFX.isMuted());

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

      // Peer-to-peer room engine (PeerJS reference architecture)
      const {
        roomState,
        playerId,
        peerInstance,
        isHost,
        connecting,
        errorMsg,
        startError,
        reactions,
        publicRooms,
        createRoom,
        joinRoom,
        leaveRoom,
        emitDrawAction,
        undo,
        redo,
        clearCanvas,
        sendGuess,
        sendReaction,
        updateSettings,
        startGame,
        selectWord,
        playAgain,
        syncVoiceStateToPeers,
      } = usePeerRoom({
        onRoundStart: (round, drawerName, isMeDrawing) => {
          soundFX.playRoundStart();
          showBanner(
            isMeDrawing
              ? `Round ${round} · Your turn to draw!`
              : `Round ${round} · ${drawerName} is drawing`
          );
        },
            onHintRevealed: () => {
              soundFX.playHintReveal();
              showBanner('Hint unlocked a letter!', 2000);
            },
              onCorrectGuess: (_word, points) => {
                soundFX.playCorrectGuess();
                showBanner(`Correct! +${points} pts`, 2400);
                confetti({
                  particleCount: 42,
                  spread: 60,
                  origin: { y: 0.35 },
                });
                },
                  onCloseGuess: () => {
                    soundFX.playCloseGuess();
                  },
                  onGameOver: () => {
                    soundFX.playVictory();
                    confetti({
                      particleCount: 95,
                      spread: 75,
                      origin: { y: 0.55 },
                    });
                  },
                  onReactionPop: () => {
                    soundFX.playPop();
                  },
                  onTick: () => {
                    soundFX.playTick();
                  },
  });

          const voiceJoinedRef = useRef(false);
          const voiceMutedRef = useRef(false);

          const handleSpeakingChange = useCallback(
            (speaking: boolean) => {
              syncVoiceStateToPeers(voiceJoinedRef.current, voiceMutedRef.current, speaking);
            },
            [syncVoiceStateToPeers]
          );

          // Peer-to-peer mesh voice chat
          const voice = usePeerVoice(peerInstance, roomState?.players ?? [], handleSpeakingChange);

          voiceJoinedRef.current = voice.joined;
          voiceMutedRef.current = voice.micMuted;

          // Sync voice joined and muted status to peers
          useEffect(() => {
            if (roomState && playerId) {
              syncVoiceStateToPeers(voice.joined, voice.micMuted, voice.isSpeaking);
            }
          }, [voice.joined, voice.micMuted, voice.isSpeaking, roomState, playerId, syncVoiceStateToPeers]);

          // Merge real-time local voice activity into player list
          const playersWithVoice: Player[] = useMemo(() => {
            if (!roomState) return [];
            return roomState.players.map((p) => {
              const isMe = p.id === playerId;
              const talking = isMe ? voice.isSpeaking : Boolean(voice.talkingMap[p.id]);
              return {
                ...p,
                isSpeaking: talking,
                voiceJoined: isMe ? voice.joined : p.voiceJoined,
                voiceMuted: isMe ? voice.micMuted : p.voiceMuted,
              };
            });
          }, [roomState, playerId, voice.isSpeaking, voice.talkingMap, voice.joined, voice.micMuted]);

      const handleCreateRoom = useCallback(
        async (settings?: Partial<RoomSettings>) => {
          await createRoom(name, avatar, settings);
        },
        [createRoom, name, avatar]
      );

      const handleJoinRoom = useCallback(
        async (code: string) => {
          await joinRoom(code, name, avatar);
        },
        [joinRoom, name, avatar]
      );

      const handleLeaveRoom = useCallback(() => {
        if (voice.joined) {
          voice.leaveVoice();
        }
      leaveRoom();
    }, [voice, leaveRoom]);

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

  // Landing view when not connected to a room
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

  const me = playersWithVoice.find((p) => p.id === playerId);
  const amHost = Boolean(me?.isHost || isHost);
  const isDrawer = roomState.drawerId === playerId;
  const hasGuessed = Boolean(me?.hasGuessed);
  const canDraw = roomState.phase === 'LOBBY' || (roomState.phase === 'DRAWING' && isDrawer);
  const voiceCount = playersWithVoice.filter((p) => p.voiceJoined).length;

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
            <PlayerList players={playersWithVoice} currentPlayerId={playerId} />
            <VoiceBar voice={voice} players={playersWithVoice} />
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
              onEmitAction={emitDrawAction}
              onUndo={undo}
              onRedo={redo}
              onClear={clearCanvas}
            />

            {roomState.phase === 'ROUND_END' && roomState.roundSummary && (
              <RoundSummaryBanner summary={roomState.roundSummary} timeLeft={roomState.timeLeft} />
            )}

            {roomState.phase === 'LOBBY' && (
              <div className="hidden lg:block">
                <LobbyPanel
                  settings={roomState.settings}
                  isHost={amHost}
                  playerCount={playersWithVoice.length}
                  startError={startError}
                  onUpdateSettings={updateSettings}
                  onStartGame={startGame}
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
              onSendGuess={sendGuess}
              onSendReaction={sendReaction}
            />
          </div>

          {/* Mobile Responsive Tabbed Panel */}
          <div className="lg:hidden space-y-2.5">
            {roomState.phase === 'LOBBY' && (
              <LobbyPanel
                settings={roomState.settings}
                isHost={amHost}
                playerCount={playersWithVoice.length}
                startError={startError}
                onUpdateSettings={updateSettings}
                onStartGame={startGame}
              />
            )}

            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white border border-[#E4E2DC]">
              <button
                type="button"
                onClick={() => setMobileTab('chat')}
                className={`min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${mobileTab === 'chat'
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
                className={`min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${mobileTab === 'players'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-950'
                  }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Players ({playersWithVoice.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileTab('voice')}
                className={`min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${mobileTab === 'voice'
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
                onSendGuess={sendGuess}
                onSendReaction={sendReaction}
              />
            )}

            {mobileTab === 'players' && (
              <PlayerList players={playersWithVoice} currentPlayerId={playerId} />
            )}

            {mobileTab === 'voice' && <VoiceBar voice={voice} players={playersWithVoice} />}
          </div>
        </div>
      </div>

      {roomState.phase === 'CHOOSING_WORD' && isDrawer && roomState.wordOptions && (
        <WordChoiceOverlay
          options={roomState.wordOptions}
          timeLeft={roomState.timeLeft}
          onSelect={selectWord}
        />
      )}

      {roomState.phase === 'GAME_OVER' && (
        <GameOverOverlay
          players={playersWithVoice}
          isHost={amHost}
          onPlayAgain={playAgain}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}
