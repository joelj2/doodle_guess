'use client';

import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AvatarConfig, RoomSettings } from '../shared/types.ts';
import { AvatarCustomizer } from './AvatarView.tsx';
import heroStudioImg from '../assets/images/hero_doodle_studio_1794627023128.jpg';

interface LandingViewProps {
  name: string;
  avatar: AvatarConfig;
  initialJoinCode: string;
  errorMsg: string | null;
  connecting: boolean;
  onNameChange: (next: string) => void;
  onAvatarChange: (next: AvatarConfig) => void;
  onCreateRoom: (settings?: Partial<RoomSettings>) => void;
  onJoinRoom: (code: string) => void;
}

export function LandingView({
  name,
  avatar,
  initialJoinCode,
  errorMsg,
  connecting,
  onNameChange,
  onAvatarChange,
  onCreateRoom,
  onJoinRoom,
}: LandingViewProps) {
  const [joinCode, setJoinCode] = useState(initialJoinCode);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) return;
    onJoinRoom(cleaned);
  };

  return (
    <div className="min-h-screen bg-[#F4F2ED] text-zinc-900 flex flex-col">
      {/* Top Bar */}
      <header className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-6 border-b border-[#E4E2DC]">
        <a
          href="/"
          className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-zinc-950 whitespace-nowrap shrink-0"
        >
          DoodleGuess
        </a>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            disabled={connecting}
            onClick={() => onCreateRoom()}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Create Room
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col justify-center">
        {/* Hero Section */}
        <section id="play" className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left: Player Setup & Room Actions */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-[#E4E2DC] p-5 sm:p-6 flex flex-col justify-between gap-5">
            <div className="space-y-1.5">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 text-balance">
                Draw fast, spot the hints, guess first.
              </h1>
              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                Compete live with friends in real-time drawing challenges featuring timed letter hints and smart case-insensitive answer matching.
              </p>
            </div>

            <div className="space-y-4">
              {/* Nickname */}
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-zinc-600">Your Nickname</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  maxLength={18}
                  placeholder="Enter a nickname..."
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] focus:border-zinc-900 focus:bg-white text-xs sm:text-sm font-semibold text-zinc-900 outline-none transition-colors"
                />
              </label>

              {/* Avatar Customizer */}
              <div className="pt-0.5">
                <AvatarCustomizer value={avatar} onChange={onAvatarChange} />
              </div>

              {errorMsg && (
                <p className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                  {errorMsg}
                </p>
              )}

              {/* Create / Join Controls */}
              <div className="pt-2.5 border-t border-[#E4E2DC] space-y-2.5">
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => onCreateRoom()}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>{connecting ? 'Connecting...' : 'Create New Room'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <form onSubmit={handleJoinSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="Enter room code (e.g. INK4)"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] focus:border-zinc-900 focus:bg-white font-mono-tabular text-xs sm:text-sm font-semibold uppercase text-zinc-900 placeholder:normal-case placeholder:font-sans placeholder:font-normal placeholder:text-zinc-400 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={connecting || !joinCode.trim()}
                    className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Join Room
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Right: Studio Illustration */}
          <div className="lg:col-span-6 rounded-2xl border border-[#E4E2DC] bg-white overflow-hidden flex flex-col">
            <div className="relative flex-1 min-h-[260px] bg-[#EDE9DF]">
              <img
                src={heroStudioImg.src}
                alt="Overhead artist studio desk with markers, ink brush, and sketchbook doodles of a cricket bat, rocket, and crown"
                referrerPolicy="no-referrer"
                className="w-full h-full lg:h-full object-cover"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
