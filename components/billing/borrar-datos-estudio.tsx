'use client';

// «Borrar ya los datos del estudio» (contrato de encargo, 2-oct-2026). Solo
// aparece con la suscripción terminada y para la propietaria: hasta el día del
// borrado puede descargar sus datos (justo encima, ExportarDatosEstudio) o pedir
// que se borren antes. Se confirma escribiendo el nombre del estudio, porque no
// se deshace. La regla y el registro viven en /api/estudio/supresion.

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { formatearFechaAviso } from '@/lib/retencion/ciclo-estudios-vencidos';
import { cn } from '@/lib/utils';

interface Estado { nombre: string; terminado: boolean; contratoTerminadoEn: string | null; borradoPrevistoEn: string | null; pedidaEn: string | null }

export function BorrarDatosEstudio({ className }: { className?: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const res = await fetch('/api/estudio/supresion', { headers: await authHeader(), cache: 'no-store' }).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) as Estado | null : null;
      if (vivo && data) setEstado(data);
    })();
    return () => { vivo = false; };
  }, []);

  if (!estado?.terminado) return null;

  async function pedir() {
    if (enviando) return;
    setEnviando(true); setError(null);
    try {
      const res = await fetch('/api/estudio/supresion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ confirmacion }),
      });
      const data = await res.json().catch(() => ({})) as { pedidaEn?: string; error?: string };
      if (!res.ok || !data.pedidaEn) { setError(data.error ?? 'No se ha podido registrar la petición'); return; }
      setEstado(e => (e ? { ...e, pedidaEn: data.pedidaEn ?? null } : e));
    } catch {
      setError('Error de conexión');
    } finally {
      setEnviando(false);
    }
  }

  const fecha = (iso: string | null) => (iso ? formatearFechaAviso(new Date(iso)) : '');

  return (
    <section aria-labelledby="borrar-datos-titulo" className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Trash2 size={16} className="text-destructive" aria-hidden="true" />
        <h3 id="borrar-datos-titulo" className="text-[14px] font-semibold text-foreground">Borrar ya los datos del estudio</h3>
      </div>
      {estado.pedidaEn ? (
        <p className="text-[12.5px] text-foreground">
          Lo pediste el {fecha(estado.pedidaEn)}. Borraremos los datos de tus clientas y tu equipo, y te lo confirmaremos por correo.
        </p>
      ) : (
        <>
          <p className="text-[12px] text-muted-foreground">
            Tu suscripción terminó el {fecha(estado.contratoTerminadoEn)}. Guardaremos los datos hasta el {fecha(estado.borradoPrevistoEn)} para
            que puedas descargarlos. Si no vas a volver, puedes pedir que los borremos ya: las fichas de tus clientas y tu equipo, la salud,
            las notas, los mensajes y las copias de seguridad. Descárgalos antes: después no se pueden recuperar. Las facturas y lo que la ley
            obliga a guardar se conservan durante su plazo.
          </p>
          <label htmlFor="confirmar-borrado" className="block text-[12px] font-semibold text-foreground">
            Escribe «{estado.nombre}» para confirmar
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="confirmar-borrado" value={confirmacion} onChange={e => setConfirmacion(e.target.value)} autoComplete="off"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm"
            />
            <button
              type="button" onClick={() => void pedir()} disabled={enviando || !confirmacion.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-[12.5px] font-bold disabled:opacity-50"
            >
              {enviando && <Loader2 size={14} className="animate-spin" aria-hidden />} Borrar los datos
            </button>
          </div>
          {error && <p role="alert" className="text-[12px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
        </>
      )}
    </section>
  );
}
