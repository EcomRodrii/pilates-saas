'use client';

// Lista de solicitudes RGPD PENDIENTES en Clientas, ordenadas por plazo.
//
// La solicitud se atiende en la ficha de la clienta (DerechosRgpdFicha), que es
// adonde lleva el aviso. Esta lista existe para que ninguna se pierda si nadie
// abrió el aviso, y cubre el único hueco que la ficha no puede: una clienta ya
// suprimida no tiene ficha, así que su solicitud se cierra desde aquí.
//
// Sin solicitudes no pinta nada; si no carga, lo dice.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { cerrarSolicitudDerechos, listarSolicitudesDerechos, type SolicitudConSocia } from '@/lib/socios/derechos-cliente';
import { etiquetaTipoSolicitud, textoPlazo } from '@/lib/socios/solicitudes-derechos';

export function SolicitudesDerechosPendientes() {
  const [solicitudes, setSolicitudes] = useState<SolicitudConSocia[] | null>(null);
  const [error, setError] = useState(false);
  const [ahoraMs, setAhoraMs] = useState(0);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [errorCierre, setErrorCierre] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await listarSolicitudesDerechos();
    setAhoraMs(Date.now());
    if (!r) { setError(true); return; }
    setError(false);
    setSolicitudes(r.solicitudes);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function marcarResuelta(s: SolicitudConSocia) {
    if (cerrando) return;
    setCerrando(s.id);
    setErrorCierre(null);
    const r = await cerrarSolicitudDerechos(s.id, 'resolver');
    setCerrando(null);
    if (!r.ok) { setErrorCierre(r.error); return; }
    await cargar();
  }

  if (error) {
    return <p className="text-[12px] text-destructive">No se han podido cargar las solicitudes sobre datos personales.</p>;
  }
  if (!solicitudes || solicitudes.length === 0) return null;

  const ahora = new Date(ahoraMs);
  return (
    <section
      className="rounded-xl p-4"
      style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 10%, var(--card))', border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert size={15} style={{ color: 'var(--warning)' }} />
        <h2 className="text-[13px] font-bold text-foreground">
          {solicitudes.length === 1 ? '1 solicitud sobre datos personales' : `${solicitudes.length} solicitudes sobre datos personales`}
        </h2>
      </div>
      <p className="text-[12px] text-muted-foreground mb-3">Las piden las clientas desde su app. Hay que responder dentro del plazo.</p>
      {errorCierre && <p className="text-[12px] text-destructive mb-2">{errorCierre}</p>}
      <ul className="space-y-2">
        {solicitudes.map(s => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 bg-card border border-border rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">
                {s.socia?.nombre || 'Clienta'} · {etiquetaTipoSolicitud(s.tipo)}
              </p>
              <p className="text-[11px] text-muted-foreground">{textoPlazo(s.plazoHasta, ahora)}</p>
            </div>
            {s.socia?.suprimida ? (
              <button
                onClick={() => void marcarResuelta(s)}
                disabled={cerrando !== null}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-border hover:bg-muted disabled:opacity-50"
              >
                {cerrando === s.id ? 'Cerrando…' : 'Sus datos ya se eliminaron: marcar como atendida'}
              </button>
            ) : (
              <Link href={`/clientas/${s.socioId}`} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-border hover:bg-muted">
                Atender en su ficha
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
