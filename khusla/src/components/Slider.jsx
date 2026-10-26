import { useId } from 'react';

export default function Slider({ label, value, min = 0, max = 1, step = 0.01, onChange, format = (v) => v, ticks }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <span className="num rounded-full bg-surface2 px-3 py-1 text-sm font-semibold text-ink">{format(value)}</span>
      </div>
      <div className="relative flex h-12 items-center">
        <div className="absolute inset-x-0 h-2 rounded-full bg-surface2" />
        <div className="absolute h-2 rounded-full bg-plum ltr:left-0 rtl:right-0" style={{ width: `${pct}%` }} />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="khusla-range relative h-12 w-full appearance-none bg-transparent"
        />
      </div>
      {ticks ? (
        <div className="num mt-1 flex justify-between text-xs text-ink2">
          {ticks.map((tk) => (
            <span key={tk}>{tk}</span>
          ))}
        </div>
      ) : null}
      <style>{`
        .khusla-range::-webkit-slider-thumb{-webkit-appearance:none;width:36px;height:36px;border-radius:50%;background:var(--surface);border:2px solid var(--plum);box-shadow:0 1px 4px rgba(29,26,28,.18)}
        .khusla-range::-moz-range-thumb{width:36px;height:36px;border-radius:50%;background:var(--surface);border:2px solid var(--plum)}
        .khusla-range::-webkit-slider-runnable-track{background:transparent}
      `}</style>
    </div>
  );
}
