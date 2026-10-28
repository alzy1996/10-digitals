import Chip from './Chip.jsx';
import { useT } from '../lib/i18n/useT.js';
import { SECTION_LIST } from '../config/app.js';

/**
 * Multi-select Hair / Nails / Beard. value is a list of ids, at least one stays on.
 * only: limit the choice (e.g. a staff member can only get the services the salon offers).
 */
export default function SectionPicker({ label, value, onChange, only }) {
  const { t, name } = useT();
  const options = SECTION_LIST.filter((s) => !only || only.includes(s.id));
  const toggle = (id) => {
    const next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    if (next.length) onChange(SECTION_LIST.map((s) => s.id).filter((x) => next.includes(x)));
  };
  return (
    <fieldset className="mb-5 min-w-0">
      {label ? <legend className="label mb-2">{label}</legend> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <Chip key={s.id} icon={s.icon} selected={value.includes(s.id)} onClick={() => toggle(s.id)}>
            {name(s.name)}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink2">{t('sections.atLeastOne')}</p>
    </fieldset>
  );
}
