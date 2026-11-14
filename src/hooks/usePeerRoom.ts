'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataConnection, Peer } from 'peerjs';
import type {
  AvatarConfig,
  ChatMessage,
  DrawAction,
  Player,
  PublicRoomSummary,
  ReactionEvent,
  RoomSettings,
  RoomStateSync,
} from '../shared/types.ts';
import {
  advanceRoomClock,
  beginWordChoiceOnRoom,
  buildStateForPlayer,
  createRoomObject,
  endRoundOnRoom,
  finishGameOnRoom,
  makeId,
  processGuessOrChat,
  pushSystemMessage,
  removePlayerFromRoom,
  sanitizeSettings,
  startDrawingPhaseOnRoom,
} from '../server/gameEngine.ts';
import type { ServerPlayer, ServerRoom } from '../server/gameEngine.ts';

// ICE configuration with STUN and optional Metered TURN servers
const user = process.env.NEXT_PUBLIC_TURN_USER;
const pass = process.env.NEXT_PUBLIC_TURN_PASS;
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...(user && pass
      ? [
          'turn:global.relay.metered.ca:80',
          'turn:global.relay.metered.ca:443',
          'turns:global.relay.metered.ca:443?transport=tcp',
        ].map((urls) => ({ urls, username: user, credential: pass }))
      : []),
  ],
};

const ROOM_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function generate4LetterCode(): string {
  return Array.from(
    { length: 4 },
    () => ROOM_CODE_LETTERS[Math.floor(Math.random() * ROOM_CODE_LETTERS.length)]
  ).join('');
}

export type PeerMessageToHost =
  | { type: 'join'; name: string; avatar: AvatarConfig }
  | { type: 'draw:action'; action: DrawAction }
  | { type: 'draw:undo' }
  | { type: 'draw:redo' }
  | { type: 'draw:clear' }
  | { type: 'chat:guess'; text: string }
  | { type: 'canvas:reaction'; emoji: string }
  | { type: 'game:start'; settings?: Partial<RoomSettings> }
  | { type: 'room:updateSettings'; settings: Partial<RoomSettings> }
  | { type: 'word:select'; word: string }
  | { type: 'game:playAgain' }
  | { type: 'voice:state'; voiceJoined: boolean; voiceMuted: boolean; isSpeaking: boolean };

export type PeerMessageToGuest =
  | { type: 'room:state'; state: RoomStateSync }
  | { type: 'draw:action'; action: DrawAction }
  | { type: 'canvas:sync'; strokes: DrawAction[]; canUndo: boolean; canRedo: boolean }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'timer:tick'; timeLeft: number; nextHintIn: number | null }
  | { type: 'hint:revealed'; hintPattern: string; revealedIndices: number[]; nextHintIn: number | null }
  | { type: 'guess:accepted'; word: string; points: number; hintPattern: string }
  | { type: 'canvas:reaction'; event: ReactionEvent }
  | { type: 'players:updated'; players: Player[] }
  | { type: 'room:error'; error: string };

export interface UsePeerRoomOptions {
  onRoundStart?: (round: number, drawerName: string, isMeDrawing: boolean) => void;
  onHintRevealed?: () => void;
  onCorrectGuess?: (word: string, points: number) => void;
  onCloseGuess?: () => void;
  onGameOver?: () => void;
  onReactionPop?: (event: ReactionEvent) => void;
  onTick?: () => void;
}

