import Icon from './Icon.jsx';

export function Empty({ icon = 'info', title, body, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid h-16 w-16 place-items-center rounded-full border border-line text-clay">
        <Icon name={icon} size={28} />
      </span>
      <div className="font-display text-lg">{title}</div>
      {body ? <p className="mt-1 max-w-[36ch] text-sm text-ink2">{body}</p> : null}
      {action ? <div className="mt-5 w-full max-w-[320px]">{action}</div> : null}
    </div>
  );
}

export function ErrorBox({ title, body, action }) {
  return (
    <div role="alert" className="card my-4 border-risk p-4">
      <div className="flex items-start gap-3">
        <Icon name="alert" className="mt-0.5 text-risk" />
        <div className="flex-1">
          <div className="font-semibold text-risk">{title}</div>
          {body ? <p className="mt-1 text-sm text-ink2">{body}</p> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Steps({ items }) {
  return (
    <ol className="my-6 space-y-2" aria-live="polite">
      {items.map((s) => (
        <li key={s.key} className={`flex items-center gap-3 text-[15px] ${s.state === 'todo' ? 'text-ink2' : 'text-ink'}`}>
          <span
            className={`grid h-6 w-6 place-items-center rounded-full border ${
              s.state === 'done' ? 'border-ok bg-ok text-white' : s.state === 'doing' ? 'border-plum' : 'border-line'
            }`}
          >
            {s.state === 'done' ? <Icon name="check" size={16} /> : s.state === 'doing' ? <span className="h-2 w-2 rounded-full bg-plum" style={{ animation: 'pulse-soft 1s infinite' }} /> : null}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

export function Section({ title, children, aside }) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-lg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`num mt-1 font-display text-2xl ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'risk' ? 'text-risk' : 'text-ink'}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-ink2">{sub}</div> : null}
    </div>
  );
}
