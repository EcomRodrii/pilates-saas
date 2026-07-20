'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store de dominio: Códigos de descuento (Fase B).
//
// Autocontenido: solo su propio estado + helpers de módulo. Sin hubs cruzados.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId, dbInsertCodigoDescuento, dbUpdateCodigoDescuento, dbDeleteCodigoDescuento, dbConsumirCodigoDescuento } from '@/lib/supabase-data';
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

  // El valor nuevo se calcula del estado ACTUAL, no dentro del updater de
  // setState: ese updater corre en el render siguiente, así que leerlo desde una
  // variable exterior daba siempre el valor inicial y se persistía `activo:false`
  // pasara lo que pasara (desactivar funcionaba; activar no persistía nunca).
  function toggleCodigoDescuento(codigoId: string) {
    const actual = codigosDescuento.find(c => c.id === codigoId);
    if (!actual) return;
    const nuevoActivo = !actual.activo;
    setCodigosDescuento(prev => prev.map(c => c.id === codigoId ? { ...c, activo: nuevoActivo } : c));
    dbUpdateCodigoDescuento(codigoId, { activo: nuevoActivo });
  }

  function deleteCodigoDescuento(id: string) {
    setCodigosDescuento(prev => prev.filter(c => c.id !== id));
    dbDeleteCodigoDescuento(id);
  }

  // Canje: suma un uso al código. Lo llama el POS al cerrar una venta con código
  // aplicado, para que los de un solo uso dejen de valer.
  //
  // El incremento lo hace la BD (`usos = usos + 1`, migración 0050), no el
  // cliente: es dinero y el POS puede estar abierto en dos sitios a la vez, así
  // que un leer-modificar-escribir desde aquí perdería canjes simultáneos. Antes
  // además se persistía SIEMPRE `usos: 0` —el valor se leía dentro del updater de
  // setState, que corre después—, de modo que un código de un solo uso se podía
  // canjear infinitas veces. El estado local se sincroniza con lo que devuelve
  // la BD, que es la verdad.
  async function registrarUsoCodigo(codigoId: string) {
    const usos = await dbConsumirCodigoDescuento(codigoId);
    if (usos == null) return; // inactivo o ya agotado: no se toca el estado local
    setCodigosDescuento(prev => prev.map(c => c.id === codigoId ? { ...c, usos } : c));
  }

  return {
    codigosDescuento,
    setCodigosDescuento,
    addCodigoDescuento,
    toggleCodigoDescuento,
    deleteCodigoDescuento,
    registrarUsoCodigo,
  };
}
