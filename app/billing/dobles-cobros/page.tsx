'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSessionEstudio } from '@/lib/id-estudio';
import { DoblesCobrosTable } from '@/components/billing/dobles-cobros-table';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface DobleCobroFila {
  id: string;
  recibo_id: string;
  importe_centimos: number;
  intentos_exitosos_count: number;
  primera_fecha: string;
  estado: string;
  socia_nombre?: string;
  socia_email?: string;
  payment_intent_ids?: string[];
}

export default function DoblesCobrosPage() {
  const { studioId } = useSessionEstudio();
  const [dobles, setDobles] = useState<DobleCobroFila[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDobles = async () => {
    if (!studioId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/billing/doble-cobro-detector?studio_id=${encodeURIComponent(studioId)}`,
      );

      if (!res.ok) {
        setError('Error al cargar dobles cobros');
        return;
      }

      const data = await res.json();
      setDobles(data.doblesCobros ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDobles();
  }, [studioId]);

  const handleRevertirSuccess = () => {
    // Recargar la lista después de una reversión exitosa
    fetchDobles();
  };

  const totalImporte = dobles.reduce((sum, d) => sum + d.importe_centimos, 0);
  const totalEur = (totalImporte / 100).toFixed(2);
  const pendientes = dobles.filter((d) => d.estado === 'PENDIENTE_REVISION').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Dobles Cobros</h1>
          </div>
          <p className="text-muted-foreground">
            Auditoría y resolución de cobros duplicados detectados en el sistema
          </p>
        </div>

        <Button onClick={fetchDobles} disabled={loading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats */}
      {dobles.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Total detectados</div>
            <div className="text-2xl font-bold">{dobles.length}</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Importe total</div>
            <div className="text-2xl font-bold">€{totalEur}</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Pendientes revisión</div>
            <div className="text-2xl font-bold">{pendientes}</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Tabla */}
      <DoblesCobrosTable dobles={dobles} loading={loading} onRevertirSuccess={handleRevertirSuccess} />
    </div>
  );
}
