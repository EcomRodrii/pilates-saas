'use client';

import { useEffect, useMemo, useState } from 'react';
import { UserX, Clock } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { riesgoNoShow, explicarRiesgo, type ReservaHistorica, type RiesgoNoShow } from '@/lib/no-show';
import { obtenerConfirmacionRiesgo, actualizarConfirmacionRiesgo } from '@/lib/api-client';

// Riesgo de plantón en las clases que vienen. El recordatorio genérico previo a
// clase ya lo cubre la automatización CLASE_MANANA, así que este panel por sí
// solo no envía nada — solo enseña al propietario dónde tiene plazas en riesgo.
//
// El toggle de abajo es la "opción 2" (lib/confirmacion-riesgo): pedir
// confirmación de verdad a quien tiene riesgo ALTO y, si no responde a tiempo,
// liberar su plaza a la lista de espera. Apagado por defecto — es una acción
// real sobre una reserva de pago, el estudio la enciende conscientemente.

const DIAS_VISTA = 7;
const OCUPA_PLAZA = ['CONFIRMADA', 'ASISTIDA'];

interface FilaRiesgo {
  sesionId: string;
  inicio: string;
  claseNombre: string;
  enRiesgo: { nombre: string; riesgo: RiesgoNoShow }[];
  totalPlazas: number;
}

function fmtCuando(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const esHoy = d.toDateString() === hoy.toDateString();
  const manana = new Date(hoy.getTime() + 86400000);
  const esManana = d.toDateString() === manana.toDateString();
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (esHoy) return `Hoy ${hora}`;
  if (esManana) return `Mañana ${hora}`;
  return `${d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })} ${hora}`;
}

export function RiesgoPlanton() {
  const { sesiones, reservas, socios, tiposClase } = useStudio();
  const [activo, setActivo] = useState<boolean | null>(null); // null = cargando
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    obtenerConfirmacionRiesgo().then(r => { if (vivo) setActivo('activo' in r ? r.activo : false); });
    return () => { vivo = false; };
  }, []);

  async function toggle() {
    const nuevo = !activo;
    setActivo(nuevo); // optimista
    setGuardando(true);
    const r = await actualizarConfirmacionRiesgo(nuevo);
    if ('error' in r) { setActivo(!nuevo); alert(r.error); }
    setGuardando(false);
  }

  const filas = useMemo<FilaRiesgo[]>(() => {
    const now = new Date();
    const hasta = now.getTime() + DIAS_VISTA * 86400000;

    // Índices en UNA pasada sobre reservas (P0-30: recorrer `reservas` por cada
    // sesión era O(sesiones × reservas) y el repo ya lo había corregido en
    // /reservar; aquí se repetía el mismo error).
    const sesionPorId = new Map(sesiones.map(s => [s.id, s]));
    const historialPorSocio = new Map<string, ReservaHistorica[]>();
    const apuntadasPorSesion = new Map<string, string[]>(); // sesionId → socioIds
    for (const r of reservas) {
      if (!r.socioId) continue;
      const ses = sesionPorId.get(r.sesionId);
      if (!ses) continue;
      const arr = historialPorSocio.get(r.socioId) ?? [];
      arr.push({ estado: r.estado, fecha: ses.inicio });
      historialPorSocio.set(r.socioId, arr);
      if (OCUPA_PLAZA.includes(r.estado)) {
        const ap = apuntadasPorSesion.get(r.sesionId) ?? [];
        ap.push(r.socioId);
        apuntadasPorSesion.set(r.sesionId, ap);
      }
    }

    // El riesgo se calcula UNA vez por socia, no una vez por plaza: una misma
    // socia apuntada a varias clases de la semana se recalculaba en cada una.
    const riesgoPorSocio = new Map<string, ReturnType<typeof riesgoNoShow>>();
    const riesgoDe = (socioId: string) => {
      let r = riesgoPorSocio.get(socioId);
      if (!r) { r = riesgoNoShow(historialPorSocio.get(socioId) ?? [], now); riesgoPorSocio.set(socioId, r); }
      return r;
    };

    const socioPorId = new Map(socios.map(s => [s.id, s]));
    const tipoPorId = new Map(tiposClase.map(t => [t.id, t]));

    const out: FilaRiesgo[] = [];
    for (const s of sesiones) {
      const t = new Date(s.inicio).getTime();
      if (s.cancelada || t < now.getTime() || t > hasta) continue;

      const apuntadas = apuntadasPorSesion.get(s.id) ?? [];
      if (apuntadas.length === 0) continue;

      const enRiesgo = apuntadas
        .map(socioId => ({ nombre: socioPorId.get(socioId)?.nombre ?? 'Clienta', riesgo: riesgoDe(socioId) }))
        .filter(x => x.riesgo.nivel === 'ALTO')
        .sort((a, b) => b.riesgo.score - a.riesgo.score);

      if (enRiesgo.length === 0) continue;
      out.push({
        sesionId: s.id, inicio: s.inicio,
        claseNombre: tipoPorId.get(s.tipoClaseId)?.nombre ?? 'Clase',
        enRiesgo, totalPlazas: apuntadas.length,
      });
    }
    return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [sesiones, reservas, socios, tiposClase]);

  // El toggle SIEMPRE se ve, aunque ahora mismo no haya nadie en riesgo — si no,
  // quien quiera encenderlo por primera vez nunca vería dónde hacerlo.
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Riesgo de plantón
        </h2>
        <label className="flex items-center gap-2 cursor-pointer text-[12px] text-muted-foreground select-none">
          Pedir confirmación
          <button
            type="button" role="switch" aria-checked={!!activo} onClick={toggle} disabled={activo === null || guardando}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 ${activo ? 'bg-brand' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-4' : ''}`} />
          </button>
        </label>
      </div>
      {filas.length === 0 ? (
        <p className="px-1 text-[12px] text-muted-foreground">Ninguna plaza en riesgo en los próximos {DIAS_VISTA} días.</p>
      ) : (
      <div className="rounded-3xl border border-border bg-card p-1">
        {filas.map(f => (
          <div key={f.sesionId} className="flex items-start justify-between gap-3 rounded-2xl px-4 py-3 hover:bg-muted/50">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                <UserX size={14} className="text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">
                  {f.claseNombre} <span className="font-normal text-muted-foreground">· {f.totalPlazas} apuntadas</span>
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {f.enRiesgo.map(x => `${x.nombre} (${explicarRiesgo(x.riesgo)})`).join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
                <Clock size={12} />{fmtCuando(f.inicio)}
              </span>
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                {f.enRiesgo.length} en riesgo
              </span>
            </div>
          </div>
        ))}
      </div>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">
        Basado en su historial reciente de asistencia.{' '}
        {activo
          ? 'Con la confirmación activada, se les pide venir y se libera su plaza si no responden a tiempo.'
          : 'Solo informativo — no se envía ningún aviso automático.'}
      </p>
    </div>
  );
}
