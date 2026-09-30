'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authHeader } from '@/lib/api-client';
import { descargarBlob, nombreDeDescarga } from '@/lib/descargar-blob';
import { btnSecondary } from '@/components/configuracion/estilos';

type Formato = 'csv' | 'xml';

// Descarga de los registros de facturación Veri*Factu del estudio.
//
// Se enseña aunque el estudio ya NO emita facturas con Tentare: es justo cuando
// más falta hace llevarse sus registros (mandato, cláusula 8). Y no se enseña si
// no tiene ninguno. Solo la propietaria llega a esta pantalla; la ruta lo
// vuelve a comprobar.
export function ExportarRegistrosVerifactu() {
  const [total, setTotal] = useState<number | null>(null);
  const [bajando, setBajando] = useState<Formato | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/verifactu/exportacion', { headers: await authHeader(), cache: 'no-store' });
        if (!res.ok) return;
        const datos = await res.json().catch(() => null);
        if (vivo && typeof datos?.total === 'number') setTotal(datos.total);
      } catch {
        // Sin red: no se ofrece la descarga, y nada más.
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (!total) return null;

  async function bajar(formato: Formato) {
    setBajando(formato);
    setError(null);
    try {
      const res = await fetch(`/api/verifactu/exportacion?formato=${formato}`, { headers: await authHeader(), cache: 'no-store' });
      if (!res.ok) {
        const datos = await res.json().catch(() => null);
        setError(typeof datos?.error === 'string' ? datos.error : 'No se han podido descargar tus registros.');
        return;
      }
      descargarBlob(await res.blob(), nombreDeDescarga(res, `registros-verifactu.${formato}`));
    } catch {
      setError('No se han podido descargar tus registros. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      setBajando(null);
    }
  }

  const boton = (formato: Formato, texto: string) => (
    <button
      type="button"
      onClick={() => { void bajar(formato); }}
      disabled={bajando !== null}
      className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}
    >
      <Download size={14} aria-hidden />
      <span className="sr-only">Descargar tus registros de facturación en </span>
      {bajando === formato ? 'Preparando…' : texto}
    </button>
  );

  return (
    <div className="-mt-3 space-y-2 pb-6">
      <p className="text-sm text-muted-foreground text-pretty">
        <span className="font-medium text-foreground">
          {total === 1 ? '1 registro de facturación' : `${total} registros de facturación`}
        </span>
        {' '}— para tu gestoría o para guardarlos. En CSV se abren en Excel; en XML, cada registro va tal y como se genera para la AEAT.
      </p>
      <div className="flex flex-wrap gap-2">
        {boton('csv', 'CSV')}
        {boton('xml', 'XML')}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
