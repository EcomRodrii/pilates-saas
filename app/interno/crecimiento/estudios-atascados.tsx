'use client';

// Estudios atascados: quién empezó el alta y lleva 3 días o más sin avanzar, para
// que el fundador le escriba en persona. Nada se manda solo: «Escribir» abre el
// correo del fundador con el mensaje preparado, y «Marcar contactado» deja
// constancia (solo inserción, con fecha). Sección con su propio permiso
// (growth.read): si falta, no se pinta. Anotar exige crm.update.

import { useCallback, useEffect, useState } from 'react';
import {
  anotarSeguimientoAtascado, fetchEstudiosAtascados, type EstudiosAtascados,
} from '@/lib/interno/client';
import {
  ETIQUETA_ESTADO, mailtoContacto, UMBRAL_DIAS_ATASCO, type AccionSeguimiento, type AlertaAtascada, type SituacionAlerta,
} from '@/lib/alta/atascados';

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }) : '—';

const ETIQUETA_SITUACION: Record<SituacionAlerta, string> = {
  pendiente: 'Pendiente',
  contactada: 'Contactada',
  pospuesta: 'Pospuesta',
  cerrada: 'Cerrada',
};
const TONO: Record<SituacionAlerta, string> = {
  pendiente: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  contactada: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  pospuesta: 'bg-muted text-muted-foreground',
  cerrada: 'bg-muted text-muted-foreground',
};

export function EstudiosAtascadosSeccion() {
  const [d, setD] = useState<EstudiosAtascados | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  const cargar = useCallback(() => {
    void fetchEstudiosAtascados()
      .then((r) => { if (Array.isArray(r?.alertas) && r.resumen) setD(r); })
      .catch(() => {});
  }, []);
  useEffect(cargar, [cargar]);

  if (!d) return null;

  async function anotar(a: AlertaAtascada, accion: AccionSeguimiento, extra: { dias?: number } = {}) {
    if (ocupada) return; // un solo clic a la vez: nada de dobles anotaciones
    setOcupada(a.fila.clave);
    setError(null);
    try {
      await anotarSeguimientoAtascado({ clave: a.fila.clave, accion, ...extra });
      cargar();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se ha podido guardar. Inténtalo otra vez.');
    } finally {
      setOcupada(null);
    }
  }

  const visibles = d.alertas.filter((a) => verTodas || a.situacion === 'pendiente' || a.situacion === 'contactada');
  const { resumen } = d;

  return (
    <section data-testid="estudios-atascados">
      <h2 className="mb-1 text-[13px] font-bold text-foreground">Estudios atascados</h2>
      <p className="mb-2.5 text-[12px] text-muted-foreground">
        Quien empezó el alta y lleva {UMBRAL_DIAS_ATASCO} días o más sin avanzar y aún no puede recibir reservas. Escríbele tú:
        no se manda nada solo. Quedan fuera las cuentas de prueba, las internas y las ya activadas.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(['pendiente', 'contactada', 'pospuesta', 'cerrada'] as const).map((s) => {
          const n = s === 'pendiente' ? resumen.pendientes : s === 'contactada' ? resumen.contactadas : s === 'pospuesta' ? resumen.pospuestas : resumen.cerradas;
          return <span key={s} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TONO[s]}`}>{ETIQUETA_SITUACION[s]}: {n}</span>;
        })}
        <button
          type="button"
          onClick={() => setVerTodas((v) => !v)}
          aria-pressed={verTodas}
          className="ml-auto rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {verTodas ? 'Ocultar pospuestas y cerradas' : 'Ver también pospuestas y cerradas'}
        </button>
      </div>

      <div role="status" aria-live="polite">
        {error && <p className="mb-2 rounded-xl bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-3.5 text-[12.5px] text-muted-foreground">
          Ahora mismo no hay ningún estudio atascado.
        </p>
      ) : (
        <ul className="rounded-2xl border border-border bg-card">
          {visibles.map((a) => {
            const mailto = mailtoContacto(a);
            const bloqueada = ocupada === a.fila.clave;
            return (
              <li key={a.fila.clave} data-testid="estudio-atascado" className="grid gap-1.5 border-b border-border/60 px-4 py-3 text-[12.5px] last:border-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="text-foreground">{a.fila.nombre ?? 'Sin nombre'}</strong>
                  <span className="break-all text-muted-foreground">{a.fila.email ?? 'sin email'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${TONO[a.situacion]}`}>{ETIQUETA_SITUACION[a.situacion]}</span>
                  <span className="ml-auto tabular-nums font-semibold text-foreground">{a.diasSinActividad} días sin actividad</span>
                </div>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{ETIQUETA_ESTADO[a.estado]}</span>
                  {' · '}Último paso: {a.ultimoPaso}
                  {' · '}Alta {fecha(a.fila.altaEn)} · Última actividad {fecha(a.ultimaActividad)}
                </p>
                {a.motivo && <p className="text-muted-foreground">Motivo probable: {a.motivo}</p>}
                {a.fila.seguimiento && (
                  <p className="text-muted-foreground">
                    {a.fila.seguimiento.accion === 'contactado' && `Contactado el ${fecha(a.fila.seguimiento.creadoEn)}.`}
                    {a.fila.seguimiento.accion === 'pospuesta' && `Pospuesta hasta el ${fecha(a.fila.seguimiento.hasta)}.`}
                    {a.fila.seguimiento.accion === 'cerrada' && `Cerrada el ${fecha(a.fila.seguimiento.creadoEn)}.`}
                    {a.fila.seguimiento.accion === 'reabierta' && `Reabierta el ${fecha(a.fila.seguimiento.creadoEn)}.`}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {mailto && (
                    <a href={mailto} className="rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2">
                      Escribirle
                    </a>
                  )}
                  {a.situacion === 'pospuesta' || a.situacion === 'cerrada' ? (
                    <Boton disabled={bloqueada} onClick={() => void anotar(a, 'reabierta')}>Reabrir</Boton>
                  ) : (
                    <>
                      <Boton disabled={bloqueada} onClick={() => void anotar(a, 'contactado')}>Marcar contactado</Boton>
                      <Boton disabled={bloqueada} onClick={() => void anotar(a, 'pospuesta', { dias: 7 })}>Posponer 7 días</Boton>
                      <Boton disabled={bloqueada} onClick={() => void anotar(a, 'cerrada')}>Cerrar</Boton>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Boton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {children}
    </button>
  );
}
