'use client';

import React, { useEffect, useRef } from 'react';
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

export const GuessChat = React.memo(function GuessChat({
  messages,
  phase,
  isDrawer,
  hasGuessed,
  onSendGuess,
  onSendReaction,
}: GuessChatProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  // Re-scroll to bottom if viewport resizes (e.g. mobile virtual keyboard pop-up)
  useEffect(() => {
    const handleResize = () => {
      if (feedRef.current) {
        feedRef.current.scrollTop = feedRef.current.scrollHeight;
      }
    };
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport?.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    const trimmed = input.value.trim();
    if (!trimmed) return;
    onSendGuess(trimmed);
    input.value = '';
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
    <aside className="bg-white rounded-2xl border border-[#E4E2DC] p-2.5 sm:p-3 flex flex-col h-full flex-1 min-h-0">
      <div className="flex items-center justify-between px-1 pb-1.5 border-b border-[#E4E2DC] shrink-0">
        <h2 className="font-display text-xs font-bold text-zinc-900">Guesses & Chat</h2>
        <div className="flex items-center gap-0.5 sm:gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSendReaction(emoji)}
              title={`React ${emoji}`}
              className="w-7 h-7 rounded-lg hover:bg-[#F4F2ED] text-xs flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Feed */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto py-2 space-y-1 pr-0.5">
        {messages.map((msg) => {
          if (msg.kind === 'correct') {
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.16 }}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800"
              >
                {msg.text}
              </motion.div>
            );
          }

          if (msg.kind === 'close') {
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.14 }}
                className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800"
              >
                {msg.text}
              </motion.div>
            );
          }

          if (msg.kind === 'hint') {
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14 }}
                className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[11px] font-medium text-blue-800 flex items-center gap-1.5"
              >
                <Lightbulb className="w-3 h-3 shrink-0" />
                <span>{msg.text}</span>
              </motion.div>
            );
          }

          if (msg.kind === 'system') {
            return (
              <div key={msg.id} className="px-2 py-0.5 text-[11px] text-zinc-500">
                {msg.text}
              </div>
            );
          }

          return (
            <div key={msg.id} className="px-2 py-1 rounded-lg hover:bg-[#F4F2ED]/60 text-xs leading-relaxed break-words">
              {msg.playerName && (
                <span className="font-semibold text-zinc-900 mr-1.5">{msg.playerName}:</span>
              )}
              <span className="text-zinc-700">{msg.text}</span>
            </div>
          );
        })}
      </div>

      {/* Guess Input (Native uncontrolled input prevents virtual keyboard caret resets) */}
      <form onSubmit={handleSubmit} className="pt-2 border-t border-[#E4E2DC] flex items-center gap-1.5 shrink-0">
        <input
          ref={inputRef}
          type="text"
          dir="ltr"
          defaultValue=""
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={120}
          placeholder={placeholder}
          className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#F4F2ED] border border-transparent focus:border-zinc-900 focus:bg-white text-xs text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors"
        />
        <button
          type="submit"
          aria-label="Send guess"
          className="min-w-[38px] min-h-[38px] p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shrink-0 flex items-center justify-center"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </aside>
  );
});
