'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Lightbulb, Send } from 'lucide-react';
import { motion } from 'motion/react';
import type { ChatMessage, GamePhase } from '../shared/types.ts';

const REACTION_EMOJIS = ['👍', '🔥', '😂', '😮', '👏', '🎨'];

interface GuessChatProps {
  messages: ChatMessage[];
  phase: GamePhase;
  isDrawer: boolean;
  hasGuessed: boolean;
  onSendGuess: (text: string) => void;
  onSendReaction: (emoji: string) => void;
}

export function GuessChat({
  messages,
  phase,
  isDrawer,
  hasGuessed,
  onSendGuess,
  onSendReaction,
}: GuessChatProps) {
  const [input, setInput] = useState('');
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement !== inputRef.current && !isDrawer) {
        const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'BUTTON') {
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDrawer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendGuess(trimmed);
    setInput('');
  };

  const placeholder =
    phase === 'DRAWING'
      ? isDrawer
        ? 'Chat with players (no spoilers)...'
        : hasGuessed
          ? 'You guessed it! Chat quietly...'
          : 'Type your guess (e.g. cricket bat)...'
      : 'Send a message...';

  return (
    <aside className="bg-white rounded-2xl border border-[#E4E2DC] p-3 flex flex-col h-[320px] sm:h-[380px] lg:h-[600px]">
      <div className="flex items-center justify-between px-1 pb-2 border-b border-[#E4E2DC]">
        <h2 className="font-display text-sm font-bold text-zinc-900">Guesses & Chat</h2>
        <div className="flex items-center gap-0.5 sm:gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSendReaction(emoji)}
              title={`React ${emoji}`}
              className="w-8 h-8 rounded-lg hover:bg-[#F4F2ED] text-sm flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto py-2.5 space-y-1.5 pr-1">
        {messages.map((msg) => {
          if (msg.kind === 'correct') {
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18 }}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800"
              >
                {msg.text}
              </motion.div>
            );
          }

          if (msg.kind === 'close') {
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.16 }}
                className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800"
              >
                {msg.text}
              </motion.div>
            );
          }

          if (msg.kind === 'hint') {
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
                className="px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-800 flex items-center gap-1.5"
              >
                <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                <span>{msg.text}</span>
              </motion.div>
            );
          }

          if (msg.kind === 'system') {
            return (
              <div key={msg.id} className="px-2 py-1 text-xs text-zinc-500">
                {msg.text}
              </div>
            );
          }

          return (
            <div key={msg.id} className="px-2 py-1 rounded-lg hover:bg-[#F4F2ED]/60 text-sm break-words">
              {msg.playerName && (
                <span className="font-semibold text-zinc-900 mr-1.5">{msg.playerName}:</span>
              )}
              <span className="text-zinc-700">{msg.text}</span>
            </div>
          );
        })}
      </div>

      {/* Guess Input */}
      <form onSubmit={handleSubmit} className="pt-2 border-t border-[#E4E2DC] flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={120}
          placeholder={placeholder}
          className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#F4F2ED] border border-transparent focus:border-zinc-900 focus:bg-white text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors"
        />
        <button
          type="submit"
          aria-label="Send guess"
          className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shrink-0 flex items-center justify-center"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
}
