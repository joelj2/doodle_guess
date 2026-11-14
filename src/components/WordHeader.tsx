'use client';

import { useState } from 'react';
import { Check, Clock, Copy, Lightbulb, LogOut, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import type { GamePhase } from '../shared/types.ts';

interface WordHeaderProps {
  roomCode: string;
  phase: GamePhase;
  currentRound: number;
  totalRounds: number;
  timeLeft: number;
  totalTime: number;
  hintPattern: string;
  revealedIndices: number[];
  nextHintIn: number | null;
  secretWord: string | null;
  isDrawer: boolean;
  hasGuessed: boolean;
  drawerName: string | null;
  muted: boolean;
  voiceJoined: boolean;
  voiceMuted: boolean;
  voiceSpeaking: boolean;
  onToggleMute: () => void;
  onToggleVoiceQuick: () => void;
  onLeaveRoom: () => void;
}

export function WordHeader({
  roomCode,
  phase,
  currentRound,
  totalRounds,
  timeLeft,
  totalTime,
  hintPattern,
  revealedIndices,
  nextHintIn,
  secretWord,
  isDrawer,
  hasGuessed,
  drawerName,
  muted,
  voiceJoined,
  voiceMuted,
  voiceSpeaking,
  onToggleMute,
  onToggleVoiceQuick,
  onLeaveRoom,
}: WordHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const progress = totalTime > 0 ? Math.max(0, Math.min(1, timeLeft / totalTime)) : 0;
  const isUrgent = phase === 'DRAWING' && timeLeft <= 12 && timeLeft > 0;
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const segments: { word: string; startIdx: number }[] = [];
  if (hintPattern) {
    let cursor = 0;
    for (const part of hintPattern.split(' ')) {
      segments.push({ word: part, startIdx: cursor });
      cursor += part.length + 1;
    }
  }

  return (
    <header className="bg-white rounded-2xl border border-[#E4E2DC] px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
      {/* Left: Timer + Round & Room Code */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
          <svg className="w-11 h-11 -rotate-90" viewBox="0 0 46 46" aria-hidden="true">
            <circle cx="23" cy="23" r={radius} fill="none" stroke="#E4E2DC" strokeWidth="4" />
            <circle
              cx="23"
              cy="23"
              r={radius}
              fill="none"
              stroke={isUrgent ? '#DC2626' : '#2563EB'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-300"
            />
          </svg>
          <span
            className={`absolute font-mono-tabular text-xs font-bold ${
              isUrgent ? 'text-red-600' : 'text-zinc-900'
            }`}
          >
            {phase === 'LOBBY' || phase === 'GAME_OVER' ? '--' : timeLeft}
          </span>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-zinc-500">
            <span className="font-semibold text-zinc-900 whitespace-nowrap">
              {phase === 'LOBBY'
                ? 'Lobby'
                : phase === 'GAME_OVER'
                  ? 'Results'
                  : `Round ${currentRound}/${totalRounds}`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular font-semibold text-zinc-700 whitespace-nowrap">
              {roomCode}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyInvite}
            className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer w-fit whitespace-nowrap"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link copied' : 'Copy invite'}</span>
          </button>
        </div>
      </div>

      {/* Right: Quick Voice, Audio & Leave Controls (placed before word row wrap on mobile) */}
      <div className="flex items-center gap-1.5 shrink-0 lg:order-3">
        <button
          type="button"
          onClick={onToggleVoiceQuick}
          aria-label={
            !voiceJoined
              ? 'Join voice chat'
              : voiceMuted
                ? 'Unmute microphone'
                : 'Mute microphone'
          }
          title={
            !voiceJoined
              ? 'Join voice chat'
              : voiceMuted
                ? 'Unmute microphone'
                : 'Mute microphone'
          }
          className={`min-h-[40px] min-w-[40px] px-2.5 py-2 rounded-xl inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            !voiceJoined
              ? 'bg-[#F4F2ED] hover:bg-zinc-200/70 text-zinc-700'
              : voiceMuted
                ? 'bg-red-50 text-red-700 border border-red-200'
                : voiceSpeaking
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-900 text-white'
          }`}
        >
          {voiceJoined && voiceMuted ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">
            {!voiceJoined ? 'Voice' : voiceMuted ? 'Muted' : 'Live'}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
          title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
          className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-[#F4F2ED] hover:bg-zinc-200/70 text-zinc-700 transition-colors cursor-pointer flex items-center justify-center"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onLeaveRoom}
          className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F4F2ED] hover:bg-red-50 text-zinc-700 hover:text-red-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>

      {/* Center: Secret Word / Progressive Timed Letter Hint Tiles */}
      <div className="w-full lg:w-auto lg:flex-1 lg:order-2 flex flex-col items-center justify-center pt-1 lg:pt-0 border-t lg:border-t-0 border-[#E4E2DC]">
        {phase === 'LOBBY' && (
          <p className="text-xs sm:text-sm font-medium text-zinc-600 text-center">
            Waiting in lobby — doodle on the board or invite friends
          </p>
        )}

        {phase === 'CHOOSING_WORD' && (
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-800">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>
              {isDrawer ? 'Pick your secret word' : `${drawerName ?? 'Artist'} is choosing a word...`}
            </span>
          </div>
        )}

        {phase === 'DRAWING' && (
          <div className="flex flex-col items-center gap-1">
            <div className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1.5">
              {segments.map((seg, segIdx) => (
                <div key={segIdx} className="flex items-center gap-1">
                  {Array.from(seg.word).map((char, offset) => {
                    const absIdx = seg.startIdx + offset;
                    const isRevealed = char !== '_';
                    const wasHinted = revealedIndices.includes(absIdx);
                    return (
                      <span
                        key={absIdx}
                        className={`inline-flex items-center justify-center w-6 h-7 sm:w-7 sm:h-9 rounded-lg border font-mono-tabular text-xs sm:text-base font-bold transition-colors ${
                          isDrawer
                            ? wasHinted
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-zinc-900 border-zinc-900 text-white'
                            : hasGuessed
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 animate-tile-pop'
                              : isRevealed
                                ? 'bg-amber-50 border-amber-300 text-amber-900 animate-tile-pop'
                                : 'bg-[#F4F2ED] border-[#E4E2DC] text-zinc-400'
                        }`}
                      >
                        {char === '_' ? '' : char}
                      </span>
                    );
                  })}
                  <span className="ml-0.5 text-[11px] font-mono-tabular font-semibold text-zinc-400">
                    {seg.word.length}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs text-zinc-500 text-center">
              {isDrawer ? (
                <span>
                  Draw: <strong className="text-zinc-900">{secretWord}</strong>
                  {revealedIndices.length > 0 && ` · ${revealedIndices.length} hint(s) shown`}
                </span>
              ) : hasGuessed ? (
                <span className="font-semibold text-emerald-700">
                  Correct! You found "{secretWord}"
                </span>
              ) : nextHintIn !== null ? (
                <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Next letter hint in {nextHintIn}s</span>
                </span>
              ) : (
                <span>Any case works (lowercase or UPPERCASE)</span>
              )}
            </div>
          </div>
        )}

        {phase === 'ROUND_END' && (
          <div className="text-center">
            <span className="text-xs text-zinc-500">The word was</span>
            <p className="font-display text-base sm:text-lg font-bold text-zinc-900">{secretWord}</p>
          </div>
        )}

        {phase === 'GAME_OVER' && (
          <p className="font-display text-sm sm:text-base font-bold text-zinc-900">
            Match Complete — Final Standings
          </p>
        )}
      </div>
    </header>
  );
}
