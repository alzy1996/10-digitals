// On-photo line handles (PRD 7.1, 7.2): while the Lines group is open in Photo mode, the
// cheek lines and the neckline are drawn on the photo where the beard edge falls, each
// with a big brass handle (48 px) the barber drags up or down on the face itself. The
// handle follows its own track (where that line sits at every offset), so the finger
// and the line stay together; the look updates as a draft while dragging (the Photo
// Studio redraws through its usual debounce) and is committed on release. Arrow keys
// move a focused handle; the offset sliders in the sheet stay as the other way in.
//
// Coordinates are image coordinates of the un-mirrored photo (inline left / top), so
// they are the same in Arabic and English.

import { useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { clamp, cx } from '../../components/kit.js';
import { useT } from '../../lib/i18n/useT.js';
import { LINE_OFFSET_KEYS, fromStage, lineOffsetText, nearestOffset, toStage, withLineOffset } from './lineHandles.js';

/** Keyboard steps, the same as the offset sliders. */
const STEP = 0.05;
const PAGE = 0.25;

const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
const round = (v) => Math.round(v / STEP) * STEP;

function Line({ pts }) {
  if (!pts || pts.length < 2) return null;
  const d = pathOf(pts);
  return (
    <>
      <path d={d} fill="none" stroke="rgb(var(--bg-rgb) / 0.55)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="var(--brass)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/**
 * @param {object} p
 * @param {object} p.guides renderStudio.lineGuides(shot, params) of the shown shot
 * @param {{ x, y, w, h }} p.crop the face crop on screen (shot pixels)
 * @param {{ width, height }} p.box the stage box (CSS pixels)
 * @param {object} p.params the look as shown (draft or committed)
 * @param {boolean} p.cheek show the cheek-line handles
 * @param {boolean} p.neck show the neckline handle
 * @param {object|null} p.front front Shot, for the mm read-out (as the sliders)
 * @param {number|null} p.mmPerPx the profile's scale, for the mm read-out
 */
export default function LineHandles({ guides, crop, box, params, cheek, neck, front, mmPerPx, onDraft, onCommit }) {
  const { t, lang } = useT();
  const hostRef = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const latest = useRef(null);
  latest.current = { guides, crop, params, onDraft, onCommit };

  const lines = (params && params.lines) || {};
  const S = (p) => toStage(p, crop, box);
  const inside = (q) => q[0] >= 0 && q[0] <= box.width && q[1] >= 0 && q[1] <= box.height;

  const textFor = (key, value) => lineOffsetText({ t, lang, key, lines, value, front, mmPerPx });

  const pickFor = (handle) => (handle.line === 'cheek' ? (s) => s[handle.side] : (s) => s.point);
  const trackOf = (g, handle) => (handle.line === 'cheek' ? g.cheek.track : g.neck && g.neck.track);

  const pointerAt = (e) => {
    const host = hostRef.current;
    const L = latest.current;
    if (!host) return null;
    const r = host.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return fromStage([e.clientX - r.left, e.clientY - r.top], L.crop, { width: r.width, height: r.height });
  };

  const start = (handle, at) => (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = pointerAt(e);
    if (!p) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is best effort
    }
    e.currentTarget.focus({ preventScroll: true });
    const key = LINE_OFFSET_KEYS[handle.line];
    const value = Number(lines[key]) || 0;
    // Keep the grab point: the line does not jump to the finger.
    dragRef.current = { handle, key, id: e.pointerId, value, start: value, grab: [at[0] - p[0], at[1] - p[1]] };
    setDragging({ ...handle, value });
  };

  const move = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const p = pointerAt(e);
    const L = latest.current;
    if (!p || !L.guides) return;
    const v = nearestOffset(trackOf(L.guides, d.handle), [p[0] + d.grab[0], p[1] + d.grab[1]], pickFor(d.handle));
    if (v === null || v === d.value) return;
    d.value = v;
    setDragging({ ...d.handle, value: v });
    L.onDraft(withLineOffset(L.params, d.key, v));
  };

  const end = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    dragRef.current = null;
    setDragging(null);
    const L = latest.current;
    if (d.value !== d.start) L.onCommit(withLineOffset(L.params, d.key, d.value));
  };

  const onKey = (handle) => (e) => {
    const key = LINE_OFFSET_KEYS[handle.line];
    const cur = Number(lines[key]) || 0;
    let next = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = cur + STEP;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = cur - STEP;
    else if (e.key === 'PageUp') next = cur + PAGE;
    else if (e.key === 'PageDown') next = cur - PAGE;
    else if (e.key === 'Home') next = -1;
    else if (e.key === 'End') next = 1;
    if (next === null) return;
    e.preventDefault();
    const v = clamp(round(next), -1, 1);
    if (v !== cur) onCommit(withLineOffset(params, key, v));
  };

  const handles = [];
  if (cheek && guides.cheek) {
    for (const side of ['R', 'L']) {
      const at = guides.cheek.handles[side];
      if (at) handles.push({ id: `cheek-${side}`, line: 'cheek', side, at, label: t(side === 'R' ? 'studio.lines.dragCheekR' : 'studio.lines.dragCheekL') });
    }
  }
  // A neckline that follows the jaw has no height to set (its slider is hidden too).
  if (neck && guides.neck && guides.neck.handle && !guides.neck.followsJaw) {
    handles.push({ id: 'neck', line: 'neck', side: null, at: guides.neck.handle, label: t('studio.lines.dragNeck') });
  }

  const dragged = dragging ? handles.find((h) => h.line === dragging.line && h.side === dragging.side) : null;
  const draggedAt = dragged ? S(dragged.at) : null;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 overflow-hidden rounded-card">
      <svg aria-hidden="true" className="absolute inset-0" width={box.width} height={box.height} viewBox={`0 0 ${box.width} ${box.height}`}>
        {cheek && guides.cheek ? (
          <>
            <Line pts={guides.cheek.lines.R.map(S)} />
            <Line pts={guides.cheek.lines.L.map(S)} />
          </>
        ) : null}
        {neck && guides.neck ? <Line pts={guides.neck.line.map(S)} /> : null}
      </svg>
      {handles.map((h) => {
        const q = S(h.at);
        if (!inside(q)) return null;
        const key = LINE_OFFSET_KEYS[h.line];
        const value = Number(lines[key]) || 0;
        const active = dragged === h;
        return (
          <div
            key={h.id}
            role="slider"
            tabIndex={0}
            aria-label={h.label}
            aria-orientation="vertical"
            aria-valuemin={-1}
            aria-valuemax={1}
            aria-valuenow={Math.round(value * 100) / 100}
            aria-valuetext={textFor(key, value)}
            onPointerDown={start(h, h.at)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onKeyDown={onKey(h)}
            onContextMenu={(e) => e.preventDefault()}
            className={cx(
              'pointer-events-auto absolute flex h-12 w-12 cursor-ns-resize touch-none select-none items-center justify-center rounded-full border-2 border-brass text-brass outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              active ? 'bg-brass/30' : 'bg-bg/70',
            )}
            style={{ left: q[0], top: q[1], transform: 'translate(-50%, -50%)' }}
          >
            <span aria-hidden="true" className="flex flex-col items-center leading-none">
              <Icon name="chevron-up" size={14} />
              <span className="my-px h-2 w-2 rounded-full bg-brass" />
              <Icon name="chevron-down" size={14} />
            </span>
          </div>
        );
      })}
      {dragged && draggedAt ? (
        <span
          className="num absolute whitespace-nowrap rounded-full border border-brass bg-bg/90 px-2.5 py-1 text-xs font-semibold text-brass"
          style={{ left: clamp(draggedAt[0], 72, Math.max(72, box.width - 72)), top: Math.max(14, draggedAt[1] - 40), transform: 'translate(-50%, -50%)' }}
        >
          {textFor(LINE_OFFSET_KEYS[dragged.line], dragging.value)}
        </span>
      ) : null}
    </div>
  );
}
