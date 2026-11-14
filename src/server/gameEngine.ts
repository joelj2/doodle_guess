import type {
  AvatarConfig,
  ChatMessage,
  DrawAction,
  GamePhase,
  Player,
  PublicRoomSummary,
  ReactionEvent,
  RoomSettings,
  RoomStateSync,
  RoundPlayerResult,
  RoundSummary,
  WordOption,
} from '../shared/types.ts';
import {
  WORD_BANK,
  buildHintPattern,
  getRevealableIndices,
  isCloseGuess,
  isExactWordMatch,
} from '../shared/words.ts';

export const WORD_CHOICE_SECONDS = 15;
export const ROUND_END_SECONDS = 6;

export interface QueuedVoiceSignal {
  from: string;
  description?: Record<string, unknown>;
  candidate?: Record<string, unknown>;
}

export interface StoredReaction extends ReactionEvent {
  createdAt: number;
}

export interface ServerPlayer extends Player {
  lastSeen: number;
  isHttp: boolean;
}

export interface ServerRoom {
  code: string;
  settings: RoomSettings;
  phase: GamePhase;
  players: ServerPlayer[];
  currentRound: number;
  drawerOrder: string[];
  drawerQueueIdx: number;
  drawerId: string | null;
  secretWord: string | null;
  wordOptions: WordOption[];
  usedWords: string[];
  phaseEndsAt: number;
  totalTime: number;
  revealedIndices: number[];
  hintTriggers: number[];
  triggeredHints: number[];
  strokes: DrawAction[];
  redoStack: DrawAction[];
  messages: ChatMessage[];
  privateMessages: Record<string, ChatMessage[]>;
  voiceSignals: Record<string, QueuedVoiceSignal[]>;
  recentReactions: StoredReaction[];
  roundSummary: RoundSummary | null;
  guessTimes: Record<string, number>;
  updatedAt: number;
}

const g = globalThis as unknown as {
  __dgRooms?: Map<string, ServerRoom>;
  __dgSocketActive?: boolean;
};

if (!g.__dgRooms) {
  g.__dgRooms = new Map<string, ServerRoom>();
}

export function isSocketServerActive(): boolean {
  return Boolean(g.__dgSocketActive);
}

export function markSocketServerActive(): void {
  g.__dgSocketActive = true;
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    return { url: url.replace(/\/$/, ''), token };
  }
  return null;
}

export function hasSharedRedisStore(): boolean {
  return getRedisConfig() !== null;
}

async function redisCommand<T = unknown>(args: (string | number)[]): Promise<T | null> {
  const cfg = getRedisConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: T };
    return data.result ?? null;
  } catch {
    return null;
  }
}

export async function getRoom(code: string): Promise<ServerRoom | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const cfg = getRedisConfig();
  if (cfg) {
    const raw = await redisCommand<string>(['GET', `dg:room:${normalized}`]);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ServerRoom;
        g.__dgRooms!.set(normalized, parsed);
        return parsed;
      } catch {
        // fallback to memory
      }
    }
  }
  return g.__dgRooms!.get(normalized) ?? null;
}

export async function saveRoom(room: ServerRoom): Promise<void> {
  room.updatedAt = Date.now();
  g.__dgRooms!.set(room.code, room);

  const cfg = getRedisConfig();
  if (cfg) {
    await redisCommand(['SET', `dg:room:${room.code}`, JSON.stringify(room), 'EX', 3600]);
    if (room.settings.isPublic && room.players.some((p) => p.connected)) {
      await redisCommand(['SADD', 'dg:public_rooms', room.code]);
    } else {
      await redisCommand(['SREM', 'dg:public_rooms', room.code]);
    }
  }
}

export async function deleteRoom(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  g.__dgRooms!.delete(normalized);
  const cfg = getRedisConfig();
  if (cfg) {
    await redisCommand(['DEL', `dg:room:${normalized}`]);
    await redisCommand(['SREM', 'dg:public_rooms', normalized]);
  }
}

export function getInMemoryRoomsMap(): Map<string, ServerRoom> {
  return g.__dgRooms!;
}

export function makeId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (g.__dgRooms!.has(code));
  return code;
}

export function sanitizeName(name: string): string {
  const cleaned = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 18);
  return cleaned || `Artist${Math.floor(100 + Math.random() * 899)}`;
}

