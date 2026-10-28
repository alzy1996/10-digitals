// Chair flow step 1 (ENTRY /nails): the try-on studio on the client in the chair.
// The design lives in the session (memory); the photo and frames never leave the device.
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Studio from './Studio.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { useSession } from '../../hooks/useSession.jsx';
import { useApp } from '../../hooks/useApp.jsx';
import { useNailCatalog } from './useNailCatalog.js';

export default function NailChair() {
  const { t, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const catalog = useNailCatalog();
  const { patch, setHeavy } = session;

  const onDesignChange = useCallback((design) => patch({ nailDesign: design }), [patch]);
  const toAgreement = useCallback(
    (design, { analysis, shot }) => {
      setHeavy('nailsShot', shot || null); // in memory only, wiped with the session
      patch({
        nailDesign: design,
        nailAnalysis: analysis?.skin ? { depth: analysis.skin.depth, undertone: analysis.undertone || analysis.skin.undertone, monk: analysis.skin.monk } : null,
      });
      navigate('/nails/agreement');
    },
    [navigate, patch, setHeavy],
  );

  const title = session.client?.displayName || name({ en: app.salon?.name, ar: app.salon?.nameAr }) || t('sections.nails');

  return (
    <Studio
      staff
      catalog={catalog}
      title={title}
      onBack={() => navigate('/home')}
      primary={{ label: t('nails.to_agreement'), icon: 'check', onClick: toAgreement }}
      initialDesign={session.nailDesign || undefined}
      initialUndertone={session.client?.profile?.undertone || null}
      onDesignChange={onDesignChange}
    />
  );
}
