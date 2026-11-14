export type AvatarColor =
  | '#2563EB'
  | '#DC2626'
  | '#059669'
  | '#D97706'
  | '#7C3AED'
  | '#DB2777'
  | '#0891B2'
  | '#3F3F46';

export type AvatarFace = 'happy' | 'wink' | 'focused' | 'cool' | 'surprised' | 'cheery';

export type AvatarAccessory = 'none' | 'beret' | 'crown' | 'cap' | 'glasses' | 'headphones';

export interface AvatarConfig {
  color: AvatarColor;
  face: AvatarFace;
  accessory: AvatarAccessory;
}

export interface Player {
  id: string;
  name: string;
  avatar: AvatarConfig;
  score: number;
  roundScore: number;
  hasGuessed: boolean;
  guessOrder: number | null;
  isDrawing: boolean;
  isHost: boolean;
  connected: boolean;
  voiceJoined: boolean;
  voiceMuted: boolean;
  isSpeaking: boolean;
}

export type WordMode = 'standard' | 'custom' | 'mixed';

export interface RoomSettings {
  rounds: number;
  drawTime: number;
  maxPlayers: number;
  hintCount: number;
  wordMode: WordMode;
  customWords: string[];
  isPublic: boolean;
}

export type GamePhase = 'LOBBY' | 'CHOOSING_WORD' | 'DRAWING' | 'ROUND_END' | 'GAME_OVER';

export type DrawTool = 'pen' | 'highlighter' | 'spray' | 'eraser' | 'fill' | 'line' | 'rect' | 'circle';

export interface Point {
  x: number;
  y: number;
}

export type DrawAction =
  | {
      id: string;
      type: 'stroke';
      tool: 'pen' | 'highlighter' | 'eraser';
      color: string;
      size: number;
      points: Point[];
    }
  | {
      id: string;
      type: 'spray';
      color: string;
      size: number;
      dots: Point[];
    }
  | {
      id: string;
      type: 'shape';
      shape: 'line' | 'rect' | 'circle';
      color: string;
      size: number;
      filled?: boolean;
      start: Point;
      end: Point;
    }
  | {
      id: string;
      type: 'fill';
      color: string;
      x: number;
      y: number;
    }
  | {
      id: string;
      type: 'clear';
    };

export type ChatMessageKind = 'chat' | 'correct' | 'close' | 'system' | 'hint';

export interface ChatMessage {
  id: string;
  playerId?: string;
  playerName?: string;
  text: string;
  kind: ChatMessageKind;
  timestamp: number;
}

export interface ReactionEvent {
  id: string;
  emoji: string;
  playerName: string;
  xRatio: number;
}

export interface RoundPlayerResult {
  playerId: string;
  playerName: string;
  pointsEarned: number;
  totalScore: number;
  guessedInSeconds: number | null;
}

export interface RoundSummary {
  word: string;
  drawerName: string;
  reason: 'all_guessed' | 'time_up' | 'drawer_left';
  results: RoundPlayerResult[];
}

export interface WordOption {
  word: string;
  category: string;
}

export interface PublicRoomSummary {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
  currentRound: number;
  totalRounds: number;
}

export interface RoomStateSync {
  code: string;
  settings: RoomSettings;
  phase: GamePhase;
  players: Player[];
  currentRound: number;
  totalRounds: number;
  drawerId: string | null;
  drawerName: string | null;
  timeLeft: number;
  totalTime: number;
  hintPattern: string;
  revealedIndices: number[];
  nextHintIn: number | null;
  wordOptions: WordOption[] | null;
  secretWord: string | null;
  strokes: DrawAction[];
  messages: ChatMessage[];
  roundSummary: RoundSummary | null;
  canUndo: boolean;
  canRedo: boolean;
}