export function defaultAvatar(): AvatarConfig {
  return {
    color: '#2563EB',
    face: 'happy',
    accessory: 'none',
  };
}

export function sanitizeSettings(partial?: Partial<RoomSettings>): RoomSettings {
  const rounds = Math.min(8, Math.max(1, Number(partial?.rounds) || 3));
  const drawTime = Math.min(180, Math.max(30, Number(partial?.drawTime) || 80));
  const maxPlayers = Math.min(12, Math.max(2, Number(partial?.maxPlayers) || 8));
  const hintCount = Math.min(5, Math.max(0, partial?.hintCount ?? 3));
  const wordMode =
    partial?.wordMode === 'custom' || partial?.wordMode === 'mixed' || partial?.wordMode === 'standard'
      ? partial.wordMode
      : 'standard';
  const customWords = Array.isArray(partial?.customWords)
    ? partial.customWords
        .map((w) => String(w).trim().replace(/\s+/g, ' '))
        .filter((w) => w.length >= 2 && w.length <= 36)
        .slice(0, 100)
    : [];
  const isPublic = typeof partial?.isPublic === 'boolean' ? partial.isPublic : true;

  return {
    rounds,
    drawTime,
    maxPlayers,
    hintCount,
    wordMode,
    customWords,
    isPublic,
  };
}

function computeHintTriggers(drawTime: number, hintCount: number, word: string): number[] {
  if (hintCount <= 0) return [];
  const revealable = getRevealableIndices(word);
  const maxToReveal = Math.min(hintCount, Math.max(1, Math.floor(revealable.length * 0.55)));
  const triggers: number[] = [];
  for (let i = 1; i <= maxToReveal; i++) {
    const elapsedFraction = i / (maxToReveal + 1.15);
    const triggerAtLeft = Math.max(5, Math.round(drawTime * (1 - elapsedFraction)));
    if (!triggers.includes(triggerAtLeft)) {
      triggers.push(triggerAtLeft);
    }
  }
  return triggers.sort((a, b) => b - a);
}

export function computeTimeLeft(room: ServerRoom, now = Date.now()): number {
  if (room.phase === 'LOBBY' || room.phase === 'GAME_OVER') return 0;
  return Math.max(0, Math.ceil((room.phaseEndsAt - now) / 1000));
}

export function getNextHintIn(room: ServerRoom, now = Date.now()): number | null {
  if (room.phase !== 'DRAWING') return null;
  const timeLeft = computeTimeLeft(room, now);
  const upcoming = room.hintTriggers.find(
    (t) => t < timeLeft && !room.triggeredHints.includes(t)
  );
  if (upcoming === undefined) return null;
  return Math.max(1, timeLeft - upcoming);
}

export function pushMessageToRoom(
  room: ServerRoom,
  msg: ChatMessage
): ChatMessage {
  room.messages.push(msg);
  if (room.messages.length > 100) {
    room.messages = room.messages.slice(-85);
  }
  return msg;
}

export function pushSystemMessage(
  room: ServerRoom,
  text: string,
  kind: ChatMessage['kind'] = 'system'
): ChatMessage {
  return pushMessageToRoom(room, {
    id: makeId('msg'),
    text,
    kind,
    timestamp: Date.now(),
  });
}

