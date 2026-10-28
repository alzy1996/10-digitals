// Small UI pieces shared by the nail screens. Shared Care & Us components stay the base
// (Sheet, Button, Chip); these add the dark camera-stage variants Nail Mirror's studio needs.
import { useCallback } from 'react';
import Sheet from '../../components/Sheet.jsx';
import { useT } from '../../lib/i18n/useT.js';

/** Bilingual record -> text: {en, ar} | {name, nameAr}. */
export function usePick() {
  const { lang } = useT();
  return useCallback(
    (obj) => {
      if (!obj) return '';
      if (obj.en !== undefined || obj.ar !== undefined) return (lang === 'ar' ? obj.ar : obj.en) || obj.en || obj.ar || '';
      return (lang === 'ar' ? obj.nameAr : obj.name) || obj.name || obj.nameAr || obj.code || '';
    },
    [lang],
  );
}

/** Chip on the dark camera stage (48px tall). */
export function DarkChip({ on = false, children, className = '', ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`press inline-flex min-h-tap shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold ${
        on ? 'bg-white text-black' : 'bg-white/10 text-white active:bg-white/20'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 20, className = '' }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border-2 border-current ${className}`}
      style={{ width: size, height: size, borderTopColor: 'transparent', animation: 'nails-spin 0.8s linear infinite' }}
    >
      <style>{'@keyframes nails-spin{to{transform:rotate(360deg)}}'}</style>
    </span>
  );
}

export function Toggle({ checked, onChange, label, dark = false }) {
  return (
    <label className="flex min-h-tap cursor-pointer items-center justify-between gap-3 py-1">
      <span className={`text-[15px] ${dark ? 'text-white' : 'text-ink'}`}>{label}</span>
      <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={`absolute inset-0 rounded-full transition ${checked ? 'bg-plum' : dark ? 'bg-white/25' : 'bg-line'}`} />
        <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'ltr:translate-x-6 rtl:-translate-x-6' : 'ltr:translate-x-1 rtl:-translate-x-1'}`} />
      </span>
    </label>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink2">{hint}</span> : null}
    </label>
  );
}

export const inputClass = 'min-h-tap w-full rounded-control border border-line bg-surface px-3 text-[16px] text-ink';

/** Modal bottom sheet with a scrolling body (the shared Sheet does not scroll by itself). */
export function StudioSheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <Sheet open modal onClose={onClose} title={title}>
      <div className="max-h-[72vh] overflow-y-auto overscroll-contain pb-2">{children}</div>
    </Sheet>
  );
}
