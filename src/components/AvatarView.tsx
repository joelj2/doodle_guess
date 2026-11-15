'use client';

import type { AvatarAccessory, AvatarColor, AvatarConfig, AvatarFace } from '../shared/types.ts';

export const AVATAR_COLORS: AvatarColor[] = [
  '#2563EB',
  '#DC2626',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#3F3F46',
];

export const AVATAR_FACES: { id: AvatarFace; label: string }[] = [
  { id: 'happy', label: 'Happy' },
  { id: 'wink', label: 'Wink' },
  { id: 'focused', label: 'Focused' },
  { id: 'cool', label: 'Cool' },
  { id: 'surprised', label: 'Whoa' },
  { id: 'cheery', label: 'Cheery' },
];

export const AVATAR_ACCESSORIES: { id: AvatarAccessory; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'beret', label: 'Beret' },
  { id: 'crown', label: 'Crown' },
  { id: 'cap', label: 'Cap' },
  { id: 'glasses', label: 'Specs' },
  { id: 'headphones', label: 'Phones' },
];

interface AvatarViewProps {
  avatar: AvatarConfig;
  size?: number;
  className?: string;
  isSpeaking?: boolean;
  voiceMuted?: boolean;
}

export function AvatarView({
  avatar,
  size = 44,
  className = '',
  isSpeaking = false,
  voiceMuted = false,
}: AvatarViewProps) {
  const { color, face, accessory } = avatar;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full shrink-0 transition-shadow duration-150 ${
        isSpeaking && !voiceMuted ? 'ring-[3px] ring-emerald-500 ring-offset-1' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
      {/* Head / Body Circle */}
      <circle cx="32" cy="35" r="21" fill={color} stroke="#18181B" strokeWidth="2.5" />
      <ellipse cx="32" cy="33" rx="16" ry="15" fill="#FFFFFF" fillOpacity="0.12" />

      {/* Accessories behind/above */}
      {accessory === 'headphones' && (
        <g>
          <path
            d="M11 35C11 21 20 12 32 12C44 12 53 21 53 35"
            stroke="#18181B"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <rect x="7" y="29" width="7" height="13" rx="3.5" fill="#F59E0B" stroke="#18181B" strokeWidth="2" />
          <rect x="50" y="29" width="7" height="13" rx="3.5" fill="#F59E0B" stroke="#18181B" strokeWidth="2" />
        </g>
      )}

      {accessory === 'beret' && (
        <g>
          <path
            d="M14 21C16 11 32 8 46 13C51 15 51 21 44 22H16C13.5 22 13.5 21 14 21Z"
            fill="#F43F5E"
            stroke="#18181B"
            strokeWidth="2.2"
          />
          <path d="M31 10L33 6" stroke="#18181B" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {accessory === 'crown' && (
        <path
          d="M18 19L21 8L28 14L32 6L36 14L43 8L46 19H18Z"
          fill="#FBBF24"
          stroke="#18181B"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      )}

      {accessory === 'cap' && (
        <g>
          <path
            d="M14 22C15 12 24 9 32 9C40 9 47 13 48 22H14Z"
            fill="#18181B"
          />
          <path d="M13 22H54C56 22 56 25 52 25H13V22Z" fill="#F59E0B" stroke="#18181B" strokeWidth="2" />
        </g>
      )}

      {/* Eyes */}
      {face === 'cool' ? (
        <g>
          <rect x="17" y="28" width="13" height="8" rx="2.5" fill="#18181B" />
          <rect x="34" y="28" width="13" height="8" rx="2.5" fill="#18181B" />
          <path d="M30 31H34" stroke="#18181B" strokeWidth="2.5" />
          <path d="M20 30L23 34" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M37 30L40 34" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      ) : face === 'wink' ? (
        <g>
          <circle cx="24" cy="32" r="2.8" fill="#18181B" />
          <circle cx="23" cy="31" r="0.9" fill="#FFFFFF" />
          <path d="M36 32.5C37.5 30 41.5 30 43 32.5" stroke="#18181B" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      ) : face === 'focused' ? (
        <g>
          <path d="M20 27L27 29.5" stroke="#18181B" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M44 27L37 29.5" stroke="#18181B" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="24" cy="33" r="2.6" fill="#18181B" />
          <circle cx="40" cy="33" r="2.6" fill="#18181B" />
        </g>
      ) : (
        <g>
          <circle cx="24" cy="32" r="2.9" fill="#18181B" />
          <circle cx="40" cy="32" r="2.9" fill="#18181B" />
          <circle cx="23" cy="31" r="1" fill="#FFFFFF" />
          <circle cx="39" cy="31" r="1" fill="#FFFFFF" />
        </g>
      )}

      {/* Glasses overlay */}
      {accessory === 'glasses' && face !== 'cool' && (
        <g>
          <circle cx="24" cy="32" r="6" stroke="#18181B" strokeWidth="2.2" fill="#FFFFFF" fillOpacity="0.18" />
          <circle cx="40" cy="32" r="6" stroke="#18181B" strokeWidth="2.2" fill="#FFFFFF" fillOpacity="0.18" />
          <path d="M30 32H34" stroke="#18181B" strokeWidth="2.2" />
        </g>
      )}

      {/* Mouth */}
      {face === 'surprised' ? (
        <circle cx="32" cy="43" r="3.8" fill="#18181B" />
      ) : face === 'focused' ? (
        <path d="M27 43H37" stroke="#18181B" strokeWidth="2.5" strokeLinecap="round" />
      ) : face === 'cheery' ? (
        <path d="M25 40C27 46 37 46 39 40Z" fill="#18181B" />
      ) : (
        <path d="M25 41C27.5 45 36.5 45 39 41" stroke="#18181B" strokeWidth="2.6" strokeLinecap="round" />
      )}
    </svg>
    {voiceMuted && (
      <span
        title="Microphone muted"
        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-600 border-2 border-white flex items-center justify-center"
      >
        <span className="w-2 h-0.5 bg-white rotate-45 block rounded-full" />
      </span>
    )}
    </div>
  );
}

interface AvatarCustomizerProps {
  value: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
}

export function AvatarCustomizer({ value, onChange }: AvatarCustomizerProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="shrink-0 flex flex-col items-center gap-2">
        <div className="w-24 h-24 rounded-2xl bg-[#F4F2ED] border border-[#E4E2DC] flex items-center justify-center">
          <AvatarView avatar={value} size={76} />
        </div>
        <button
          type="button"
          onClick={() => {
            const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
            const face = AVATAR_FACES[Math.floor(Math.random() * AVATAR_FACES.length)].id;
            const accessory = AVATAR_ACCESSORIES[Math.floor(Math.random() * AVATAR_ACCESSORIES.length)].id;
            onChange({ color, face, accessory });
          }}
          className="text-[11px] font-medium text-zinc-600 hover:text-zinc-950 underline underline-offset-2 cursor-pointer whitespace-nowrap"
        >
          Randomize
        </button>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        <div>
          <span className="block text-[11px] font-medium text-zinc-500 mb-1">Ink Color</span>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => onChange({ ...value, color: c })}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-md transition-transform cursor-pointer ${
                  value.color === c ? 'ring-2 ring-offset-2 ring-zinc-900 scale-105' : 'hover:scale-105'
                }`}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-zinc-500 mb-1">Expression</span>
          <div className="grid grid-cols-3 gap-1">
            {AVATAR_FACES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onChange({ ...value, face: f.id })}
                className={`px-2 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  value.face === f.id
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-[#E4E2DC] hover:bg-zinc-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-[11px] font-medium text-zinc-500 mb-1">Accessory</span>
          <div className="grid grid-cols-3 gap-1">
            {AVATAR_ACCESSORIES.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => onChange({ ...value, accessory: acc.id })}
                className={`px-2 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  value.accessory === acc.id
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-[#E4E2DC] hover:bg-zinc-50'
                }`}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
