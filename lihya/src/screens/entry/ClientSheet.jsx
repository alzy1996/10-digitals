import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useT } from '../../lib/i18n/useT.js';
import { updateClient } from '../../services/clients.js';
import { countSavedForClient, deleteSavedForClient, subscribeSaved } from '../../lib/idb.js';
import Button from '../../components/Button.jsx';
import Field from '../../components/Field.jsx';
import Icon from '../../components/Icon.jsx';
import Sheet from '../../components/Sheet.jsx';
import { useSnackbar } from '../../components/Snackbar.jsx';

const isolate = (text) => `⁨${text}⁩`;

/** Before/after pairs kept on this phone for one client (0 without IndexedDB); refreshes when they change. */
function useSavedCount(clientId, active) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!active || !clientId) {
      setCount(null);
      return undefined;
    }
    let alive = true;
    const read = () => {
      countSavedForClient(clientId).then(
        (n) => alive && setCount(Number(n) || 0),
        () => alive && setCount(0),
      );
    };
    read();
    const unsub = subscribeSaved(read);
    return () => {
      alive = false;
      unsub();
    };
  }, [clientId, active]);
  return count;
}

/**
 * "Edit client" sheet on the barber home: fix the name or phone (saved at once, Undo in
 * the snackbar), and delete the before/after photos this phone keeps for him (only
 * shown when there are some; deleted when the Undo snackbar closes).
 */
export default function ClientSheet({ shopId, client: target, onClose, onSaved }) {
  const { t } = useT();
  const { show, confirmUndo } = useSnackbar();
  const formId = useId();
  const open = Boolean(target);
  // The client stays on the sheet while it slides out after closing.
  const [client, setClient] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState(null);
  const [phoneError, setPhoneError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const savingRef = useRef(false);
  const saved = useSavedCount(client ? client.id : null, open);

  // Fresh fields for every client the sheet opens for.
  if (target && target !== client) {
    setClient(target);
    setName(target.displayName || '');
    setPhone(target.phone || '');
    setNameError(null);
    setPhoneError(null);
    setDeleting(false);
  }
  useEffect(() => {
    if (target) savingRef.current = false;
  }, [target]);

  const save = useCallback(
    (e) => {
      if (e) e.preventDefault();
      if (!open || !client || savingRef.current) return;
      const displayName = name.trim();
      const phoneText = phone.trim();
      if (!displayName) {
        setNameError(t('entry.home.nameRequired'));
        return;
      }
      const before = { displayName: client.displayName || '', phone: client.phone || null };
      const patch = {};
      if (displayName !== before.displayName) patch.displayName = displayName;
      if (phoneText !== (before.phone || '')) patch.phone = phoneText || null;
      if (!Object.keys(patch).length) {
        onClose();
        return;
      }
      savingRef.current = true;
      try {
        updateClient(shopId, client.id, patch);
      } catch (err) {
        savingRef.current = false;
        if (err?.code === 'invalid-argument' && err.message === 'phone') setPhoneError(t('entry.home.phoneInvalid'));
        else if (err?.code === 'invalid-argument') setNameError(t('entry.home.nameRequired'));
        else {
          console.error('updateClient failed', err);
          show({ message: t('common.error') });
        }
        return;
      }
      const undoPatch = {};
      if ('displayName' in patch) undoPatch.displayName = before.displayName;
      if ('phone' in patch) undoPatch.phone = before.phone;
      if (onSaved) onSaved({ ...client, ...patch });
      onClose();
      show({
        message: t('entry.client.saved'),
        actionLabel: t('common.undo'),
        onAction: () => {
          try {
            updateClient(shopId, client.id, undoPatch);
            if (onSaved) onSaved({ ...client, ...undoPatch });
          } catch (err) {
            console.error('updateClient undo failed', err);
            show({ message: t('common.error') });
          }
        },
      });
    },
    [open, client, name, phone, shopId, onClose, onSaved, show, t],
  );

  const deletePhotos = () => {
    if (!client || deleting) return;
    const id = client.id;
    setDeleting(true);
    confirmUndo({
      message: t('entry.client.photos.deleting'),
      actionLabel: t('common.undo'),
      onUndo: () => setDeleting(false),
      onCommit: () => {
        deleteSavedForClient(id).then(
          (n) => {
            setDeleting(false);
            show({ message: n > 0 ? t('entry.client.photos.deleted', { n }) : t('entry.client.photos.none') });
          },
          (err) => {
            console.error('deleteSavedForClient failed', err);
            setDeleting(false);
            show({ message: t('entry.client.photos.failed') });
          },
        );
      },
    });
  };

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row-reverse">
      <Button type="submit" form={formId} variant="primary" icon="check" className="sm:flex-1">
        {t('entry.client.save')}
      </Button>
      <Button variant="ghost" full className="sm:w-auto" onClick={onClose}>
        {t('common.cancel')}
      </Button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={t('entry.client.title')} footer={footer}>
      {client ? (
        <div className="flex flex-col gap-5">
          <form id={formId} onSubmit={save} noValidate className="flex flex-col gap-4">
            <Field
              label={t('entry.home.clientName')}
              dir="auto"
              autoComplete="off"
              autoCapitalize="words"
              maxLength={80}
              value={name}
              onChange={(v) => {
                setName(v);
                setNameError(null);
              }}
              error={nameError}
            />
            <Field
              label={t('entry.home.clientPhone')}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              dir="ltr"
              placeholder="+968 9123 4567"
              icon="phone"
              value={phone}
              onChange={(v) => {
                setPhone(v);
                setPhoneError(null);
              }}
              error={phoneError}
              hint={t('entry.home.phoneHint')}
            />
          </form>

          {saved > 0 ? (
            <section aria-labelledby={`${formId}-photos`} className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="flex items-start gap-3">
                <Icon name="camera" size={20} className="mt-0.5 shrink-0 text-text-2" />
                <div className="min-w-0 flex-1">
                  <h3 id={`${formId}-photos`} className="text-base font-medium text-text">
                    {t('entry.client.photos.title')}
                  </h3>
                  <p className="num text-sm text-text-2">
                    {deleting
                      ? t('entry.client.photos.deleting')
                      : t('entry.client.photos.count', { n: saved, name: isolate(client.displayName || t('common.walkIn')) })}
                  </p>
                </div>
              </div>
              <Button variant="danger" icon="trash" full disabled={deleting} onClick={deletePhotos}>
                {t('entry.client.photos.delete')}
              </Button>
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
