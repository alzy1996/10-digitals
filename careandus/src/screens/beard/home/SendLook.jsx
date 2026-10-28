// "Send my look to the salon": the designed look (style and lengths only, never a photo)
// with a name or phone number, as a booking request the salon sees in its requests list.
import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';
import Icon from '../ui/Icon.jsx';
import { useT } from '../lib/i18n.js';
import { sendLook } from '../state/data.js';

export default function SendLook({ shopId, params, code }) {
  const { t, lang } = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState(null);

  const send = async () => {
    if (state === 'sending') return;
    if (!name.trim() && !phone.trim()) {
      setError('need');
      return;
    }
    setError(null);
    setState('sending');
    try {
      await sendLook(shopId, { params, customerName: name, customerPhone: phone, note: code ? `Look Code ${code}` : '', lang });
      setState('sent');
    } catch (err) {
      setError(err && err.message === 'bad-phone' ? 'phone' : null);
      setState(err && err.message === 'bad-phone' ? 'idle' : 'error');
    }
  };

  if (state === 'sent') {
    return (
      <section role="status" className="flex items-start gap-3 rounded-card border border-ok bg-surface p-4">
        <Icon name="check" size={22} className="mt-0.5 shrink-0 text-ok" />
        <div>
          <p className="font-semibold text-ink">{t('beard.home.send.sent')}</p>
          <p className="mt-1 text-sm text-ink2">{t('beard.home.send.sentBody')}</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="home-send" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 id="home-send" className="text-lg">
        {t('beard.home.send.title')}
      </h2>
      <p className="text-sm text-ink2">{t('beard.home.send.body')}</p>
      <Field label={t('beard.home.send.name')} value={name} onChange={setName} autoComplete="name" maxLength={60} />
      <Field
        label={t('beard.home.send.phone')}
        value={phone}
        onChange={setPhone}
        type="tel"
        dir="ltr"
        inputMode="tel"
        autoComplete="tel"
        error={error === 'phone' ? t('beard.home.send.badPhone') : null}
      />
      {error === 'need' ? <p className="text-sm text-risk">{t('beard.home.send.need')}</p> : null}
      {state === 'error' ? <p className="text-sm text-risk">{t('beard.home.send.failed')}</p> : null}
      <Button variant="secondary" icon="share" full loading={state === 'sending'} onClick={send}>
        {t('beard.home.send.action')}
      </Button>
      <p className="flex items-center gap-2 text-xs text-ink2">
        <Icon name="lock" size={16} className="shrink-0" />
        {t('beard.home.send.noPhoto')}
      </p>
    </section>
  );
}
