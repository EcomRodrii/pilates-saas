'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store de dominio: Códigos de descuento (Fase B).
//
// Autocontenido: solo su propio estado + helpers de módulo. Sin hubs cruzados.
//
// NOTA (deuda preexistente preservada): estas acciones NO persisten en BD —
// operan solo en memoria, igual que antes de la extracción. Cuando exista un
// db* para codigos_descuento se añadirán aquí sin tocar los consumidores.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId } from '@/lib/supabase-data';
import type { CodigoDescuento } from '@/lib/types';

export function useDiscountCodesStore() {
  const [codigosDescuento, setCodigosDescuento] = useState<CodigoDescuento[]>([]);

  function addCodigoDescuento(fields: Omit<CodigoDescuento, 'id' | 'studioId' | 'usos' | 'creadoEn'>) {
    const nuevo: CodigoDescuento = {
      id: `disc-${uid()}`,
      studioId: getCurrentStudioId(),
      usos: 0,
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    setCodigosDescuento(prev => [nuevo, ...prev]);
  }

  function toggleCodigoDescuento(codigoId: string) {
    setCodigosDescuento(prev => prev.map(c =>
      c.id === codigoId ? { ...c, activo: !c.activo } : c
    ));
  }

  function deleteCodigoDescuento(id: string) {
    setCodigosDescuento(prev => prev.filter(c => c.id !== id));
  }

  return {
    codigosDescuento,
    setCodigosDescuento,
    addCodigoDescuento,
    toggleCodigoDescuento,
    deleteCodigoDescuento,
  };
}
