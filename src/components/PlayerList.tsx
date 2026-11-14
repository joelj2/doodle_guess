'use client';

import { CheckCircle2, Crown, Mic, MicOff, Pencil } from 'lucide-react';
import { motion } from 'motion/react';
import type { Player } from '../shared/types.ts';
import { AvatarView } from './AvatarView.tsx';

interface PlayerListProps {
  players: Player[];
  currentPlayerId: string | null;
}

export function PlayerList({ players, currentPlayerId }: PlayerListProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <aside className="bg-white rounded-2xl border border-[#E4E2DC] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 pb-1 border-b border-[#E4E2DC]">
        <h2 className="font-display text-sm font-bold text-zinc-900">Players</h2>
        <span className="font-mono-tabular text-xs font-medium text-zinc-500">{players.length}</span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[540px] overflow-y-auto">
        {sorted.map((p, index) => {
          const isMe = p.id === currentPlayerId;
          return (
            <motion.div
              key={p.id}
              layout
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`flex items-center gap-2.5 p-2 rounded-xl border transition-colors ${
                p.hasGuessed
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : p.isDrawing
                    ? 'bg-blue-50/70 border-blue-200'
                    : isMe
                      ? 'bg-[#F4F2ED]/80 border-[#E4E2DC]'
                      : 'bg-white border-transparent hover:bg-[#F4F2ED]/50'
              }`}
            >
              <span className="font-mono-tabular text-xs font-bold text-zinc-400 w-4 text-center shrink-0">
                #{index + 1}
              </span>

              <AvatarView
                avatar={p.avatar}
                size={36}
                isSpeaking={p.voiceJoined && p.isSpeaking}
                voiceMuted={p.voiceJoined && p.voiceMuted}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-zinc-900 truncate">{p.name}</span>
                  {isMe && <span className="text-[11px] font-medium text-zinc-500">(You)</span>}
                  {p.isHost && (
                    <span title="Room Host" className="text-amber-600 shrink-0">
                      <Crown className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {p.voiceJoined && (
                    <span
                      title={p.voiceMuted ? 'Voice muted' : 'In voice chat'}
                      className={`shrink-0 ${
                        p.voiceMuted
                          ? 'text-red-500'
                          : p.isSpeaking
                            ? 'text-emerald-600'
                            : 'text-zinc-400'
                      }`}
                    >
                      {p.voiceMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-mono-tabular font-semibold text-zinc-800">{p.score} pts</span>
                  {p.roundScore > 0 && (
                    <span className="font-mono-tabular text-emerald-700 font-semibold">
                      +{p.roundScore}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {p.isDrawing && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Drawing</span>
                  </span>
                )}
                {!p.isDrawing && p.hasGuessed && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Guessed</span>
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </aside>
  );
}
