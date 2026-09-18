'use client';

import { useState } from 'react';
import type { ResultadoReversion } from '@/lib/billing/revertir-doble-cobro';

export function useRevertirDobleCobroMutation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revertir = async (params: {
    dobleCobroId: string;
    tipo: 'credito' | 'refund';
    notas?: string;
  }): Promise<ResultadoReversion | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/billing/dobles-cobros/revertir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || 'Error desconocido';
        setError(errorMsg);
        return null;
      }

      return {
        ok: true,
        dobleCobroId: data.dobleCobroId,
        tipo: data.tipo,
        importeEur: data.importeEur,
        mensaje: data.mensaje,
        refundId: data.refundId,
        creditoId: data.creditoId,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { revertir, loading, error };
}
