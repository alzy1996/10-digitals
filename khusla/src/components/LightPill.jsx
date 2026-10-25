import Icon from './Icon.jsx';
import lights from '../data/lights.json';
import { useT } from '../lib/i18n/useT.js';

export default function LightPill({ value, onChange }) {
  const { name } = useT();
  return (
    <div role="radiogroup" className="inline-flex rounded-full border border-line bg-surface/95 p-1 shadow-sheet">
      {lights.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={value === l.id}
          aria-label={name(l.name)}
          title={name(l.name)}
          onClick={() => onChange(l.id)}
          className={`press grid min-h-tap min-w-tap place-items-center rounded-full ${value === l.id ? 'bg-plum text-onplum' : 'text-ink'}`}
        >
          <Icon name={l.icon} />
        </button>
      ))}
    </div>
  );
}
