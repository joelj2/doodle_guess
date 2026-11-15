'use client';

import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import type { Player } from '../shared/types.ts';
import type { PeerVoiceState } from '../hooks/usePeerVoice.ts';

interface VoiceBarProps {
  voice: PeerVoiceState;
  players: Player[];
}

export function VoiceBar({ voice, players }: VoiceBarProps) {
  const voicePlayers = players.filter((p) => p.voiceJoined);
  const activeSpeakers = voicePlayers.filter((p) => p.isSpeaking && !p.voiceMuted);

  return (
    <div className="bg-white rounded-2xl border border-[#E4E2DC] p-2.5 sm:p-3 space-y-2.5 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              voice.joined
                ? voice.isSpeaking && !voice.micMuted
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-900 text-white'
                : 'bg-[#F4F2ED] text-zinc-700'
            }`}
          >
            {voice.joined && voice.micMuted ? (
              <MicOff className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-xs font-bold text-zinc-900 truncate">Voice Channel</h3>
            <p className="text-[11px] text-zinc-500 truncate">
              {voice.joined
                ? activeSpeakers.length > 0
                  ? `Speaking: ${activeSpeakers.map((p) => p.name).join(', ')}`
                  : `${voicePlayers.length} in voice · ${voice.micMuted ? 'Muted' : 'Live'}`
                : `${voicePlayers.length} connected`}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!voice.joined ? (
            <button
              type="button"
              disabled={voice.joining}
              onClick={voice.joinVoice}
              className="min-h-[34px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{voice.joining ? 'Joining...' : 'Join Voice'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={voice.toggleMicMute}
                aria-label={voice.micMuted ? 'Unmute microphone' : 'Mute microphone'}
                title={voice.micMuted ? 'Unmute mic' : 'Mute mic'}
                className={`min-h-[34px] min-w-[34px] inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  voice.micMuted
                    ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                    : 'bg-[#F4F2ED] text-zinc-800 hover:bg-zinc-200/70'
                }`}
              >
                {voice.micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{voice.micMuted ? 'Muted' : 'Mic'}</span>
              </button>

              <button
                type="button"
                onClick={voice.toggleDeafen}
                aria-label={voice.deafened ? 'Enable incoming audio' : 'Deafen incoming audio'}
                title={voice.deafened ? 'Un-deafen' : 'Mute incoming voice'}
                className={`min-h-[34px] min-w-[34px] inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  voice.deafened
                    ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                    : 'bg-[#F4F2ED] text-zinc-800 hover:bg-zinc-200/70'
                }`}
              >
                {voice.deafened ? (
                  <HeadphoneOff className="w-3.5 h-3.5" />
                ) : (
                  <Headphones className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={voice.leaveVoice}
                aria-label="Leave voice chat"
                title="Leave voice chat"
                className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center px-2 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live Mic Input Meter when joined */}
      {voice.joined && (
        <div className="flex items-center gap-2">
          <Volume2 className="w-3 h-3 text-zinc-400 shrink-0" />
          <div className="flex-1 h-1.5 rounded-full bg-[#F4F2ED] overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-75 ${
                voice.micMuted ? 'bg-zinc-300' : voice.isSpeaking ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: `${voice.micMuted ? 0 : Math.max(4, voice.micLevel)}%` }}
            />
          </div>
          <span className="font-mono-tabular text-[10px] font-medium text-zinc-500 w-14 text-right shrink-0">
            {voice.micMuted ? 'Muted' : voice.isSpeaking ? 'Talking' : 'Quiet'}
          </span>
        </div>
      )}

      {/* Voice Participants Strip */}
      {voicePlayers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#E4E2DC]">
          {voicePlayers.map((vp) => (
            <div
              key={vp.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-colors ${
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
              <span className="truncate max-w-[80px]">{vp.name}</span>
            </div>
          ))}
        </div>
      )}

      {voice.error && (
        <p className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5">
          {voice.error}
        </p>
      )}
    </div>
  );
}
