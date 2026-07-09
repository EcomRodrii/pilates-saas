'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store de dominio: Códigos de descuento (Fase B).
//
// Autocontenido: solo su propio estado + helpers de módulo. Sin hubs cruzados.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId, dbInsertCodigoDescuento, dbUpdateCodigoDescuento, dbDeleteCodigoDescuento } from '@/lib/supabase-data';
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
    dbInsertCodigoDescuento(nuevo);
  }

  function toggleCodigoDescuento(codigoId: string) {
    let nuevoActivo = false;
    setCodigosDescuento(prev => prev.map(c => {
      if (c.id !== codigoId) return c;
      nuevoActivo = !c.activo;
      return { ...c, activo: nuevoActivo };
    }));
    dbUpdateCodigoDescuento(codigoId, { activo: nuevoActivo });
  }

  function deleteCodigoDescuento(id: string) {
    setCodigosDescuento(prev => prev.filter(c => c.id !== id));
    dbDeleteCodigoDescuento(id);
  }

  return {
    codigosDescuento,
    setCodigosDescuento,
    addCodigoDescuento,
    toggleCodigoDescuento,
    deleteCodigoDescuento,
  };
}
