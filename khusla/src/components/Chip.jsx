import Icon from './Icon.jsx';

export default function Chip({ selected = false, children, icon, tone, className = '', ...rest }) {
  const toneRing =
    tone === 'ok' ? 'border-ok text-ok' : tone === 'warn' ? 'border-warn text-warn' : tone === 'risk' ? 'border-risk text-risk' : '';
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`press inline-flex min-h-chip items-center gap-2 whitespace-nowrap rounded-full border px-5 text-[15px] font-medium ${
        selected ? 'border-plum bg-plum text-onplum' : `border-line bg-surface text-ink active:bg-surface2 ${toneRing}`
      } ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={20} /> : null}
      {children}
    </button>
  );
}

/** Static label chip (reasons, flags). Not tappable, so it may be smaller than 48px. */
export function Tag({ children, tone = 'neutral', icon }) {
  const tones = {
    neutral: 'bg-surface2 text-ink',
    ok: 'text-ok border border-ok',
    warn: 'text-warn border border-warn',
    risk: 'text-risk border border-risk',
    plum: 'bg-plum text-onplum',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-medium ${tones[tone]}`}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </span>
  );
}

/** A labelled row of single-choice chips. */
export function ChipRow({ label, options, value, onChange, wrap = true }) {
  return (
    <fieldset className="mb-5 min-w-0">
      {label ? <legend className="label mb-2">{label}</legend> : null}
      <div className={`flex gap-2 ${wrap ? 'flex-wrap' : 'no-scrollbar overflow-x-auto pb-1'}`}>
        {options.map((o) => (
          <Chip key={String(o.value)} selected={value === o.value} onClick={() => onChange(o.value)} icon={o.icon}>
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
