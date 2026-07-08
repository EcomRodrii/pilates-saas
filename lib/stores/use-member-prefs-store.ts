'use client';

// Store de dominio: Preferencias de la socia (portal de miembros) (Fase B).
// Autocontenido: su estado + helpers de módulo. Sin hubs cruzados.

import { useState } from 'react';
import { getCurrentStudioId, dbUpsertPreferenciasSocio } from '@/lib/supabase-data';
import type { PreferenciasSocio, Disponibilidad } from '@/lib/types';

export function useMemberPrefsStore() {
  const [preferenciasSocio, setPreferenciasSocio] = useState<PreferenciasSocio[]>([]);

  function upsertPreferenciasSocio(socioId: string, changes: Partial<Omit<PreferenciasSocio, 'socioId' | 'studioId'>>) {
    setPreferenciasSocio(prev => {
      const existente = prev.find(p => p.socioId === socioId);
      const actualizado: PreferenciasSocio = existente
        ? { ...existente, ...changes, actualizadoEn: new Date().toISOString() }
        : {
            socioId,
            studioId: getCurrentStudioId(),
            disponibilidad: {} as Disponibilidad,
            instructorFavoritoId: null,
            tipoClaseFavorita: null,
            duracionPreferida: null,
            nivel: null,
            notifEmail: true,
            notifWhatsapp: true,
            actualizadoEn: new Date().toISOString(),
            ...changes,
          };
      dbUpsertPreferenciasSocio(actualizado);
      return existente ? prev.map(p => p.socioId === socioId ? actualizado : p) : [...prev, actualizado];
    });
  }

  return { preferenciasSocio, setPreferenciasSocio, upsertPreferenciasSocio };
}
