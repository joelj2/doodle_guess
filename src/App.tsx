'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { MessageSquare, Mic, SlidersHorizontal, Users } from 'lucide-react';
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

type MobileTab = 'chat' | 'players' | 'voice' | 'settings';

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
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      setMobileTab('chat');
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
    <div className="h-[100dvh] max-h-[100dvh] lg:h-auto lg:max-h-none lg:min-h-screen bg-[#F4F2ED] text-zinc-900 flex flex-col overflow-hidden lg:overflow-visible">
      <div className="w-full max-w-[1400px] mx-auto p-2 sm:p-3 lg:py-3.5 flex flex-col flex-1 min-h-0 space-y-2 lg:space-y-3">
        {/* Responsive Compact Header */}
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

        {/* Desktop 3-Column Aligned Structured Grid */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-3 items-stretch">
          {/* Desktop Left Column: Players + Voice */}
          <div className="lg:col-span-3 flex flex-col gap-2.5 h-[620px]">
            <PlayerList players={playersWithVoice} currentPlayerId={playerId} />
            <VoiceBar voice={voice} players={playersWithVoice} />
          </div>

          {/* Desktop Center Column: Drawing Studio + Contextual Footer */}
          <div className="lg:col-span-6 flex flex-col gap-2.5">
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

            {/* Guesser Status Card: Fills space below canvas during guessing to equalize column heights */}
            {roomState.phase === 'DRAWING' && !isDrawer && (
              <div className="bg-white rounded-2xl border border-[#E4E2DC] p-3 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg shrink-0">🎨</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 truncate">
                      {roomState.drawerName ?? 'Artist'} is sketching
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {hasGuessed
                        ? 'You got it right! Cheer on remaining guessers.'
                        : 'Watch the sketch and submit guesses in the chat on the right.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono-tabular text-xs font-semibold text-zinc-700 bg-[#F4F2ED] px-2.5 py-1 rounded-xl">
                    {playersWithVoice.filter((p) => p.hasGuessed).length} / {Math.max(1, playersWithVoice.length - 1)} guessed
                  </span>
                </div>
              </div>
            )}

            {roomState.phase === 'ROUND_END' && roomState.roundSummary && (
              <RoundSummaryBanner summary={roomState.roundSummary} timeLeft={roomState.timeLeft} />
            )}

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
          </div>

          {/* Desktop Right Column: Guesses & Chat */}
          <div className="lg:col-span-3 flex flex-col h-[620px]">
            {isDesktop && (
              <GuessChat
                messages={roomState.messages}
                phase={roomState.phase}
                isDrawer={isDrawer}
                hasGuessed={hasGuessed}
                onSendGuess={sendGuess}
                onSendReaction={sendReaction}
              />
            )}
          </div>
        </div>

        {/* Mobile View: Canvas Remains Visible Above Keyboard with Flex Chat Below */}
        <div className="flex-1 min-h-0 flex flex-col lg:hidden space-y-2 overflow-hidden">
          {/* Mobile Drawing Canvas (shrink-0, compact max height keeps it in view when keyboard pops up) */}
          <div className="shrink-0 w-full">
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
          </div>

          {roomState.phase === 'ROUND_END' && roomState.roundSummary && (
            <RoundSummaryBanner summary={roomState.roundSummary} timeLeft={roomState.timeLeft} />
          )}

          {/* Mobile Navigation Tabs */}
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-1 p-0.5 rounded-xl bg-white border border-[#E4E2DC] shrink-0">
            {roomState.phase === 'LOBBY' && amHost ? (
              <button
                type="button"
                onClick={() => setMobileTab('settings')}
                className={`min-h-[34px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mobileTab === 'settings'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMobileTab('chat')}
                className={`min-h-[34px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mobileTab === 'chat'
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileTab('players')}
              className={`min-h-[34px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mobileTab === 'players'
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
              className={`min-h-[34px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mobileTab === 'voice'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice ({voiceCount})</span>
            </button>
          </div>

          {/* Mobile Active Tab Content: Takes flex-1 so input sticks above keyboard */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {!isDesktop && mobileTab === 'chat' && (
              <GuessChat
                messages={roomState.messages}
                phase={roomState.phase}
                isDrawer={isDrawer}
                hasGuessed={hasGuessed}
                onSendGuess={sendGuess}
                onSendReaction={sendReaction}
              />
            )}

            {mobileTab === 'settings' && roomState.phase === 'LOBBY' && (
              <div className="flex-1 min-h-0 overflow-y-auto">
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

            {mobileTab === 'players' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <PlayerList players={playersWithVoice} currentPlayerId={playerId} />
              </div>
            )}

            {mobileTab === 'voice' && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <VoiceBar voice={voice} players={playersWithVoice} />
              </div>
            )}
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