function pickWordOptions(room: ServerRoom): WordOption[] {
  const customPool: WordOption[] = room.settings.customWords.map((w) => ({
    word: w,
    category: 'Custom',
  }));

  let pool: WordOption[] = [];
  if (room.settings.wordMode === 'custom' && customPool.length >= 3) {
    pool = customPool;
  } else if (room.settings.wordMode === 'mixed' && customPool.length > 0) {
    pool = [...customPool, ...WORD_BANK];
  } else {
    pool = WORD_BANK;
  }

  const usedSet = new Set(room.usedWords);
  let available = pool.filter((item) => !usedSet.has(item.word.toLowerCase()));
  if (available.length < 3) {
    room.usedWords = [];
    available = [...pool];
  }

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

export function beginWordChoiceOnRoom(room: ServerRoom): void {
  const now = Date.now();
  const connectedPlayers = room.players.filter((p) => p.connected);
  if (connectedPlayers.length < 2) {
    room.phase = 'LOBBY';
    room.drawerId = null;
    room.secretWord = null;
    room.strokes = [];
    room.redoStack = [];
    room.phaseEndsAt = 0;
    room.totalTime = 0;
    pushSystemMessage(room, 'Returned to lobby — waiting for at least 2 players.');
    return;
  }

  while (room.drawerQueueIdx < room.drawerOrder.length) {
    const candidateId = room.drawerOrder[room.drawerQueueIdx];
    const candidate = room.players.find((p) => p.id === candidateId && p.connected);
    if (candidate) {
      room.drawerId = candidate.id;
      break;
    }
    room.drawerQueueIdx++;
  }

  if (room.drawerQueueIdx >= room.drawerOrder.length) {
    if (room.currentRound >= room.settings.rounds) {
      finishGameOnRoom(room);
      return;
    }
    room.currentRound += 1;
    room.drawerOrder = connectedPlayers.map((p) => p.id);
    room.drawerQueueIdx = 0;
    room.drawerId = room.drawerOrder[0];
  }

  for (const p of room.players) {
    p.isDrawing = p.id === room.drawerId;
    p.hasGuessed = false;
    p.guessOrder = null;
    p.roundScore = 0;
  }

  room.phase = 'CHOOSING_WORD';
  room.secretWord = null;
  room.wordOptions = pickWordOptions(room);
  room.revealedIndices = [];
  room.hintTriggers = [];
  room.triggeredHints = [];
  room.strokes = [];
  room.redoStack = [];
  room.roundSummary = null;
  room.guessTimes = {};
  room.totalTime = WORD_CHOICE_SECONDS;
  room.phaseEndsAt = now + WORD_CHOICE_SECONDS * 1000;

  const drawer = room.players.find((p) => p.id === room.drawerId);
  pushSystemMessage(room, `${drawer?.name ?? 'Player'} is choosing a word...`);
}

export function startDrawingPhaseOnRoom(room: ServerRoom, chosenWord: string): void {
  const now = Date.now();
  room.phase = 'DRAWING';
  room.secretWord = chosenWord;
  if (!room.usedWords.includes(chosenWord.toLowerCase())) {
    room.usedWords.push(chosenWord.toLowerCase());
  }
  room.wordOptions = [];
  room.revealedIndices = [];
  room.triggeredHints = [];
  room.totalTime = room.settings.drawTime;
  room.phaseEndsAt = now + room.settings.drawTime * 1000;
  room.hintTriggers = computeHintTriggers(room.settings.drawTime, room.settings.hintCount, chosenWord);

  const drawer = room.players.find((p) => p.id === room.drawerId);
  pushSystemMessage(room, `${drawer?.name ?? 'Artist'} started drawing! Start guessing.`);
}

export function endRoundOnRoom(room: ServerRoom, reason: RoundSummary['reason']): void {
  if (room.phase !== 'DRAWING') return;
  const now = Date.now();
  const word = room.secretWord ?? '';
  const drawer = room.players.find((p) => p.id === room.drawerId);

  if (reason === 'all_guessed' && drawer) {
    drawer.roundScore += 40;
    drawer.score += 40;
  }

  const results: RoundPlayerResult[] = room.players
    .filter((p) => p.connected)
    .map((p) => ({
      playerId: p.id,
      playerName: p.name,
      pointsEarned: p.roundScore,
      totalScore: p.score,
      guessedInSeconds: room.guessTimes[p.id] ?? null,
    }))
    .sort((a, b) => b.pointsEarned - a.pointsEarned);

  room.phase = 'ROUND_END';
  room.totalTime = ROUND_END_SECONDS;
  room.phaseEndsAt = now + ROUND_END_SECONDS * 1000;
  room.roundSummary = {
    word,
    drawerName: drawer?.name ?? 'Artist',
    reason,
    results,
  };

  const reasonLabel =
    reason === 'all_guessed'
      ? 'Everyone guessed the word!'
      : reason === 'drawer_left'
        ? 'Drawer disconnected.'
        : "Time's up!";
  pushSystemMessage(room, `${reasonLabel} The word was "${word}".`);
}

export function finishGameOnRoom(room: ServerRoom): void {
  room.phase = 'GAME_OVER';
  room.drawerId = null;
  room.secretWord = null;
  room.phaseEndsAt = 0;
  room.totalTime = 0;
  for (const p of room.players) {
    p.isDrawing = false;
    p.hasGuessed = false;
  }
  pushSystemMessage(room, 'Match finished! Check out the final podium.');
}

export interface ClockAdvanceResult {
  changed: boolean;
  revealedHint: boolean;
  phaseChanged: boolean;
}

export function advanceRoomClock(room: ServerRoom, now = Date.now()): ClockAdvanceResult {
  let changed = false;
  let revealedHint = false;
  let phaseChanged = false;

  // Prune stale HTTP-only players who haven't polled in > 22s
  const staleIds = room.players
    .filter((p) => p.isHttp && now - p.lastSeen > 22000)
    .map((p) => p.id);
  for (const staleId of staleIds) {
    removePlayerFromRoom(room, staleId);
    changed = true;
    phaseChanged = true;
  }

  if (room.phase === 'CHOOSING_WORD' && now >= room.phaseEndsAt) {
    const autoChoice = room.wordOptions[0]?.word ?? 'cricket bat';
    startDrawingPhaseOnRoom(room, autoChoice);
    return { changed: true, revealedHint: false, phaseChanged: true };
  }

  if (room.phase === 'DRAWING' && room.secretWord) {
    const timeLeft = computeTimeLeft(room, now);
    for (const triggerAtLeft of room.hintTriggers) {
      if (timeLeft <= triggerAtLeft && !room.triggeredHints.includes(triggerAtLeft)) {
        room.triggeredHints.push(triggerAtLeft);
        const revealable = getRevealableIndices(room.secretWord);
        const unrevealed = revealable.filter((idx) => !room.revealedIndices.includes(idx));
        if (unrevealed.length > 1) {
          const picked = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          room.revealedIndices.push(picked);
          pushSystemMessage(room, 'Letter hint revealed!', 'hint');
          revealedHint = true;
          changed = true;
        }
      }
    }

    if (now >= room.phaseEndsAt) {
      endRoundOnRoom(room, 'time_up');
      return { changed: true, revealedHint, phaseChanged: true };
    }
  }

  if (room.phase === 'ROUND_END' && now >= room.phaseEndsAt) {
    room.drawerQueueIdx += 1;
    beginWordChoiceOnRoom(room);
    return { changed: true, revealedHint: false, phaseChanged: true };
  }

  return { changed, revealedHint, phaseChanged };
}

export function removePlayerFromRoom(
  room: ServerRoom,
  playerId: string
): { removed: ServerPlayer | null; empty: boolean; phaseChanged: boolean } {
  const player = room.players.find((p) => p.id === playerId) ?? null;
  if (!player) {
    return { removed: null, empty: room.players.length === 0, phaseChanged: false };
  }

  const wasHost = player.isHost;
  const wasDrawer = room.drawerId === playerId;
  room.players = room.players.filter((p) => p.id !== playerId);
  delete room.privateMessages[playerId];
  delete room.voiceSignals[playerId];

  const connectedRemaining = room.players.filter((p) => p.connected);
  if (connectedRemaining.length === 0) {
    return { removed: player, empty: true, phaseChanged: false };
  }

  if (wasHost) {
    connectedRemaining[0].isHost = true;
    pushSystemMessage(room, `${connectedRemaining[0].name} is now the room host.`);
  }
  pushSystemMessage(room, `${player.name} left the room.`);

  let phaseChanged = false;
  if (room.phase === 'DRAWING' && wasDrawer) {
    endRoundOnRoom(room, 'drawer_left');
    phaseChanged = true;
  } else if (room.phase === 'CHOOSING_WORD' && wasDrawer) {
    room.drawerQueueIdx += 1;
    beginWordChoiceOnRoom(room);
    phaseChanged = true;
  } else if (room.phase === 'DRAWING') {
    const nonDrawers = connectedRemaining.filter((p) => p.id !== room.drawerId);
    if (nonDrawers.length > 0 && nonDrawers.every((p) => p.hasGuessed)) {
      endRoundOnRoom(room, 'all_guessed');
      phaseChanged = true;
    }
  }

  return { removed: player, empty: false, phaseChanged };
}

export function buildStateForPlayer(room: ServerRoom, playerId: string, now = Date.now()): RoomStateSync {
  const player = room.players.find((p) => p.id === playerId);
  const isDrawer = room.drawerId === playerId;
  const canSeeWord =
    isDrawer ||
    Boolean(player?.hasGuessed) ||
    room.phase === 'ROUND_END' ||
    room.phase === 'GAME_OVER';

  const hintPattern = room.secretWord
    ? canSeeWord
      ? room.secretWord.toUpperCase()
      : buildHintPattern(room.secretWord, room.revealedIndices)
    : '';

  const drawer = room.players.find((p) => p.id === room.drawerId);
  const publicPlayers: Player[] = room.players.map(
    ({ lastSeen: _ls, isHttp: _ih, ...rest }) => rest
  );

  return {
    code: room.code,
    settings: room.settings,
    phase: room.phase,
    players: publicPlayers,
    currentRound: room.currentRound,
    totalRounds: room.settings.rounds,
    drawerId: room.drawerId,
    drawerName: drawer?.name ?? null,
    timeLeft: computeTimeLeft(room, now),
    totalTime: room.totalTime,
    hintPattern,
    revealedIndices: room.revealedIndices,
    nextHintIn: getNextHintIn(room, now),
    wordOptions: isDrawer && room.phase === 'CHOOSING_WORD' ? room.wordOptions : null,
    secretWord: canSeeWord ? room.secretWord : null,
    strokes: room.strokes,
    messages: room.messages.slice(-80),
    roundSummary: room.roundSummary,
    canUndo: room.strokes.length > 0,
    canRedo: room.redoStack.length > 0,
  };
}

export async function getPublicRoomsList(): Promise<PublicRoomSummary[]> {
  const cfg = getRedisConfig();
  if (cfg) {
    const codes = await redisCommand<string[]>(['SMEMBERS', 'dg:public_rooms']);
    if (Array.isArray(codes)) {
      for (const code of codes) {
        await getRoom(code);
      }
    }
  }

  const now = Date.now();
  const list: PublicRoomSummary[] = [];
  for (const room of g.__dgRooms!.values()) {
    if (!room.settings.isPublic) continue;
    const connected = room.players.filter(
      (p) => p.connected && (!p.isHttp || now - p.lastSeen <= 22000)
    );
    if (connected.length === 0) continue;
    const host = connected.find((p) => p.isHost) ?? connected[0];
    list.push({
      code: room.code,
      hostName: host?.name ?? 'Host',
      playerCount: connected.length,
      maxPlayers: room.settings.maxPlayers,
      phase: room.phase,
      currentRound: room.currentRound,
      totalRounds: room.settings.rounds,
    });
  }
  return list.sort((a, b) => b.playerCount - a.playerCount);
}

export function createRoomObject(
  playerId: string,
  name: string,
  avatar?: AvatarConfig,
  settingsPartial?: Partial<RoomSettings>,
  isHttp = false
): ServerRoom {
  const code = generateRoomCode();
  const settings = sanitizeSettings(settingsPartial);
  const now = Date.now();

  const player: ServerPlayer = {
    id: playerId,
    name: sanitizeName(name),
    avatar: avatar ?? defaultAvatar(),
    score: 0,
    roundScore: 0,
    hasGuessed: false,
    guessOrder: null,
    isDrawing: false,
    isHost: true,
    connected: true,
    voiceJoined: false,
    voiceMuted: false,
    isSpeaking: false,
    lastSeen: now,
    isHttp,
  };

  return {
    code,
    settings,
    phase: 'LOBBY',
    players: [player],
    currentRound: 0,
    drawerOrder: [],
    drawerQueueIdx: 0,
    drawerId: null,
    secretWord: null,
    wordOptions: [],
    usedWords: [],
    phaseEndsAt: 0,
    totalTime: 0,
    revealedIndices: [],
    hintTriggers: [],
    triggeredHints: [],
    strokes: [],
    redoStack: [],
    messages: [
      {
        id: makeId('msg'),
        text: `Room ${code} created! Share the code or invite link with friends.`,
        kind: 'system',
        timestamp: now,
      },
    ],
    privateMessages: {},
    voiceSignals: {},
    recentReactions: [],
    roundSummary: null,
    guessTimes: {},
    updatedAt: now,
  };
}

export function processGuessOrChat(
  room: ServerRoom,
  playerId: string,
  rawText: string
): {
  type: 'broadcast' | 'private_to_sender' | 'private_to_guessers' | 'correct';
  message?: ChatMessage;
  acceptedWord?: string;
  points?: number;
  allGuessed?: boolean;
} {
  const player = room.players.find((p) => p.id === playerId);
  const text = String(rawText ?? '').trim().slice(0, 140);
  if (!player || !text) {
    return { type: 'private_to_sender' };
  }

  if (room.phase !== 'DRAWING' || !room.secretWord) {
    const msg = pushMessageToRoom(room, {
      id: makeId('msg'),
      playerId: player.id,
      playerName: player.name,
      text,
      kind: 'chat',
      timestamp: Date.now(),
    });
    return { type: 'broadcast', message: msg };
  }

  if (player.id === room.drawerId) {
    if (isExactWordMatch(text, room.secretWord) || isCloseGuess(text, room.secretWord)) {
      return {
        type: 'private_to_sender',
        message: {
          id: makeId('msg'),
          text: "You can't type the secret word while drawing!",
          kind: 'system',
          timestamp: Date.now(),
        },
      };
    }
    const msg = pushMessageToRoom(room, {
      id: makeId('msg'),
      playerId: player.id,
      playerName: `${player.name} (Drawer)`,
      text,
      kind: 'chat',
      timestamp: Date.now(),
    });
    return { type: 'broadcast', message: msg };
  }

  if (player.hasGuessed) {
    if (isExactWordMatch(text, room.secretWord)) {
      return {
        type: 'private_to_sender',
        message: {
          id: makeId('msg'),
          text: 'You already found the word!',
          kind: 'system',
          timestamp: Date.now(),
        },
      };
    }
    const msg: ChatMessage = {
      id: makeId('msg'),
      playerId: player.id,
      playerName: `${player.name} ✓`,
      text,
      kind: 'chat',
      timestamp: Date.now(),
    };
    return { type: 'private_to_guessers', message: msg };
  }

  if (isExactWordMatch(text, room.secretWord)) {
    const now = Date.now();
    const timeLeft = computeTimeLeft(room, now);
    const guessedCount = room.players.filter((p) => p.hasGuessed).length;
    const guessOrder = guessedCount + 1;
    player.hasGuessed = true;
    player.guessOrder = guessOrder;

    const speedRatio = timeLeft / Math.max(1, room.totalTime);
    const orderBonus = Math.max(0, 60 - (guessOrder - 1) * 15);
    const points = Math.round(120 + speedRatio * 280 + orderBonus);

    player.roundScore += points;
    player.score += points;
    room.guessTimes[player.id] = Math.max(1, room.totalTime - timeLeft);

    const drawer = room.players.find((p) => p.id === room.drawerId);
    if (drawer) {
      drawer.roundScore += 60;
      drawer.score += 60;
    }

    const correctMsg = pushMessageToRoom(room, {
      id: makeId('msg'),
      playerId: player.id,
      playerName: player.name,
      text: `${player.name} guessed the word! (+${points} pts)`,
      kind: 'correct',
      timestamp: now,
    });

    const nonDrawers = room.players.filter((p) => p.connected && p.id !== room.drawerId);
    const allGuessed = nonDrawers.length > 0 && nonDrawers.every((p) => p.hasGuessed);
    const secret = room.secretWord;
    if (allGuessed) {
      endRoundOnRoom(room, 'all_guessed');
    }

    return {
      type: 'correct',
      message: correctMsg,
      acceptedWord: secret,
      points,
      allGuessed,
    };
  }

  if (isCloseGuess(text, room.secretWord)) {
    return {
      type: 'private_to_sender',
      message: {
        id: makeId('msg'),
        text: `"${text}" is very close!`,
        kind: 'close',
        timestamp: Date.now(),
      },
    };
  }

  const msg = pushMessageToRoom(room, {
    id: makeId('msg'),
    playerId: player.id,
    playerName: player.name,
    text,
    kind: 'chat',
    timestamp: Date.now(),
  });
  return { type: 'broadcast', message: msg };
}
