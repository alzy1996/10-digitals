// S06 Quick questions (PRD 6, 8.1 step 4): up to three one-tap chip rows that tune the
// ranking (work rule, visit frequency with daily grooming time, occasion). Every row
// is optional and a second tap clears it; Skip and Next both go to the styles.

import { useNavigate } from 'react-router-dom';
import ScreenFrame from './ui/ScreenFrame.jsx';
import Button from './ui/Button.jsx';
import BottomAction from './ui/BottomAction.jsx';
import ChipRow from './ui/ChipRow.jsx';
import { useT } from './lib/i18n.js';
import { useSession } from './state/session.js';

const WORK_RULES = Object.freeze(['clean', 'short', 'none']);
const VISITS = Object.freeze(['weekly', 'biweekly', 'monthly']);
const GROOMING = Object.freeze([0, 5, 10]);
const OCCASIONS = Object.freeze(['eid', 'none']);

function Question({ children }) {
  return <h2 className="text-lg font-semibold text-ink">{children}</h2>;
}

export default function S06Questions() {
  const { t } = useT();
  const navigate = useNavigate();
  const { answers, setAnswer, path } = useSession();
  const a = answers || {};

  const toStyles = () => navigate(path('styles'));
  const answered = [a.workRule, a.visitFrequency !== null && a.visitFrequency !== undefined ? a.visitFrequency : a.grooming, a.occasion].filter(
    (v) => v !== null && v !== undefined,
  ).length;

  return (
    <ScreenFrame
      title={t('beard.capture.q.title')}
      back={path('profile')}
      actions={
        <Button variant="ghost" size="sm" onClick={toStyles}>
          {t('beard.common.skip')}
        </Button>
      }
      footer={
        <BottomAction>
          <Button variant="primary" iconEnd="arrow-right" onClick={toStyles}>
            {t('beard.common.next')}
          </Button>
        </BottomAction>
      }
    >
      <p className="text-ink2">{t('beard.capture.q.intro')}</p>

      <section className="flex flex-col gap-3 py-5">
        <ChipRow
          label={<Question>{t('beard.capture.q.workRule')}</Question>}
          options={WORK_RULES.map((v) => ({ value: v, label: t(`beard.capture.q.work.${v}`) }))}
          value={a.workRule ?? null}
          onChange={(v) => setAnswer('workRule', v)}
          nullable
        />
      </section>

      <hr className="rule-clay" />

      <section className="flex flex-col gap-4 py-5">
        <ChipRow
          label={<Question>{t('beard.capture.q.visit')}</Question>}
          options={VISITS.map((v) => ({ value: v, label: t(`beard.capture.q.visit.${v}`) }))}
          value={a.visitFrequency ?? null}
          onChange={(v) => setAnswer('visitFrequency', v)}
          nullable
        />
        <ChipRow
          label={t('beard.capture.q.grooming')}
          options={GROOMING.map((v) => ({ value: v, label: t(`beard.capture.q.grooming.${v}`), icon: 'clock' }))}
          value={a.grooming ?? null}
          onChange={(v) => setAnswer('grooming', v)}
          nullable
        />
      </section>

      <hr className="rule-clay" />

      <section className="flex flex-col gap-3 py-5">
        <ChipRow
          label={<Question>{t('beard.capture.q.occasion')}</Question>}
          options={OCCASIONS.map((v) => ({ value: v, label: t(`beard.capture.q.occasion.${v}`), icon: v === 'eid' ? 'calendar' : undefined }))}
          value={a.occasion ?? null}
          onChange={(v) => setAnswer('occasion', v)}
          nullable
        />
      </section>

      <p role="status" className="num pb-2 text-sm text-ink2">
        {t('beard.capture.q.answered', { n: answered })}
      </p>
    </ScreenFrame>
  );
}
