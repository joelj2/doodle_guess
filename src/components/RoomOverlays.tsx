'use client';

import { useState } from 'react';
import { Award, Play, RotateCcw, SlidersHorizontal, Sparkles, Users } from 'lucide-react';
import { motion } from 'motion/react';
import type {
  Player,
  RoomSettings,
  RoundSummary,
  WordMode,
  WordOption,
} from '../shared/types.ts';
import { AvatarView } from './AvatarView.tsx';
import trophySketchImg from '../assets/images/trophy_sketch_badge_1794627024137.jpg';

interface LobbyPanelProps {
  settings: RoomSettings;
  isHost: boolean;
  playerCount: number;
  startError: string | null;
  onUpdateSettings: (partial: Partial<RoomSettings>) => void;
  onStartGame: () => void;
}

export function LobbyPanel({
  settings,
  isHost,
  playerCount,
  startError,
  onUpdateSettings,
  onStartGame,
}: LobbyPanelProps) {
  const [customText, setCustomText] = useState(settings.customWords.join(', '));
  const [showCustomEditor, setShowCustomEditor] = useState(false);

  const handleSaveCustomWords = () => {
    const parsed = customText
      .split(/[\n,]+/)
      .map((w) => w.trim().replace(/\s+/g, ' '))
      .filter((w) => w.length >= 2);
    onUpdateSettings({ customWords: parsed });
    setShowCustomEditor(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E4E2DC] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-zinc-700" />
          <h3 className="font-display text-base font-bold text-zinc-900">Match Configuration</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Users className="w-3.5 h-3.5" />
          <span>
            {playerCount} / {settings.maxPlayers} players
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Rounds</span>
          <select
            disabled={!isHost}
            value={settings.rounds}
            onChange={(e) => onUpdateSettings({ rounds: Number(e.target.value) })}
            className="px-3 py-2 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] text-sm font-semibold text-zinc-900 disabled:opacity-60"
          >
            {[2, 3, 4, 5, 6].map((r) => (
              <option key={r} value={r}>
                {r} Rounds
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Draw Time</span>
          <select
            disabled={!isHost}
            value={settings.drawTime}
            onChange={(e) => onUpdateSettings({ drawTime: Number(e.target.value) })}
            className="px-3 py-2 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] text-sm font-semibold text-zinc-900 disabled:opacity-60"
          >
            {[45, 60, 80, 100, 120].map((t) => (
              <option key={t} value={t}>
                {t} Seconds
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Timed Hints</span>
          <select
            disabled={!isHost}
            value={settings.hintCount}
            onChange={(e) => onUpdateSettings({ hintCount: Number(e.target.value) })}
            className="px-3 py-2 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] text-sm font-semibold text-zinc-900 disabled:opacity-60"
          >
            <option value={0}>No Hints</option>
            <option value={2}>2 Letter Hints</option>
            <option value={3}>3 Letter Hints</option>
            <option value={4}>4 Letter Hints</option>
            <option value={5}>5 Letter Hints</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Word Pool</span>
          <select
            disabled={!isHost}
            value={settings.wordMode}
            onChange={(e) => onUpdateSettings({ wordMode: e.target.value as WordMode })}
            className="px-3 py-2 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] text-sm font-semibold text-zinc-900 disabled:opacity-60"
          >
            <option value="standard">Standard (250+)</option>
            <option value="mixed">Mixed + Custom</option>
            <option value="custom">Custom Only</option>
          </select>
        </label>
      </div>

      {isHost && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCustomEditor((v) => !v)}
              className="px-3 py-2 rounded-xl bg-[#F4F2ED] hover:bg-zinc-200/70 text-xs font-semibold text-zinc-800 cursor-pointer whitespace-nowrap"
            >
              Custom Words ({settings.customWords.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onStartGame}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4" />
            <span>Start Match</span>
          </button>
        </div>
      )}

      {!isHost && (
        <p className="text-xs text-zinc-500">
          Waiting for the room host to start the match. Practice sketching on the board above!
        </p>
      )}

      {startError && (
        <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {startError}
        </p>
      )}

      {isHost && showCustomEditor && (
        <div className="pt-2 border-t border-[#E4E2DC] space-y-2">
          <label className="block text-xs font-medium text-zinc-600">
            Enter custom words separated by commas (supports multi-word phrases like "cricket bat"):
          </label>
          <textarea
            rows={3}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="cricket bat, solar eclipse, pizza slice, mountain bike"
            className="w-full p-3 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] text-sm text-zinc-900 outline-none focus:border-zinc-900"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCustomEditor(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCustomWords}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
            >
              Save Words
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface WordChoiceOverlayProps {
  options: WordOption[];
  timeLeft: number;
  onSelect: (word: string) => void;
}

export function WordChoiceOverlay({ options, timeLeft, onSelect }: WordChoiceOverlayProps) {
  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/50 backdrop-blur-[2px] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl border border-[#E4E2DC] shadow-xl max-w-lg w-full p-5 sm:p-6 space-y-5 text-center"
      >
        <div className="space-y-1">
          <span className="font-mono-tabular text-xs font-semibold text-amber-700">
            Choose in {timeLeft}s
          </span>
          <h2 className="font-display text-2xl font-bold text-zinc-900">Your Turn to Draw</h2>
          <p className="text-sm text-zinc-600">Pick one word or phrase for players to guess.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map((opt) => (
            <button
              key={opt.word}
              type="button"
              onClick={() => onSelect(opt.word)}
              className="min-h-[64px] group p-4 rounded-xl bg-[#F4F2ED] hover:bg-zinc-900 border border-[#E4E2DC] hover:border-zinc-900 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1"
            >
              <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-300">
                {opt.category}
              </span>
              <span className="font-display text-base font-bold text-zinc-900 group-hover:text-white">
                {opt.word}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

interface RoundSummaryBannerProps {
  summary: RoundSummary;
  timeLeft: number;
}

export function RoundSummaryBanner({ summary, timeLeft }: RoundSummaryBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-2xl border border-[#E4E2DC] p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E4E2DC]">
        <div>
          <span className="text-xs font-medium text-zinc-500">
            {summary.reason === 'all_guessed'
              ? 'Everyone guessed it!'
              : summary.reason === 'drawer_left'
                ? 'Drawer left the round'
                : "Time's up"}
          </span>
          <h3 className="font-display text-lg font-bold text-zinc-900">
            Answer: {summary.word}
          </h3>
        </div>
        <span className="font-mono-tabular text-xs font-semibold text-zinc-500">
          Next turn in {timeLeft}s
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {summary.results.map((r) => (
          <div
            key={r.playerId}
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#F4F2ED]"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{r.playerName}</p>
              <p className="text-xs text-zinc-500">
                {r.guessedInSeconds !== null ? `Guessed in ${r.guessedInSeconds}s` : 'Round total'}
              </p>
            </div>
            <span
              className={`font-mono-tabular text-sm font-bold ${
                r.pointsEarned > 0 ? 'text-emerald-700' : 'text-zinc-400'
              }`}
            >
              +{r.pointsEarned}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

interface GameOverOverlayProps {
  players: Player[];
  isHost: boolean;
  onPlayAgain: () => void;
  onLeaveRoom: () => void;
}

export function GameOverOverlay({
  players,
  isHost,
  onPlayAgain,
  onLeaveRoom,
}: GameOverOverlayProps) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const winner = ranked[0];

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="bg-white rounded-2xl border border-[#E4E2DC] shadow-xl max-w-xl w-full p-5 sm:p-6 space-y-6"
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-24 h-24 rounded-2xl overflow-hidden border border-[#E4E2DC] bg-[#F4F2ED]">
            <img
              src={trophySketchImg.src}
              alt="Championship trophy illustration"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Match Complete</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-zinc-900">
              {winner ? `${winner.name} Wins!` : 'Final Standings'}
            </h2>
          </div>
        </div>

        {/* Podium / Standings */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {ranked.map((p, idx) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                idx === 0
                  ? 'bg-amber-50/70 border-amber-200'
                  : 'bg-[#F4F2ED]/70 border-[#E4E2DC]'
              }`}
            >
              <span className="font-mono-tabular text-sm font-bold text-zinc-700 w-6 text-center">
                #{idx + 1}
              </span>
              <AvatarView avatar={p.avatar} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">{p.name}</p>
                {idx === 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <Award className="w-3.5 h-3.5" />
                    <span>Top Scorer</span>
                  </span>
                )}
              </div>
              <span className="font-mono-tabular text-base font-extrabold text-zinc-900">
                {p.score} pts
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[#E4E2DC]">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F4F2ED] hover:bg-zinc-200/70 text-sm font-semibold text-zinc-700 transition-colors cursor-pointer"
          >
            Exit to Menu
          </button>
          {isHost ? (
            <button
              type="button"
              onClick={onPlayAgain}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Again</span>
            </button>
          ) : (
            <span className="text-xs text-zinc-500">Waiting for host to start a rematch...</span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
