// Las líneas de una venta del TPV tal como llegan del navegador: ids y cantidades
// (y concepto e importe en lo libre). Nunca precios del catálogo: los relee
// `registrar_venta_pos`. Lo comparten la venta y su vista previa
// (`/api/pos/venta/presupuesto`), que tienen que leer el MISMO carrito.

import type { LineaVentaPeticion } from './tipos.ts';

export function saneaLineas(bruto: unknown): { lineas: LineaVentaPeticion[] } | { error: string } {
  if (!Array.isArray(bruto) || bruto.length === 0) return { error: 'El ticket está vacío.' };
  if (bruto.length > 100) return { error: 'Demasiadas líneas en un solo ticket.' };

  const lineas: LineaVentaPeticion[] = [];
  for (const raw of bruto) {
    if (typeof raw !== 'object' || raw === null) return { error: 'Línea no válida.' };
    const l = raw as Record<string, unknown>;
    const tipo = l.tipo;
    if (tipo !== 'PRODUCTO' && tipo !== 'PLAN' && tipo !== 'LIBRE') return { error: 'Línea no válida.' };

    const cantidad = Number(l.cantidad ?? 1);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 999) return { error: 'Cantidad no válida.' };

    if (tipo === 'LIBRE') {
      const nombre = String(l.nombre ?? '').trim();
      const precio = Number(l.precio);
      if (!nombre) return { error: 'Pon un concepto al importe libre.' };
      if (!Number.isFinite(precio) || precio < 0 || precio > 10000) return { error: 'Ese importe libre no es válido.' };
      lineas.push({ tipo, cantidad, nombre: nombre.slice(0, 120), precio, referenciaId: null });
      continue;
    }

    const referenciaId = typeof l.referenciaId === 'string' ? l.referenciaId : '';
    if (!referenciaId) return { error: 'Línea sin artículo.' };
    lineas.push({ tipo, cantidad, referenciaId });
  }
  return { lineas };
}
