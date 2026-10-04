'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { etiquetaDia } from '@/lib/student/formato';
import { nuevoIntento, previsualizarProximas, reservarProximas, type DatosProximas, type OcurrenciaVista, type ResultadoProximas } from '@/lib/student/reservar-proximas';
import {
  NO_SE_RENUEVA, cancelacion, clase, etiquetaOcurrencia, resumenFinal, resumenPrevio,
} from '@/lib/student/reservar-proximas-textos';
import { MIN_PROXIMAS, opcionesDeN } from '@/lib/reservas/proximas-reglas';
import { Badge } from '@/components/student/ui/Badge';
import { Button } from '@/components/student/ui/Button';
import { Skeleton } from '@/components/student/ui/States';

// «Reservar las próximas clases» con bono: para quien solo tiene bono y no puede tener una clase fija (que es de cuota). NO es
// una clase fija: son N reservas normales, una por semana a la misma hora, cada una descontando su sesión del bono cuando se
// reserva. No se renueva sola. Va en la ficha de la clase, en el sitio del interruptor «Clase fija», que sin cuota no existe.
//
// ⚠️ No decide nada. Primero se le ENSEÑA qué se reservaría (vista previa, sin escribir nada); lo que pasa de verdad lo dice el
// servidor al reservar. El número de sesiones que le quedan viene del servidor, no de esta pantalla.

const tonoDe = (o: OcurrenciaVista): 'ok' | 'booked' | 'neutral' | 'few' =>
  o.resultado === 'SE_RESERVARA' ? 'ok' : o.resultado === 'RESERVADA' || o.resultado === 'YA_RESERVADA' ? 'booked'
    : o.resultado === 'COMPLETA' || o.resultado === 'CERRADA' || o.resultado === 'NO_INTENTADA' ? 'neutral' : 'few';

export function ReservarProximas({ sesionId, saldo, ventanaCancelacionHoras, onReservadas }: {
  sesionId: string;
  /** Tras reservar (lo que contestó el servidor): la pantalla de detrás vuelve a leer sus reservas. */
  onReservadas?: () => void;
  /** Las sesiones que le quedan del bono que cubre esta clase. */
  saldo: number;
  ventanaCancelacionHoras: number;
}) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const opciones = opcionesDeN(saldo);
  const [n, setN] = useState<number>(() => (opciones.includes(4) ? 4 : opciones[opciones.length - 1] ?? MIN_PROXIMAS));
  // El intento: se renueva al cambiar N y tras cualquier respuesta COMPLETA del servidor; se CONSERVA si la red falló, para que
  // un reintento sea una repetición y no duplique reservas.
  const [intento, setIntento] = useState(nuevoIntento);
  const [reservando, setReservando] = useState(false);
  const [hecho, setHecho] = useState<DatosProximas | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(() => previsualizarProximas(estudio.id, sesionId, n), [estudio.id, sesionId, n]);
  const { data: vista, estado, reintentar } = useAsync<ResultadoProximas>(cargar, () => false);

  async function reservar() {
    if (reservando || hecho) return;
    setReservando(true);
    setError('');
    const r = await reservarProximas(estudio.slug, estudio.id, sesionId, n, intento);
    setReservando(false);
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setError(r.error);
      // Una respuesta del servidor cierra el intento; un fallo de red NO (no se sabe qué llegó a hacerse).
      if (!r.sinConexion) setIntento(nuevoIntento());
      return;
    }
    setHecho(r.datos);
    setIntento(nuevoIntento());
    onReservadas?.();
  }

  if (opciones.length === 0) return null;
  const datos = hecho ?? (vista && vista.ok ? vista.datos : null);
  const previo = !hecho && datos ? datos : null;

  return (
    <section data-testid="reservar-proximas" className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800 }}>Reserva las próximas clases con tu bono</p>
        {/* El saldo es el de ANTES de reservar: con las clases ya reservadas, el resumen de abajo dice cuántas quedan, y
            dejar esta frase decía «Tienes 8» justo encima de «te quedan 4». */}
        {!hecho && (
          <p className="t-meta" style={{ margin: '3px 0 0' }}>
            Una clase cada semana, a la misma hora. Tienes {saldo === 1 ? '1 sesión' : `${saldo} sesiones`} en tu bono.
          </p>
        )}
      </div>

      {!hecho && (
        <div role="group" aria-label="Cuántas clases" style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {opciones.map((o) => (
            <button
              key={o} type="button" className="pill" aria-pressed={o === n} disabled={reservando}
              onClick={() => { if (o !== n) { setN(o); setError(''); setIntento(nuevoIntento()); } }}
            >
              {o === saldo && o !== 2 && o !== 4 && o !== 8 ? `Todas las que me quedan (${o})` : `${o} clases`}
            </button>
          ))}
        </div>
      )}

      {!hecho && estado === 'loading' && <Skeleton h={96} r={14} />}
      {!hecho && estado !== 'loading' && vista && !vista.ok && (
        <p role="alert" data-testid="proximas-error" className="t-meta" style={{ margin: 0, color: 'var(--danger, #b00020)', fontWeight: 700 }}>
          {vista.error}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={reintentar}>Reintentar</button>
        </p>
      )}

      {datos && (
        <ul data-testid="proximas-lista" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {datos.ocurrencias.map((o) => (
            <li key={o.sesionId} data-testid="proxima-ocurrencia" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--t-small)', fontWeight: 700 }}>{etiquetaDia(o.fecha)} · {o.hora}</span>
              <Badge tone={tonoDe(o)}>{etiquetaOcurrencia(o)}</Badge>
            </li>
          ))}
        </ul>
      )}

      {previo && (
        <>
          <p data-testid="proximas-resumen" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700 }}>
            {resumenPrevio({ reservadas: previo.resumen.reservadas, descontadas: previo.resumen.descontadas, bono: previo.bono })}
          </p>
          <p className="t-meta" style={{ margin: 0 }}>{NO_SE_RENUEVA} {cancelacion(ventanaCancelacionHoras)}</p>
          {error && <p role="alert" data-testid="proximas-error" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--danger, #b00020)' }}>{error}</p>}
          <Button full loading={reservando} disabled={!online || previo.resumen.reservadas === 0} onClick={() => void reservar()}>
            {previo.resumen.reservadas > 0 ? `Reservar ${clase(previo.resumen.reservadas)}` : 'No hay clases que reservar'}
          </Button>
        </>
      )}

      {hecho && (
        <>
          <p role="status" data-testid="proximas-hecho" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 800 }}>
            {resumenFinal({
              reservadas: hecho.resumen.reservadas, pedidas: hecho.resumen.pedidas, descontadas: hecho.resumen.descontadas,
              saldoDespues: hecho.bono?.saldoDespues ?? null, paro: hecho.resumen.paro,
            })}
          </p>
          <Link href={href('/mis-reservas')} className="btn btn--secondary" style={{ height: 46, justifyContent: 'center' }}>Ver mis clases</Link>
        </>
      )}
    </section>
  );
}
