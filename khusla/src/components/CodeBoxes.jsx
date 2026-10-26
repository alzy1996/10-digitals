import { useRef } from 'react';
import { LOOK_CODE_ALPHABET } from '../services/schema.js';

/** Six large boxes for a Look Code. Typing is filtered to the code alphabet (no 0, O, 1, I). */
export default function CodeBoxes({ value, onChange, onComplete, label }) {
  const ref = useRef(null);
  const chars = value.padEnd(6, ' ').slice(0, 6).split('');
  const handle = (raw) => {
    const clean = raw
      .toUpperCase()
      .split('')
      .filter((c) => LOOK_CODE_ALPHABET.includes(c))
      .join('')
      .slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete?.(clean);
  };
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => handle(e.target.value)}
        aria-label={label}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        className="absolute inset-0 opacity-0"
        maxLength={12}
        autoFocus
      />
      <div className="flex justify-center gap-2" dir="ltr">
        {chars.map((c, i) => (
          <span
            key={i}
            className={`num grid h-16 w-12 place-items-center rounded-control border text-[28px] font-semibold tablet:h-20 tablet:w-16 ${
              i === value.length ? 'border-plum' : 'border-line'
            } bg-surface`}
          >
            {c.trim()}
          </span>
        ))}
      </div>
    </div>
  );
}
