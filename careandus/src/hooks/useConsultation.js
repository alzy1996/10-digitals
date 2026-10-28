// Creates the consultation draft once per session (chair mode, staff only) and keeps it updated.
import { useCallback } from 'react';
import { useApp } from './useApp.jsx';
import { useSession } from './useSession.jsx';
import { createConsultation, updateConsultation } from '../services/consultations.js';

export function useConsultation() {
  const app = useApp();
  const session = useSession();
  const ensure = useCallback(
    (extra = {}) => {
      if (session.mode !== 'chair' || !app.isStaff) return null;
      if (session.consultationId) return session.consultationId;
      const id = createConsultation(app.salonId, {
        section: 'hair',
        visitId: session.visitId || null,
        clientId: session.client?.id || null,
        params: { ...session.look, ...extra.params },
        source: session.lookCode ? 'look-code' : 'chair',
        notTodayShown: extra.notTodayShown ?? session.notTodayShown,
      });
      session.patch({ consultationId: id });
      return id;
    },
    [app.isStaff, app.salonId, session],
  );
  const save = useCallback(
    (patch) => {
      const id = session.consultationId || ensure();
      if (id) updateConsultation(app.salonId, id, patch);
    },
    [app.salonId, session.consultationId, ensure],
  );
  return { ensure, save, id: session.consultationId };
}
