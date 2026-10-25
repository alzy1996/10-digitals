import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { LIMITS } from '../config/app.js';
import { cx, keypadLayout, sanitizeCode, useOptionalT } from './kit.js';

const HINT_MS = 2600;

function canReadClipboard() {
  return typeof navigator !== 'undefined' && Boolean(navigator.clipboard && navigator.clipboard.readText);
}

/**
 * Look Code entry (PRD 9.6, S14): 6 boxes x 56 px, monospace 28 px, plus a large on-screen
 * keypad of the code alphabet so the barber never needs the system keyboard.
 * Typing on a hardware keyboard and pasting (Ctrl+V, long-press paste, the Paste key) also work.
 * Input is uppercased; characters outside the alphabet are rejected with a short hint.
 * The code always reads left to right, in both languages.
 */
export default function CodeBoxes({
  value = '',
  onChange,
  length = LIMITS.lookCodeLength,
  alphabet = LIMITS.lookCodeAlphabet,
  autoFocus = false,
  label,
  error,
  disabled = false,
  keypad = true,
  className,
}) {
  const { t } = useOptionalT();
  const autoId = useId();
  const hintId = `${autoId}-hint`;
  const inputRef = useRef(null);
  const hintTimer = useRef(0);
  const [focused, setFocused] = useState(false);
  const [hint, setHint] = useState('');
  const [clipboardOk, setClipboardOk] = useState(false);
  const code = sanitizeCode(value, alphabet, length).value;
  const keys = Array.from(new Set(String(alphabet).toUpperCase()));
  const layout = keypadLayout(keys.length, { cols: 6, paste: clipboardOk });

  useEffect(() => {
    setClipboardOk(canReadClipboard());
    return () => clearTimeout(hintTimer.current);
  }, []);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, [autoFocus]);

  const flashHint = (text) => {
    clearTimeout(hintTimer.current);
    setHint(text);
    hintTimer.current = setTimeout(() => setHint(''), HINT_MS);
  };

  const commit = (raw) => {
    const { value: next, rejected } = sanitizeCode(raw, alphabet, length);
    if (rejected.length) flashHint(t('ui.code.rejected', { chars: rejected.join(' ') }));
    if (next !== code && onChange) onChange(next);
  };

  // Keep the (invisible) caret at the end so typed characters always append.
  const onSelect = (e) => {
    const el = e.target;
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end);
  };

  const onInput = (e) => commit(e.target.value);

  const pasteText = (text) => {
    const { value: clean, rejected } = sanitizeCode(text, alphabet, length);
    if (rejected.length && !clean) {
      flashHint(t('ui.code.rejected', { chars: rejected.join(' ') }));
      return;
    }
    // A full code replaces what is there; a fragment is appended.
    const next = clean.length >= length ? clean : sanitizeCode(code + clean, alphabet, length).value;
    if (rejected.length) flashHint(t('ui.code.rejected', { chars: rejected.join(' ') }));
    if (next !== code && onChange) onChange(next);
  };

  const onPaste = (e) => {
    const text = e.clipboardData ? e.clipboardData.getData('text') : '';
    e.preventDefault();
    pasteText(text);
  };

  const pressKey = (ch) => {
    if (disabled) return;
    commit(code + ch);
  };

  const backspace = () => {
    if (disabled || !code) return;
    if (onChange) onChange(code.slice(0, -1));
  };

  const pasteFromClipboard = async () => {
    if (disabled) return;
    try {
      const text = await navigator.clipboard.readText();
      pasteText(text);
    } catch {
      flashHint(t('ui.code.pasteFailed'));
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Backspace' && !e.target.value) {
      e.preventDefault();
      backspace();
    }
  };

  const active = Math.min(code.length, length - 1);
  const full = code.length >= length;
  const keyClass =
    'press flex h-[52px] items-center justify-center rounded-ctl border border-line bg-surface-2 text-text active:bg-line disabled:opacity-40';

  return (
    <div className={cx('flex flex-col items-center gap-5', className)} dir="ltr">
      <div className="relative w-full max-w-[376px]">
        <div className="grid grid-cols-6 justify-center gap-1 sm:gap-2" aria-hidden="true">
          {Array.from({ length }, (_, i) => {
            const ch = code[i] || '';
            const isActive = !disabled && !full && i === active;
            return (
              <div
                key={i}
                className={cx(
                  'flex h-14 items-center justify-center rounded-ctl border bg-surface-2 font-mono text-[28px] font-semibold leading-none text-text',
                  error ? 'border-cut' : isActive ? 'border-2 border-brass' : ch ? 'border-text-2/60' : 'border-line',
                  isActive && focused && 'bg-brass/10',
                )}
              >
                {ch}
              </div>
            );
          })}
        </div>
        <input
          ref={inputRef}
          value={code}
          onChange={onInput}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onSelect={onSelect}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          inputMode="none"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={length * 2}
          aria-label={label || t('ui.code.label')}
          aria-invalid={error ? true : undefined}
          aria-describedby={hintId}
          className="absolute inset-0 h-full w-full cursor-default bg-transparent text-transparent caret-transparent opacity-0 selection:bg-transparent"
        />
      </div>

      <p id={hintId} role="status" aria-live="polite" className={cx('min-h-[1.5em] text-center text-sm', error ? 'text-cut' : 'text-text-2')}>
        {error || hint}
      </p>

      {keypad ? (
        <div
          className="grid w-full max-w-[420px] gap-2"
          style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
          role="group"
          aria-label={t('ui.code.keypad')}
        >
          {keys.map((ch) => (
            <button
              key={ch}
              type="button"
              disabled={disabled || full}
              onClick={() => pressKey(ch)}
              className={cx(keyClass, 'font-mono text-[22px] font-semibold')}
            >
              {ch}
            </button>
          ))}
          {layout.actions.paste > 0 ? (
            <button
              type="button"
              disabled={disabled}
              onClick={pasteFromClipboard}
              className={cx(keyClass, 'gap-2 text-sm font-medium')}
              style={{ gridColumn: `span ${layout.actions.paste} / span ${layout.actions.paste}` }}
            >
              <Icon name="copy" size={20} />
              <span>{t('ui.code.paste')}</span>
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled || !code}
            onClick={backspace}
            aria-label={t('ui.code.backspace')}
            className={cx(keyClass, 'text-text')}
            style={{ gridColumn: `span ${layout.actions.backspace} / span ${layout.actions.backspace}` }}
          >
            <Icon name="backspace" size={26} mirror={false} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
