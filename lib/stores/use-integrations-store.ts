'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store de dominio: Integraciones (Fase B).
//
// Autocontenido: su propio estado + helpers de módulo (getCurrentStudioId, uid,
// dbUpsertIntegracion). Sin hubs cruzados.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId, dbUpsertIntegracion } from '@/lib/supabase-data';
import type { Integracion, TipoIntegracion } from '@/lib/types';

export function useIntegrationsStore() {
  const [integraciones, setIntegraciones] = useState<Integracion[]>([]);

  function upsertIntegracion(tipo: TipoIntegracion, activo: boolean, config: Record<string, string>) {
    const existente = integraciones.find(i => i.tipo === tipo);
    const actualizadoEn = new Date().toISOString();
    const registro: Integracion = {
      id: existente?.id ?? `intg-${tipo.toLowerCase()}-${uid()}`,
      studioId: getCurrentStudioId(),
      tipo,
      activo,
      config,
      actualizadoEn,
    };
    setIntegraciones(prev => {
      const otras = prev.filter(i => i.tipo !== tipo);
      return [...otras, registro];
    });
    dbUpsertIntegracion(registro);
  }

  return {
    integraciones,
    setIntegraciones,
    upsertIntegracion,
  };
}
