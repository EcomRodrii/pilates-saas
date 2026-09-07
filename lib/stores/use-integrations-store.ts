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
import type { ResultadoEscritura } from '@/lib/errores';
import type { Integracion, TipoIntegracion } from '@/lib/types';

export function useIntegrationsStore() {
  const [integraciones, setIntegraciones] = useState<Integracion[]>([]);

  // ⚠️ Escribía sin `await` sobre un helper que además se tragaba su propio
  // error, así que la pantalla pintaba «conectado» y cantaba éxito aunque el
  // upsert se hubiera rechazado (la RLS de `integraciones` no es para todo el
  // mundo). Credenciales que parecen guardadas y no están son de lo peor que
  // puede hacer esta pantalla: no se descubre hasta que algo deja de enviarse.
  async function upsertIntegracion(
    tipo: TipoIntegracion,
    activo: boolean,
    config: Record<string, string>,
    // La config que tenía la integración ANTES de tocarla. Viene de fuera y no
    // de `integraciones` porque las credenciales ya no viven en el estado del
    // panel (ver lib/types.ts): las conoce el modal, que es quien las pidió.
    configAnterior: Record<string, string>,
  ): Promise<ResultadoEscritura> {
    const existente = integraciones.find(i => i.tipo === tipo);
    const actualizadoEn = new Date().toISOString();
    // ¿Ha cambiado alguna credencial? Si sí, lo que se sabía del servicio ya no
    // vale: era de OTRO token. Se compara el config entero porque cualquier
    // campo (token, phoneId, clave API) cambia con quién se habla.
    const credencialesCambiadas =
      JSON.stringify(configAnterior ?? {}) !== JSON.stringify(config ?? {});
    const registro: Integracion = {
      id: existente?.id ?? `intg-${tipo.toLowerCase()}-${uid()}`,
      studioId: getCurrentStudioId(),
      tipo,
      activo,
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
    const res = await dbUpsertIntegracion(registro, config, credencialesCambiadas);
    // Si no ha entrado, la pantalla vuelve a lo que hay de verdad en la base:
    // dejarla diciendo «conectado» es la mentira que se descubre semanas
    // después, cuando un aviso no sale y nadie sabe por qué.
    if (!res.ok) {
      setIntegraciones(prev => {
        const otras = prev.filter(i => i.tipo !== tipo);
        return existente ? [...otras, existente] : otras;
      });
    }
    return res;
  }

  return {
    integraciones,
    setIntegraciones,
    upsertIntegracion,
  };
}
