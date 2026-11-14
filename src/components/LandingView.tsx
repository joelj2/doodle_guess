'use client';

import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Lightbulb, Palette, Users } from 'lucide-react';
import type { AvatarConfig, PublicRoomSummary, RoomSettings } from '../shared/types.ts';
import { AvatarCustomizer } from './AvatarView.tsx';
import heroStudioImg from '../assets/images/hero_doodle_studio_1794627023128.jpg';

interface LandingViewProps {
  name: string;
  avatar: AvatarConfig;
  publicRooms: PublicRoomSummary[];
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
  publicRooms,
  initialJoinCode,
  errorMsg,
  connecting,
  onNameChange,
  onAvatarChange,
  onCreateRoom,
  onJoinRoom,
}: LandingViewProps) {
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [isPublicRoom, setIsPublicRoom] = useState(true);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) return;
    onJoinRoom(cleaned);
  };

  return (
    <div className="min-h-screen bg-[#F4F2ED] text-zinc-900 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-8 border-b border-[#E4E2DC]">
        <a
          href="/"
          className="font-display text-xl font-extrabold tracking-tight text-zinc-950 whitespace-nowrap shrink-0"
        >
          DoodleGuess
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
          <a href="#play" className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0">
            Play Now
          </a>
          <a href="#public-rooms" className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0">
            Public Rooms
          </a>
          
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            disabled={connecting}
            onClick={() => onCreateRoom({ isPublic: isPublicRoom })}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Create Room
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-14">
        {/* Hero Split */}
        <section id="play" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Player Setup & Room Actions */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-[#E4E2DC] p-6 flex flex-col justify-between gap-6">
            <div className="space-y-2">
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-950 text-balance">
                Draw fast, spot the hints, guess first.
              </h1>
              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                Compete live with friends in real-time drawing challenges featuring timed letter hints and smart case-insensitive answer matching.
              </p>
            </div>

            <div className="space-y-5">
              {/* Nickname */}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-zinc-600">Your Nickname</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  maxLength={18}
                  placeholder="Enter a nickname..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] focus:border-zinc-900 focus:bg-white text-sm font-semibold text-zinc-900 outline-none transition-colors"
                />
              </label>

              {/* Avatar Customizer */}
              <div className="pt-1">
                <AvatarCustomizer value={avatar} onChange={onAvatarChange} />
              </div>

              {errorMsg && (
                <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {errorMsg}
                </p>
              )}

              {/* Create / Join Controls */}
              <div className="pt-3 border-t border-[#E4E2DC] space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={() => onCreateRoom({ isPublic: isPublicRoom })}
                    className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>{connecting ? 'Connecting...' : 'Create New Room'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC]">
                    <button
                      type="button"
                      onClick={() => setIsPublicRoom(true)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        isPublicRoom ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPublicRoom(false)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        !isPublicRoom ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Private
                    </button>
                  </div>
                </div>

                <form onSubmit={handleJoinSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="Enter room code (e.g. INK42X)"
                    className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#F4F2ED] border border-[#E4E2DC] focus:border-zinc-900 focus:bg-white font-mono-tabular text-sm font-semibold uppercase text-zinc-900 placeholder:normal-case placeholder:font-sans placeholder:font-normal placeholder:text-zinc-400 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={connecting || !joinCode.trim()}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Join Room
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Right: Studio Illustration */}
          <div className="lg:col-span-6 rounded-2xl border border-[#E4E2DC] bg-white overflow-hidden flex flex-col">
            <div className="relative flex-1 min-h-[280px] bg-[#EDE9DF]">
              <img
                src={heroStudioImg.src}
                alt="Overhead artist studio desk with markers, ink brush, and sketchbook doodles of a cricket bat, rocket, and crown"
                referrerPolicy="no-referrer"
                className="w-full h-full lg:h-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* Active Public Rooms */}
        <section id="public-rooms" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-zinc-950">Open Public Rooms</h2>
              <p className="text-sm text-zinc-600">Jump straight into a live match with other players.</p>
            </div>
            <span className="font-mono-tabular text-xs font-semibold text-zinc-500">
              {publicRooms.length} active
            </span>
          </div>

          {publicRooms.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E4E2DC] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-900">No public rooms open right now</p>
                <p className="text-xs text-zinc-500">
                  Start a new public room and share the invite link or let others join from this board.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCreateRoom({ isPublic: true })}
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Open Public Room
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicRooms.map((room) => (
                <div
                  key={room.code}
                  className="bg-white rounded-2xl border border-[#E4E2DC] p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tabular text-sm font-bold text-zinc-950">
                        {room.code}
                      </span>
                      <span className="text-xs text-zinc-400" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-xs font-medium text-zinc-600 truncate">
                        Host: {room.hostName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-1 font-mono-tabular">
                        <Users className="w-3.5 h-3.5" />
                        {room.playerCount}/{room.maxPlayers}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {room.phase === 'LOBBY'
                          ? 'In Lobby'
                          : `Round ${room.currentRound}/${room.totalRounds}`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={room.playerCount >= room.maxPlayers}
                    onClick={() => onJoinRoom(room.code)}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {room.playerCount >= room.maxPlayers ? 'Full' : 'Join'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