export function usePeerRoom(options: UsePeerRoomOptions = {}) {
  const [roomState, setRoomState] = useState<RoomStateSync | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [peerInstance, setPeerInstance] = useState<Peer | null>(null);

  // References to keep callbacks current and handle teardown
  const peerRef = useRef<Peer | null>(null);
  const guestConnRef = useRef<DataConnection | null>(null);
  const hostConnsRef = useRef<Record<string, DataConnection>>({});
  const serverRoomRef = useRef<ServerRoom | null>(null);
  const gameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const prevHintCountRef = useRef<number>(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Safe send helper
  const sendToGuest = useCallback((guestId: string, msg: PeerMessageToGuest) => {
    try {
      const conn = hostConnsRef.current[guestId];
      if (conn && conn.open) {
        conn.send(msg);
      }
    } catch {
      // client connection closed
    }
  }, []);

  const broadcastToGuests = useCallback((msg: PeerMessageToGuest, excludeId?: string) => {
    Object.entries(hostConnsRef.current).forEach(([id, conn]) => {
      if (id !== excludeId && conn.open) {
        try {
          conn.send(msg);
        } catch {
          // ignore
        }
      }
    });
  }, []);

  // Host broadcasts full tailored state to everyone (and updates local state)
  const broadcastFullState = useCallback(() => {
    const room = serverRoomRef.current;
    const myId = peerRef.current?.id;
    if (!room || !myId) return;

    const now = Date.now();
    // Update local host state
    const hostState = buildStateForPlayer(room, myId, now);
    setRoomState(hostState);

    // Send state to each connected guest
    Object.keys(hostConnsRef.current).forEach((remoteId) => {
      const guestState = buildStateForPlayer(room, remoteId, now);
      sendToGuest(remoteId, { type: 'room:state', state: guestState });
    });
  }, [sendToGuest]);

  // Host clock tick
  const handleHostTick = useCallback(() => {
    const room = serverRoomRef.current;
    const myId = peerRef.current?.id;
    if (!room || !myId) return;

    const now = Date.now();
    const { changed, revealedHint, phaseChanged } = advanceRoomClock(room, now);

    if (phaseChanged || changed) {
      broadcastFullState();
      if (revealedHint) {
        optionsRef.current.onHintRevealed?.();
      }
      return;
    }

    if (room.phase === 'DRAWING' || room.phase === 'CHOOSING_WORD' || room.phase === 'ROUND_END') {
      const timeLeft = Math.max(0, Math.ceil((room.phaseEndsAt - now) / 1000));
      const nextHintIn =
        room.phase === 'DRAWING'
          ? room.hintTriggers.find((t) => t < timeLeft && !room.triggeredHints.includes(t)) ?? null
          : null;

      // Broadcast timer tick
      broadcastToGuests({ type: 'timer:tick', timeLeft, nextHintIn });
      setRoomState((prev) => (prev ? { ...prev, timeLeft, nextHintIn } : prev));
      if (room.phase === 'DRAWING' && timeLeft > 0 && timeLeft <= 10) {
        optionsRef.current.onTick?.();
      }
    }
  }, [broadcastFullState, broadcastToGuests]);

  // Host handles client action
  const handleHostAction = useCallback(
    (senderId: string, msg: PeerMessageToHost) => {
      const room = serverRoomRef.current;
      const myId = peerRef.current?.id;
      if (!room || !myId) return;

      const player = room.players.find((p) => p.id === senderId);

      switch (msg.type) {
        case 'join': {
          if (room.players.length >= room.settings.maxPlayers) {
            sendToGuest(senderId, { type: 'room:error', error: 'Room is full.' });
            return;
          }
          const existing = room.players.find((p) => p.id === senderId);
          if (!existing) {
            const newPlayer: ServerPlayer = {
              id: senderId,
              name: msg.name.trim().slice(0, 18) || `Player${Math.floor(100 + Math.random() * 899)}`,
              avatar: msg.avatar,
              score: 0,
              roundScore: 0,
              hasGuessed: false,
              guessOrder: null,
              isDrawing: false,
              isHost: false,
              connected: true,
              voiceJoined: false,
              voiceMuted: false,
              isSpeaking: false,
              lastSeen: Date.now(),
              isHttp: false,
            };
            room.players.push(newPlayer);
            pushSystemMessage(room, `${newPlayer.name} joined the room.`);
          } else {
            existing.connected = true;
          }
          broadcastFullState();
          break;
        }

        case 'draw:action': {
          const isDrawer =
            (room.phase === 'DRAWING' && room.drawerId === senderId) || room.phase === 'LOBBY';
          if (!isDrawer) return;

          if (msg.action.type === 'clear') {
            room.strokes = [];
            room.redoStack = [];
          } else {
            room.strokes.push(msg.action);
            if (room.strokes.length > 2000) {
              room.strokes = room.strokes.slice(-1500);
            }
            room.redoStack = [];
          }

          // Relay stroke to all other peers and update host state
          broadcastToGuests({ type: 'draw:action', action: msg.action }, senderId);
          setRoomState((prev) => {
            if (!prev) return prev;
            if (msg.action.type === 'clear') {
              return { ...prev, strokes: [], canUndo: false, canRedo: false };
            }
            return {
              ...prev,
              strokes: [...prev.strokes, msg.action],
              canUndo: true,
              canRedo: false,
            };
          });
          break;
        }

        case 'draw:undo': {
          const isDrawer =
            (room.phase === 'DRAWING' && room.drawerId === senderId) || room.phase === 'LOBBY';
          if (!isDrawer || room.strokes.length === 0) return;
          const undone = room.strokes.pop();
          if (undone) room.redoStack.push(undone);
          const canUndo = room.strokes.length > 0;
          const canRedo = room.redoStack.length > 0;
          broadcastToGuests({ type: 'canvas:sync', strokes: room.strokes, canUndo, canRedo });
          setRoomState((prev) => (prev ? { ...prev, strokes: room.strokes, canUndo, canRedo } : prev));
          break;
        }

        case 'draw:redo': {
          const isDrawer =
            (room.phase === 'DRAWING' && room.drawerId === senderId) || room.phase === 'LOBBY';
          if (!isDrawer || room.redoStack.length === 0) return;
          const redone = room.redoStack.pop();
          if (redone) room.strokes.push(redone);
          const canUndo = room.strokes.length > 0;
          const canRedo = room.redoStack.length > 0;
          broadcastToGuests({ type: 'canvas:sync', strokes: room.strokes, canUndo, canRedo });
          setRoomState((prev) => (prev ? { ...prev, strokes: room.strokes, canUndo, canRedo } : prev));
          break;
        }

        case 'draw:clear': {
          const isDrawer =
            (room.phase === 'DRAWING' && room.drawerId === senderId) || room.phase === 'LOBBY';
          if (!isDrawer) return;
          room.strokes = [];
          room.redoStack = [];
          broadcastToGuests({ type: 'canvas:sync', strokes: [], canUndo: false, canRedo: false });
          setRoomState((prev) => (prev ? { ...prev, strokes: [], canUndo: false, canRedo: false } : prev));
          break;
        }

        case 'chat:guess': {
          if (!player) return;
          const result = processGuessOrChat(room, senderId, msg.text);

          if (result.type === 'correct') {
            sendToGuest(senderId, {
              type: 'guess:accepted',
              word: result.acceptedWord ?? '',
              points: result.points ?? 0,
              hintPattern: room.secretWord?.toUpperCase() ?? '',
            });
            if (senderId === myId) {
              optionsRef.current.onCorrectGuess?.(result.acceptedWord ?? '', result.points ?? 0);
            }
            if (result.message) {
              broadcastToGuests({ type: 'chat:message', message: result.message });
            }
            if (result.allGuessed) {
              endRoundOnRoom(room, 'all_guessed');
            }
            broadcastFullState();
          } else if (result.type === 'private_to_sender' && result.message) {
            sendToGuest(senderId, { type: 'chat:message', message: result.message });
            if (senderId === myId) {
              if (result.message.kind === 'close') optionsRef.current.onCloseGuess?.();
              setRoomState((prev) =>
                prev ? { ...prev, messages: [...prev.messages.slice(-90), result.message!] } : prev
              );
            }
          } else if (result.message) {
            broadcastToGuests({ type: 'chat:message', message: result.message });
            setRoomState((prev) =>
              prev ? { ...prev, messages: [...prev.messages.slice(-90), result.message!] } : prev
            );
          }
          break;
        }

        case 'canvas:reaction': {
          if (!player) return;
          const event: ReactionEvent = {
            id: makeId('react'),
            emoji: msg.emoji,
            playerName: player.name,
            xRatio: 0.12 + Math.random() * 0.76,
          };
          broadcastToGuests({ type: 'canvas:reaction', event });
          setReactions((prev) => [...prev, event]);
          optionsRef.current.onReactionPop?.(event);
          setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.id !== event.id));
          }, 1900);
          break;
        }

        case 'game:start': {
          if (senderId !== myId) return;
          if (room.players.length < 2) {
            setStartError('Need at least 2 players to start a match.');
            return;
          }
          setStartError(null);
          room.currentRound = 1;
          room.drawerOrder = room.players.filter((p) => p.connected).map((p) => p.id);
          room.drawerQueueIdx = 0;
          beginWordChoiceOnRoom(room);
          broadcastFullState();
          break;
        }

        case 'word:select': {
          if (room.phase !== 'CHOOSING_WORD' || room.drawerId !== senderId) return;
          startDrawingPhaseOnRoom(room, msg.word);
          broadcastFullState();
          break;
        }

        case 'room:updateSettings': {
          if (senderId !== myId) return;
          room.settings = sanitizeSettings({ ...room.settings, ...msg.settings });
          broadcastFullState();
          break;
        }

        case 'game:playAgain': {
          if (senderId !== myId) return;
          room.phase = 'LOBBY';
          room.currentRound = 0;
          room.drawerId = null;
          room.secretWord = null;
          room.wordOptions = [];
          room.strokes = [];
          room.redoStack = [];
          room.roundSummary = null;
          room.players.forEach((p) => {
            p.score = 0;
            p.roundScore = 0;
            p.hasGuessed = false;
            p.isDrawing = false;
          });
          pushSystemMessage(room, 'Scores reset. Ready for another game!');
          broadcastFullState();
          break;
        }

        case 'voice:state': {
          if (!player) return;
          player.voiceJoined = msg.voiceJoined;
          player.voiceMuted = msg.voiceMuted;
          player.isSpeaking = msg.isSpeaking;
          broadcastToGuests({
            type: 'players:updated',
            players: room.players.map(({ lastSeen: _ls, isHttp: _ih, ...rest }) => rest),
          });
          setRoomState((prev) =>
            prev
              ? {
                  ...prev,
                  players: room.players.map(({ lastSeen: _ls, isHttp: _ih, ...rest }) => rest),
                }
              : prev
          );
          break;
        }
      }
    },
    [sendToGuest, broadcastToGuests, broadcastFullState]
  );

  // Host handles guest drop
  const handleHostGuestDrop = useCallback(
    (guestId: string) => {
      const room = serverRoomRef.current;
      delete hostConnsRef.current[guestId];
      if (!room) return;

      const { phaseChanged } = removePlayerFromRoom(room, guestId);
      if (phaseChanged) {
        broadcastFullState();
      } else {
        const publicPlayers = room.players.map(
          ({ lastSeen: _ls, isHttp: _ih, ...rest }) => rest
        );
        broadcastToGuests({ type: 'players:updated', players: publicPlayers });
        setRoomState((prev) => (prev ? { ...prev, players: publicPlayers } : prev));
      }
    },
    [broadcastFullState, broadcastToGuests]
  );

  // Guest handles message from host
  const handleGuestMessage = useCallback((msg: PeerMessageToGuest) => {
    switch (msg.type) {
      case 'room:state':
        setRoomState(msg.state);
        setConnecting(false);
        setErrorMsg(null);
        break;

      case 'draw:action':
        setRoomState((prev) => {
          if (!prev) return prev;
          if (msg.action.type === 'clear') {
            return { ...prev, strokes: [], canUndo: false, canRedo: false };
          }
          if (prev.strokes.some((s) => s.id === msg.action.id)) return prev;
          return { ...prev, strokes: [...prev.strokes, msg.action] };
        });
        break;

      case 'canvas:sync':
        setRoomState((prev) =>
          prev
            ? {
                ...prev,
                strokes: msg.strokes,
                canUndo: msg.canUndo,
                canRedo: msg.canRedo,
              }
            : prev
        );
        break;

      case 'chat:message':
        if (msg.message.kind === 'close') {
          optionsRef.current.onCloseGuess?.();
        } else if (msg.message.kind === 'correct') {
          // another player guessed
        }
        setRoomState((prev) => {
          if (!prev) return prev;
          if (prev.messages.some((m) => m.id === msg.message.id)) return prev;
          return { ...prev, messages: [...prev.messages.slice(-90), msg.message] };
        });
        break;

      case 'timer:tick':
        setRoomState((prev) => {
          if (!prev) return prev;
          if (prev.phase === 'DRAWING' && msg.timeLeft > 0 && msg.timeLeft <= 10) {
            optionsRef.current.onTick?.();
          }
          return { ...prev, timeLeft: msg.timeLeft, nextHintIn: msg.nextHintIn };
        });
        break;

      case 'hint:revealed':
        optionsRef.current.onHintRevealed?.();
        setRoomState((prev) =>
          prev
            ? {
                ...prev,
                hintPattern: msg.hintPattern,
                revealedIndices: msg.revealedIndices,
                nextHintIn: msg.nextHintIn,
              }
            : prev
        );
        break;

      case 'guess:accepted':
        optionsRef.current.onCorrectGuess?.(msg.word, msg.points);
        setRoomState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            secretWord: msg.word,
            hintPattern: msg.hintPattern,
            players: prev.players.map((p) =>
              p.id === peerRef.current?.id ? { ...p, hasGuessed: true } : p
            ),
          };
        });
        break;

      case 'canvas:reaction':
        setReactions((prev) => [...prev, msg.event]);
        optionsRef.current.onReactionPop?.(msg.event);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== msg.event.id));
        }, 1900);
        break;

      case 'players:updated':
        setRoomState((prev) => (prev ? { ...prev, players: msg.players } : prev));
        break;

      case 'room:error':
        setErrorMsg(msg.error);
        setConnecting(false);
        break;
    }
  }, []);

  // Announce public room on BroadcastChannel & optional server endpoint
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const bc = new BroadcastChannel('dg_public_rooms');
      broadcastChannelRef.current = bc;
      bc.onmessage = (event) => {
        const data = event.data as { type: string; room?: PublicRoomSummary };
        if (data.type === 'announce' && data.room) {
          setPublicRooms((prev) => {
            const next = prev.filter((r) => r.code !== data.room!.code);
            return [...next, data.room!];
          });
        }
      };
    } catch {
      // BroadcastChannel not available in environment
    }

    // Also fetch any announced public rooms from API if online
    const fetchApiRooms = async () => {
      try {
        const res = await fetch('/api/rooms', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
          if (Array.isArray(data.rooms)) {
            setPublicRooms(data.rooms);
          }
        }
      } catch {
        // ignore
      }
    };
    fetchApiRooms();
    const pollInterval = setInterval(fetchApiRooms, 5000);

    return () => {
      clearInterval(pollInterval);
      broadcastChannelRef.current?.close();
    };
  }, []);

  // Heartbeat to announce public room if host
  useEffect(() => {
    if (!isHost || !roomState || !roomState.settings.isPublic) return;

    const announce = () => {
      const me = roomState.players.find((p) => p.id === playerId);
      const summary: PublicRoomSummary = {
        code: roomState.code,
        hostName: me?.name ?? 'Host',
        playerCount: roomState.players.length,
        maxPlayers: roomState.settings.maxPlayers,
        phase: roomState.phase,
        currentRound: roomState.currentRound,
        totalRounds: roomState.totalRounds,
      };

      try {
        broadcastChannelRef.current?.postMessage({ type: 'announce', room: summary });
      } catch {
        // ignore
      }

      fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'announce', room: summary }),
      }).catch(() => {});
    };

    announce();
    const timer = setInterval(announce, 4000);
    return () => clearInterval(timer);
  }, [isHost, roomState, playerId]);

  // Track room phase changes for audio & banners
  useEffect(() => {
    if (!roomState) return;
    const currentPhase = roomState.phase;
    const prevPhase = prevPhaseRef.current;
    if (prevPhase !== currentPhase) {
      if (currentPhase === 'DRAWING') {
        const isMeDrawing = roomState.drawerId === playerId;
        optionsRef.current.onRoundStart?.(
          roomState.currentRound,
          roomState.drawerName ?? 'Artist',
          isMeDrawing
        );
        prevHintCountRef.current = roomState.revealedIndices.length;
      } else if (currentPhase === 'GAME_OVER') {
        optionsRef.current.onGameOver?.();
      }
      prevPhaseRef.current = currentPhase;
    } else if (
      currentPhase === 'DRAWING' &&
      roomState.revealedIndices.length > prevHintCountRef.current
    ) {
      optionsRef.current.onHintRevealed?.();
      prevHintCountRef.current = roomState.revealedIndices.length;
    }
  }, [roomState, playerId]);

  // Host: Create Room
  const createRoom = useCallback(
    async (name: string, avatar: AvatarConfig, settingsPartial?: Partial<RoomSettings>, tries = 0) => {
      if (!name.trim()) {
        setErrorMsg('Please enter a nickname.');
        return;
      }

      setConnecting(true);
      setErrorMsg(null);
      setStartError(null);

      try {
        const { Peer } = await import('peerjs');
        const code = generate4LetterCode();
        const peerId = 'doodle-' + code;

        const peer = new Peer(peerId, { config: ICE_CONFIG });
        peerRef.current = peer;
        setPeerInstance(peer);

        peer.on('error', (err) => {
          if (err.type === 'unavailable-id' && tries < 5) {
            peer.destroy();
            void createRoom(name, avatar, settingsPartial, tries + 1);
            return;
          }
          setConnecting(false);
          setErrorMsg(`Host connection error: ${err.type}`);
        });

        peer.on('open', (id) => {
          setIsHost(true);
          setPlayerId(id);

          const serverRoom = createRoomObject(id, name, avatar, settingsPartial);
          serverRoom.code = code;
          serverRoomRef.current = serverRoom;

          // Listen for incoming guests
          peer.on('connection', (conn) => {
            conn.on('open', () => {
              hostConnsRef.current[conn.peer] = conn;
            });
            conn.on('data', (data) => {
              handleHostAction(conn.peer, data as PeerMessageToHost);
            });
            conn.on('close', () => {
              handleHostGuestDrop(conn.peer);
            });
            conn.on('error', () => {
              handleHostGuestDrop(conn.peer);
            });
          });

          // Start 1-second host game clock
          if (gameTimerRef.current) clearInterval(gameTimerRef.current);
          gameTimerRef.current = setInterval(handleHostTick, 1000);

          // Update local state
          const initialHostState = buildStateForPlayer(serverRoom, id);
          setRoomState(initialHostState);
          setConnecting(false);

          // Sync URL with room code
          const url = new URL(window.location.href);
          url.searchParams.set('room', code);
          window.history.replaceState({}, '', url.toString());
        });
      } catch (err) {
        setConnecting(false);
        setErrorMsg('Failed to initialize PeerJS host.');
      }
    },
    [handleHostAction, handleHostGuestDrop, handleHostTick]
  );

  // Guest: Join Room
  const joinRoom = useCallback(
    async (code: string, name: string, avatar: AvatarConfig) => {
      const cleanCode = code.trim().toUpperCase();
      if (!name.trim()) {
        setErrorMsg('Please enter a nickname.');
        return;
      }
      if (!cleanCode) {
        setErrorMsg('Please enter a room code.');
        return;
      }

      setConnecting(true);
      setErrorMsg(null);
      setStartError(null);

      try {
        const { Peer } = await import('peerjs');
        const peer = new Peer({ config: ICE_CONFIG });
        peerRef.current = peer;
        setPeerInstance(peer);

        peer.on('error', (err) => {
          setConnecting(false);
          if (err.type === 'peer-unavailable') {
            setErrorMsg(`Room "${cleanCode}" not found or host is offline.`);
          } else {
            setErrorMsg(`Connection error: ${err.type}`);
          }
        });

        peer.on('open', (id) => {
          setIsHost(false);
          setPlayerId(id);

          const targetPeerId = 'doodle-' + cleanCode;
          const conn = peer.connect(targetPeerId, { reliable: true });
          guestConnRef.current = conn;

          const timeoutId = setTimeout(() => {
            if (!conn.open && !roomState) {
              setConnecting(false);
              setErrorMsg('Connection to host timed out. Please check the room code.');
              conn.close();
            }
          }, 8000);

          conn.on('open', () => {
            clearTimeout(timeoutId);
            conn.send({
              type: 'join',
              name: name.trim(),
              avatar,
            } satisfies PeerMessageToHost);

            // Sync URL with room code
            const url = new URL(window.location.href);
            url.searchParams.set('room', cleanCode);
            window.history.replaceState({}, '', url.toString());
          });

          conn.on('data', (data) => {
            handleGuestMessage(data as PeerMessageToGuest);
          });

          conn.on('close', () => {
            clearTimeout(timeoutId);
            setConnecting(false);
            setErrorMsg('Host closed the room or disconnected.');
            setRoomState(null);
            prevPhaseRef.current = null;
          });

          conn.on('error', () => {
            clearTimeout(timeoutId);
            setConnecting(false);
            setErrorMsg('Connection error with host.');
          });
        });
      } catch {
        setConnecting(false);
        setErrorMsg('Failed to initialize PeerJS guest.');
      }
    },
    [handleGuestMessage, roomState]
  );

  // Leave room & teardown
  const leaveRoom = useCallback(() => {
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }

    if (guestConnRef.current) {
      guestConnRef.current.close();
      guestConnRef.current = null;
    }

    Object.values(hostConnsRef.current).forEach((conn) => {
      try {
        conn.close();
      } catch {
        // ignore
      }
    });
    hostConnsRef.current = {};

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    serverRoomRef.current = null;
    setPeerInstance(null);
    setRoomState(null);
    setIsHost(false);
    setPlayerId(null);
    setConnecting(false);
    setErrorMsg(null);
    setStartError(null);
    prevPhaseRef.current = null;
    prevHintCountRef.current = 0;

    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // UI action dispatchers
  const emitDrawAction = useCallback(
    (action: DrawAction) => {
      if (isHost) {
        handleHostAction(playerId ?? '', { type: 'draw:action', action });
      } else {
        guestConnRef.current?.send({ type: 'draw:action', action } satisfies PeerMessageToHost);
        // Optimistic local update
        setRoomState((prev) => {
          if (!prev) return prev;
          if (action.type === 'clear') {
            return { ...prev, strokes: [], canUndo: false, canRedo: false };
          }
          return {
            ...prev,
            strokes: [...prev.strokes, action],
            canUndo: true,
            canRedo: false,
          };
        });
      }
    },
    [isHost, playerId, handleHostAction]
  );

  const undo = useCallback(() => {
    if (isHost) {
      handleHostAction(playerId ?? '', { type: 'draw:undo' });
    } else {
      guestConnRef.current?.send({ type: 'draw:undo' } satisfies PeerMessageToHost);
    }
  }, [isHost, playerId, handleHostAction]);

  const redo = useCallback(() => {
    if (isHost) {
      handleHostAction(playerId ?? '', { type: 'draw:redo' });
    } else {
      guestConnRef.current?.send({ type: 'draw:redo' } satisfies PeerMessageToHost);
    }
  }, [isHost, playerId, handleHostAction]);

  const clearCanvas = useCallback(() => {
    if (isHost) {
      handleHostAction(playerId ?? '', { type: 'draw:clear' });
    } else {
      guestConnRef.current?.send({ type: 'draw:clear' } satisfies PeerMessageToHost);
    }
  }, [isHost, playerId, handleHostAction]);

  const sendGuess = useCallback(
    (text: string) => {
      if (isHost) {
        handleHostAction(playerId ?? '', { type: 'chat:guess', text });
      } else {
        guestConnRef.current?.send({ type: 'chat:guess', text } satisfies PeerMessageToHost);
      }
    },
    [isHost, playerId, handleHostAction]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      if (isHost) {
        handleHostAction(playerId ?? '', { type: 'canvas:reaction', emoji });
      } else {
        guestConnRef.current?.send({ type: 'canvas:reaction', emoji } satisfies PeerMessageToHost);
      }
    },
    [isHost, playerId, handleHostAction]
  );

  const updateSettings = useCallback(
    (settings: Partial<RoomSettings>) => {
      if (isHost) {
        handleHostAction(playerId ?? '', { type: 'room:updateSettings', settings });
      } else {
        guestConnRef.current?.send({ type: 'room:updateSettings', settings } satisfies PeerMessageToHost);
      }
    },
    [isHost, playerId, handleHostAction]
  );

  const startGame = useCallback(() => {
    if (isHost) {
      handleHostAction(playerId ?? '', { type: 'game:start' });
    }
  }, [isHost, playerId, handleHostAction]);

  const selectWord = useCallback(
    (word: string) => {
      if (isHost) {
        handleHostAction(playerId ?? '', { type: 'word:select', word });
      } else {
        guestConnRef.current?.send({ type: 'word:select', word } satisfies PeerMessageToHost);
      }
    },
    [isHost, playerId, handleHostAction]
  );

  const playAgain = useCallback(() => {
    if (isHost) {
      handleHostAction(playerId ?? '', { type: 'game:playAgain' });
    } else {
      guestConnRef.current?.send({ type: 'game:playAgain' } satisfies PeerMessageToHost);
    }
  }, [isHost, playerId, handleHostAction]);

  const syncVoiceStateToPeers = useCallback(
    (voiceJoined: boolean, voiceMuted: boolean, isSpeaking: boolean) => {
      if (isHost) {
        handleHostAction(playerId ?? '', {
          type: 'voice:state',
          voiceJoined,
          voiceMuted,
          isSpeaking,
        });
      } else {
        guestConnRef.current?.send({
          type: 'voice:state',
          voiceJoined,
          voiceMuted,
          isSpeaking,
        } satisfies PeerMessageToHost);
      }
    },
    [isHost, playerId, handleHostAction]
  );

  // Teardown on unmount
  useEffect(() => {
    return () => {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      peerRef.current?.destroy();
    };
  }, []);

  return {
    roomState,
    playerId,
    peerInstance,
    isHost,
    connecting,
    errorMsg,
    startError,
    reactions,
    publicRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    emitDrawAction,
    undo,
    redo,
    clearCanvas,
    sendGuess,
    sendReaction,
    updateSettings,
    startGame,
    selectWord,
    playAgain,
    syncVoiceStateToPeers,
  };
}
