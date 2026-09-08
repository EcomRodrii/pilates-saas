'use client';

import { portalAuthHeader } from '@/lib/api-client';
import type { Factura } from '@/lib/types';
import type { EmisorFactura, ReceptorFactura } from '@/lib/factura-pdf';

// La factura de un recibo de la socia.
//
// Se pide contra `/api/public/factura`, que deriva la identidad del JWT: pasar
// el `reciboId` de otra persona no devuelve su factura. Aquí no se decide nada.

export interface FacturaDeSocia {
  factura: Factura;
  emisor: EmisorFactura;
  receptor: ReceptorFactura;
}

/**
 * `null` cuando ese recibo no tiene factura emitida — que es el caso NORMAL
 * (en producción, 35 de 73 recibos la llevan). Quien llama enseña entonces el
 * respaldo de siempre, no un error: no tener factura no es un fallo.
 */
export async function getFacturaDeRecibo(studioId: string, reciboId: string): Promise<FacturaDeSocia | null> {
  try {
    const res = await fetch('/api/public/factura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, reciboId }),
    });
    if (!res.ok) return null;
    return (await res.json()) as FacturaDeSocia;
  } catch {
    return null;
  }
}
