'use client';

import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import type { Player } from '../shared/types.ts';
import type { VoiceChatState } from '../hooks/useVoiceChat.ts';

interface VoiceBarProps {
  voice: VoiceChatState;
  players: Player[];
}

export function VoiceBar({ voice, players }: VoiceBarProps) {
  const voicePlayers = players.filter((p) => p.voiceJoined);
  const activeSpeakers = voicePlayers.filter((p) => p.isSpeaking && !p.voiceMuted);

  return (
    <div className="bg-white rounded-2xl border border-[#E4E2DC] p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              voice.joined
                ? voice.isSpeaking && !voice.micMuted
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-900 text-white'
                : 'bg-[#F4F2ED] text-zinc-700'
            }`}
          >
            {voice.joined && voice.micMuted ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold text-zinc-900 truncate">Voice Channel</h3>
            <p className="text-xs text-zinc-500 truncate">
              {voice.joined
                ? activeSpeakers.length > 0
                  ? `Speaking: ${activeSpeakers.map((p) => p.name).join(', ')}`
                  : `${voicePlayers.length} in voice · ${voice.micMuted ? 'Mic muted' : 'Mic live'}`
                : `${voicePlayers.length} player${voicePlayers.length === 1 ? '' : 's'} connected`}
            </p>
          </div>
        </div>

        {/* Action Controls (min 44px touch height on mobile) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!voice.joined ? (
            <button
              type="button"
              disabled={voice.joining}
              onClick={voice.joinVoice}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Mic className="w-4 h-4" />
              <span>{voice.joining ? 'Connecting...' : 'Join Voice'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={voice.toggleMicMute}
                aria-label={voice.micMuted ? 'Unmute microphone' : 'Mute microphone'}
                title={voice.micMuted ? 'Unmute mic' : 'Mute mic'}
                className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  voice.micMuted
                    ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                    : 'bg-[#F4F2ED] text-zinc-800 hover:bg-zinc-200/70'
                }`}
              >
                {voice.micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span className="hidden sm:inline">{voice.micMuted ? 'Muted' : 'Mic On'}</span>
              </button>

              <button
                type="button"
                onClick={voice.toggleDeafen}
                aria-label={voice.deafened ? 'Enable incoming audio' : 'Deafen incoming audio'}
                title={voice.deafened ? 'Un-deafen' : 'Mute incoming voice'}
                className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  voice.deafened
                    ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                    : 'bg-[#F4F2ED] text-zinc-800 hover:bg-zinc-200/70'
                }`}
              >
                {voice.deafened ? (
                  <HeadphoneOff className="w-4 h-4" />
                ) : (
                  <Headphones className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={voice.leaveVoice}
                aria-label="Leave voice chat"
                title="Leave voice chat"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-2.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live Mic Input Meter when joined */}
      {voice.joined && (
        <div className="flex items-center gap-2.5">
          <Volume2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <div className="flex-1 h-2 rounded-full bg-[#F4F2ED] overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-75 ${
                voice.micMuted ? 'bg-zinc-300' : voice.isSpeaking ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: `${voice.micMuted ? 0 : Math.max(4, voice.micLevel)}%` }}
            />
          </div>
          <span className="font-mono-tabular text-[11px] font-medium text-zinc-500 w-16 text-right shrink-0">
            {voice.micMuted ? 'Muted' : voice.isSpeaking ? 'Talking' : 'Quiet'}
          </span>
        </div>
      )}

      {/* Voice Participants Strip */}
      {voicePlayers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#E4E2DC]">
          {voicePlayers.map((vp) => (
            <div
              key={vp.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                vp.isSpeaking && !vp.voiceMuted
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-[#F4F2ED] border-[#E4E2DC] text-zinc-700'
              }`}
            >
              {vp.voiceMuted ? (
                <MicOff className="w-3 h-3 text-red-600" />
              ) : (
                <Mic
                  className={`w-3 h-3 ${
                    vp.isSpeaking ? 'text-emerald-600' : 'text-zinc-500'
                  }`}
                />
              )}
              <span className="truncate max-w-[90px]">{vp.name}</span>
            </div>
          ))}
        </div>
      )}

      {voice.error && (
        <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {voice.error}
        </p>
      )}
    </div>
  );
}
