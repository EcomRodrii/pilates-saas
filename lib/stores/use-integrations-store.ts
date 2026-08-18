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
    // ¿Ha cambiado alguna credencial? Si sí, lo que se sabía del servicio ya no
    // vale: era de OTRO token. Se compara el config entero porque cualquier
    // campo (token, phoneId, clave API) cambia con quién se habla.
    const credencialesCambiadas =
      JSON.stringify(existente?.config ?? {}) !== JSON.stringify(config ?? {});
    const registro: Integracion = {
      id: existente?.id ?? `intg-${tipo.toLowerCase()}-${uid()}`,
      studioId: getCurrentStudioId(),
      tipo,
      activo,
      config,
      actualizadoEn,
      // Guardar credenciales nuevas NO es haber hablado con el servicio: la
      // salud se conserva si ya la había, y si no, la integración queda en
      // SIN_PROBAR (que es la verdad) en vez de en verde.
      ultimoOkEn: credencialesCambiadas ? null : existente?.ultimoOkEn ?? null,
      ultimoError: credencialesCambiadas ? null : existente?.ultimoError ?? null,
      ultimoErrorEn: credencialesCambiadas ? null : existente?.ultimoErrorEn ?? null,
    };
    setIntegraciones(prev => {
      const otras = prev.filter(i => i.tipo !== tipo);
      return [...otras, registro];
    });
    dbUpsertIntegracion(registro, credencialesCambiadas);
  }

  return {
    integraciones,
    setIntegraciones,
    upsertIntegracion,
  };
}
