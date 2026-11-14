'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Circle,
  Download,
  Eraser,
  Grid,
  Highlighter,
  Minus,
  PaintBucket,
  Pen,
  Redo2,
  SprayCan,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { DrawAction, DrawTool, Point, ReactionEvent } from '../shared/types.ts';

export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 600;

const PALETTE_COLORS = [
  '#18181B',
  '#52525B',
  '#A1A1AA',
  '#FFFFFF',
  '#DC2626',
  '#EA580C',
  '#F59E0B',
  '#EAB308',
  '#84CC16',
  '#16A34A',
  '#059669',
  '#0D9488',
  '#06B6D4',
  '#0284C7',
  '#2563EB',
  '#4F46E5',
  '#7C3AED',
  '#A855F7',
  '#DB2777',
  '#F43F5E',
  '#78350F',
  '#A16207',
  '#FDE68A',
  '#FBCFE8',
];

const BRUSH_SIZES = [3, 7, 13, 22, 34];

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [24, 24, 27, 255];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
}

function floodFillCanvas(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillHex: string) {
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || y0 < 0 || x0 >= CANVAS_WIDTH || y0 >= CANVAS_HEIGHT) return;

  const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const data = imgData.data;
  const [fr, fg, fb, fa] = hexToRgba(fillHex);

  const startIdx = (y0 * CANVAS_WIDTH + x0) * 4;
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  if (Math.abs(sr - fr) < 4 && Math.abs(sg - fg) < 4 && Math.abs(sb - fb) < 4 && Math.abs(sa - fa) < 4) {
    return;
  }

  const tolerance = 32;
  const matchesTarget = (idx: number) =>
    Math.abs(data[idx] - sr) <= tolerance &&
    Math.abs(data[idx + 1] - sg) <= tolerance &&
    Math.abs(data[idx + 2] - sb) <= tolerance &&
    Math.abs(data[idx + 3] - sa) <= tolerance;

  const visited = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const stack = new Int32Array(CANVAS_WIDTH * CANVAS_HEIGHT * 2);
  let sp = 0;
  stack[sp++] = x0;
  stack[sp++] = y0;

  while (sp > 0) {
    const cy = stack[--sp];
    const cx = stack[--sp];
    if (cx < 0 || cy < 0 || cx >= CANVAS_WIDTH || cy >= CANVAS_HEIGHT) continue;

    const pos = cy * CANVAS_WIDTH + cx;
    if (visited[pos]) continue;

    const idx = pos * 4;
    if (!matchesTarget(idx)) continue;

    let lx = cx;
    while (lx > 0) {
      const lPos = cy * CANVAS_WIDTH + (lx - 1);
      if (visited[lPos] || !matchesTarget(lPos * 4)) break;
      lx--;
    }

    let rx = cx;
    while (rx < CANVAS_WIDTH - 1) {
      const rPos = cy * CANVAS_WIDTH + (rx + 1);
      if (visited[rPos] || !matchesTarget(rPos * 4)) break;
      rx++;
    }

    let spanAbove = false;
    let spanBelow = false;

    for (let x = lx; x <= rx; x++) {
      const p = cy * CANVAS_WIDTH + x;
      visited[p] = 1;
      const pIdx = p * 4;
      data[pIdx] = fr;
      data[pIdx + 1] = fg;
      data[pIdx + 2] = fb;
      data[pIdx + 3] = fa;

      if (cy > 0) {
        const upPos = (cy - 1) * CANVAS_WIDTH + x;
        const upOk = !visited[upPos] && matchesTarget(upPos * 4);
        if (!spanAbove && upOk) {
          stack[sp++] = x;
          stack[sp++] = cy - 1;
          spanAbove = true;
        } else if (spanAbove && !upOk) {
          spanAbove = false;
        }
      }

      if (cy < CANVAS_HEIGHT - 1) {
        const downPos = (cy + 1) * CANVAS_WIDTH + x;
        const downOk = !visited[downPos] && matchesTarget(downPos * 4);
        if (!spanBelow && downOk) {
          stack[sp++] = x;
          stack[sp++] = cy + 1;
          spanBelow = true;
        } else if (spanBelow && !downOk) {
          spanBelow = false;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

export function renderActionToContext(ctx: CanvasRenderingContext2D, action: DrawAction) {
  if (action.type === 'clear') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return;
  }

  if (action.type === 'fill') {
    floodFillCanvas(ctx, action.x, action.y, action.color);
    return;
  }

  if (action.type === 'spray') {
    ctx.save();
    ctx.fillStyle = action.color;
    const dotRadius = Math.max(0.9, action.size * 0.08);
    for (const d of action.dots) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (action.type === 'stroke') {
    if (action.points.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = action.size;
    ctx.strokeStyle = action.tool === 'eraser' ? '#FFFFFF' : action.color;
    ctx.globalAlpha = action.tool === 'highlighter' ? 0.35 : 1;

    ctx.beginPath();
    const pts = action.points;
    if (pts.length === 1) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.arc(pts[0].x, pts[0].y, action.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (action.type === 'shape') {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = action.size;
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
    ctx.beginPath();
    if (action.shape === 'line') {
      ctx.moveTo(action.start.x, action.start.y);
      ctx.lineTo(action.end.x, action.end.y);
      ctx.stroke();
    } else if (action.shape === 'rect') {
      ctx.rect(
        action.start.x,
        action.start.y,
        action.end.x - action.start.x,
        action.end.y - action.start.y
      );
      if (action.filled) ctx.fill();
      else ctx.stroke();
    } else if (action.shape === 'circle') {
      const rx = Math.abs(action.end.x - action.start.x) / 2;
      const ry = Math.abs(action.end.y - action.start.y) / 2;
      const cx = (action.start.x + action.end.x) / 2;
      const cy = (action.start.y + action.end.y) / 2;
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      if (action.filled) ctx.fill();
      else ctx.stroke();
    }
    ctx.restore();
  }
}

function generateSprayDots(center: Point, brushSize: number): Point[] {
  const radius = Math.max(8, brushSize * 1.15);
  const count = Math.min(28, Math.max(10, Math.round(brushSize * 0.9)));
  const dots: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius;
    dots.push({
      x: Math.max(0, Math.min(CANVAS_WIDTH, center.x + Math.cos(angle) * dist)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, center.y + Math.sin(angle) * dist)),
    });
  }
  return dots;
}

interface DrawingCanvasProps {
  strokes: DrawAction[];
  canDraw: boolean;
  canUndo: boolean;
  canRedo: boolean;
  reactions: ReactionEvent[];
  isWarmup?: boolean;
  eventBanner?: string | null;
  onEmitAction: (action: DrawAction) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export function DrawingCanvas({
  strokes,
  canDraw,
  canUndo,
  canRedo,
  reactions,
  isWarmup = false,
  eventBanner = null,
  onEmitAction,
  onUndo,
  onRedo,
  onClear,
}: DrawingCanvasProps) {
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState<string>('#18181B');
  const [brushSize, setBrushSize] = useState<number>(7);
  const [shapeFilled, setShapeFilled] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const isDrawingRef = useRef(false);
  const activePointsRef = useRef<Point[]>([]);
  const sprayDotsRef = useRef<Point[]>([]);
  const shapeStartRef = useRef<Point | null>(null);
  const renderedCountRef = useRef(0);

  const redrawAll = useCallback((actions: DrawAction[]) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (const act of actions) {
      renderActionToContext(ctx, act);
    }
    renderedCountRef.current = actions.length;
  }, []);

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (strokes.length < renderedCountRef.current || strokes.length === 0) {
      redrawAll(strokes);
    } else if (strokes.length > renderedCountRef.current) {
      for (let i = renderedCountRef.current; i < strokes.length; i++) {
        renderActionToContext(ctx, strokes[i]);
      }
      renderedCountRef.current = strokes.length;
    }
  }, [strokes, redrawAll]);

  useEffect(() => {
    redrawAll(strokes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canDraw) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'b') setTool('pen');
      else if (key === 's') setTool('spray');
      else if (key === 'e') setTool('eraser');
      else if (key === 'g') setTool('fill');
      else if (key === 'l') setTool('line');
      else if (key === 'r') setTool('rect');
      else if (key === 'c') setTool('circle');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [canDraw, onUndo, onRedo]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = previewCanvasRef.current ?? mainCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT)),
    };
  };

  const clearPreview = () => {
    const preview = previewCanvasRef.current;
    if (!preview) return;
    const pCtx = preview.getContext('2d');
    pCtx?.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(e);

    if (tool === 'fill') {
      onEmitAction({
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'fill',
        color,
        x: pt.x,
        y: pt.y,
      });
      return;
    }

    isDrawingRef.current = true;
    const pCtx = previewCanvasRef.current?.getContext('2d');

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      shapeStartRef.current = pt;
    } else if (tool === 'spray') {
      const dots = generateSprayDots(pt, brushSize);
      sprayDotsRef.current = dots;
      if (pCtx) {
        clearPreview();
        renderActionToContext(pCtx, {
          id: 'preview',
          type: 'spray',
          color,
          size: brushSize,
          dots,
        });
      }
    } else {
      activePointsRef.current = [pt];
      if (pCtx) {
        clearPreview();
        renderActionToContext(pCtx, {
          id: 'preview',
          type: 'stroke',
          tool: tool === 'highlighter' ? 'highlighter' : tool === 'eraser' ? 'eraser' : 'pen',
          color,
          size: brushSize,
          points: [pt],
        });
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e);
    if (e.pointerType === 'mouse') {
      const rect = e.currentTarget.getBoundingClientRect();
      setCursorPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    } else {
      setCursorPos(null);
    }

    if (!isDrawingRef.current || !canDraw) return;

    const preview = previewCanvasRef.current;
    const pCtx = preview?.getContext('2d');
    if (!pCtx) return;

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      if (!shapeStartRef.current) return;
      clearPreview();
      renderActionToContext(pCtx, {
        id: 'preview',
        type: 'shape',
        shape: tool,
        color,
        size: brushSize,
        filled: shapeFilled,
        start: shapeStartRef.current,
        end: pt,
      });
    } else if (tool === 'spray') {
      const newDots = generateSprayDots(pt, brushSize);
      sprayDotsRef.current.push(...newDots);
      renderActionToContext(pCtx, {
        id: 'preview',
        type: 'spray',
        color,
        size: brushSize,
        dots: newDots,
      });
    } else {
      const pts = activePointsRef.current;
      const prev = pts[pts.length - 1];
      if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) < 1.5) return;
      pts.push(pt);
      clearPreview();
      renderActionToContext(pCtx, {
        id: 'preview',
        type: 'stroke',
        tool: tool === 'highlighter' ? 'highlighter' : tool === 'eraser' ? 'eraser' : 'pen',
        color,
        size: brushSize,
        points: pts,
      });
    }
  };

  const finishDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if not captured
    }

    const pt = getCanvasPoint(e);
    clearPreview();

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      const start = shapeStartRef.current;
      shapeStartRef.current = null;
      if (!start) return;
      if (Math.hypot(pt.x - start.x, pt.y - start.y) < 2) return;
      onEmitAction({
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'shape',
        shape: tool,
        color,
        size: brushSize,
        filled: shapeFilled,
        start,
        end: pt,
      });
      return;
    }

    if (tool === 'spray') {
      const dots = sprayDotsRef.current;
      sprayDotsRef.current = [];
      if (dots.length === 0) return;
      onEmitAction({
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'spray',
        color,
        size: brushSize,
        dots,
      });
      return;
    }

    const pts = activePointsRef.current;
    activePointsRef.current = [];
    if (pts.length === 0) return;

    onEmitAction({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'stroke',
      tool: tool === 'highlighter' ? 'highlighter' : tool === 'eraser' ? 'eraser' : 'pen',
      color,
      size: brushSize,
      points: pts,
    });
  };

  const handleDownloadPng = () => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `doodleguess-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const toolButtons: { id: DrawTool; label: string; shortcut: string; icon: React.ReactNode }[] = [
    { id: 'pen', label: 'Pen', shortcut: 'B', icon: <Pen className="w-4 h-4" /> },
    { id: 'highlighter', label: 'Marker', shortcut: '', icon: <Highlighter className="w-4 h-4" /> },
    { id: 'spray', label: 'Spray', shortcut: 'S', icon: <SprayCan className="w-4 h-4" /> },
    { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: <Eraser className="w-4 h-4" /> },
    { id: 'fill', label: 'Fill', shortcut: 'G', icon: <PaintBucket className="w-4 h-4" /> },
    { id: 'line', label: 'Line', shortcut: 'L', icon: <Minus className="w-4 h-4" /> },
    { id: 'rect', label: 'Box', shortcut: 'R', icon: <Square className="w-4 h-4" /> },
    { id: 'circle', label: 'Oval', shortcut: 'C', icon: <Circle className="w-4 h-4" /> },
  ];

  const isShapeTool = tool === 'rect' || tool === 'circle';

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* Studio Board Frame */}
      <div className="relative w-full aspect-[16/10] bg-white rounded-2xl border border-[#E4E2DC] shadow-sm overflow-hidden select-none">
        {isWarmup && (
          <div className="absolute top-2.5 left-2.5 z-20 px-2.5 py-1 rounded-lg bg-zinc-900/85 text-white text-[11px] sm:text-xs font-medium pointer-events-none">
            Lobby Warm-Up Board
          </div>
        )}

        <canvas
          ref={mainCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 w-full h-full block"
        />

        {/* Optional Drafting Guide Dot Grid */}
        {showGrid && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'radial-gradient(#94A3B8 1.2px, transparent 1.2px)',
              backgroundSize: '20px 20px',
            }}
          />
        )}

        <canvas
          ref={previewCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          onPointerLeave={() => setCursorPos(null)}
          className={`absolute inset-0 w-full h-full block touch-none ${
            canDraw ? 'cursor-crosshair' : 'cursor-default'
          }`}
        />

        {/* Brush cursor ring preview (mouse) */}
        {canDraw && cursorPos && tool !== 'fill' && (
          <div
            className="pointer-events-none absolute rounded-full border border-zinc-900/60"
            style={{
              width: Math.max(6, brushSize * (tool === 'spray' ? 1.8 : 0.8)),
              height: Math.max(6, brushSize * (tool === 'spray' ? 1.8 : 0.8)),
              left: cursorPos.x,
              top: cursorPos.y,
              transform: 'translate(-50%, -50%)',
              backgroundColor: tool === 'eraser' ? 'rgba(255,255,255,0.6)' : 'transparent',
            }}
          />
        )}

        {/* Top-Right Canvas Utility Buttons */}
        <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
          {canDraw && (
            <button
              type="button"
              onClick={() => setShowGrid((g) => !g)}
              title="Toggle alignment dot grid"
              className={`min-w-[36px] min-h-[36px] p-2 rounded-lg border transition-colors cursor-pointer flex items-center justify-center ${
                showGrid
                  ? 'bg-zinc-900 border-zinc-900 text-white'
                  : 'bg-white/90 hover:bg-white border-[#E4E2DC] text-zinc-700'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadPng}
            title="Save sketch as PNG"
            className="min-w-[36px] min-h-[36px] p-2 rounded-lg bg-white/90 hover:bg-white border border-[#E4E2DC] text-zinc-700 hover:text-zinc-950 transition-colors cursor-pointer flex items-center justify-center"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Animated Game Event Banner Stamp */}
        <AnimatePresence>
          {eventBanner && (
            <motion.div
              key={eventBanner}
              initial={{ opacity: 0, y: -12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-xl bg-zinc-900/90 text-white text-xs sm:text-sm font-semibold shadow-md whitespace-nowrap"
            >
              {eventBanner}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Reactions Overlay */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
          {reactions.map((r) => (
            <div
              key={r.id}
              style={{ left: `${r.xRatio * 100}%` }}
              className="absolute bottom-4 flex flex-col items-center animate-reaction-float"
            >
              <span className="text-2xl drop-shadow-sm">{r.emoji}</span>
              <span className="text-[11px] font-medium text-zinc-700 bg-white/90 px-1.5 py-0.5 rounded border border-[#E4E2DC]">
                {r.playerName}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Studio Toolbar (Active only when user can draw) */}
      {canDraw && (
        <div className="bg-white rounded-2xl border border-[#E4E2DC] p-2.5 sm:p-3 flex flex-col gap-2.5">
          {/* Tools Row — scrollable on very narrow screens, crisp 40px+ touch targets */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 max-w-full">
              {toolButtons.map((tb) => {
                const active = tool === tb.id;
                return (
                  <button
                    key={tb.id}
                    type="button"
                    onClick={() => setTool(tb.id)}
                    title={tb.shortcut ? `${tb.label} (${tb.shortcut})` : tb.label}
                    className={`min-h-[40px] min-w-[40px] flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-zinc-900 text-white'
                        : 'bg-[#F4F2ED] text-zinc-700 hover:bg-zinc-200/70'
                    }`}
                  >
                    {tb.icon}
                    <span className="hidden sm:inline">{tb.label}</span>
                  </button>
                );
              })}

              {isShapeTool && (
                <button
                  type="button"
                  onClick={() => setShapeFilled((f) => !f)}
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    shapeFilled
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-[#E4E2DC] text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {shapeFilled ? 'Filled' : 'Outline'}
                </button>
              )}
            </div>

            {/* History & Clear */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium bg-[#F4F2ED] text-zinc-700 hover:bg-zinc-200/70 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
              >
                <Undo2 className="w-4 h-4" />
                <span className="hidden md:inline">Undo</span>
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium bg-[#F4F2ED] text-zinc-700 hover:bg-zinc-200/70 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
              >
                <Redo2 className="w-4 h-4" />
                <span className="hidden md:inline">Redo</span>
              </button>
              <button
                type="button"
                onClick={onClear}
                title="Clear canvas"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden md:inline">Clear</span>
              </button>
            </div>
          </div>

          {/* Colors + Sizes Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E4E2DC]">
            <div className="flex flex-wrap items-center gap-1.5">
              {PALETTE_COLORS.map((hex) => {
                const active = color.toUpperCase() === hex.toUpperCase() && tool !== 'eraser';
                return (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Color ${hex}`}
                    onClick={() => {
                      setColor(hex);
                      if (tool === 'eraser') setTool('pen');
                    }}
                    style={{ backgroundColor: hex }}
                    className={`w-7 h-7 sm:w-6 sm:h-6 rounded-md border transition-transform cursor-pointer ${
                      hex === '#FFFFFF' ? 'border-zinc-300' : 'border-black/10'
                    } ${active ? 'ring-2 ring-offset-1 ring-zinc-900 scale-110' : 'hover:scale-110'}`}
                  />
                );
              })}

              <label
                title="Custom color"
                className="min-h-[32px] flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F4F2ED] hover:bg-zinc-200/70 text-xs font-medium text-zinc-700 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span
                  className="w-4 h-4 rounded border border-black/15"
                  style={{ backgroundColor: color }}
                />
                <span>Custom</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value);
                    if (tool === 'eraser') setTool('pen');
                  }}
                  className="sr-only"
                />
              </label>
            </div>

            {/* Brush Sizes */}
            <div className="flex items-center gap-1 px-1.5 py-1 rounded-xl bg-[#F4F2ED]">
              {BRUSH_SIZES.map((sz) => {
                const active = brushSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setBrushSize(sz)}
                    aria-label={`Brush size ${sz}`}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                      active ? 'bg-white shadow-sm ring-1 ring-zinc-900/20' : 'hover:bg-white/60'
                    }`}
                  >
                    <span
                      className="rounded-full block"
                      style={{
                        width: Math.max(4, Math.min(20, sz * 0.62)),
                        height: Math.max(4, Math.min(20, sz * 0.62)),
                        backgroundColor: tool === 'eraser' ? '#71717A' : color,
                        border: color === '#FFFFFF' ? '1px solid #D4D4D8' : 'none',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
