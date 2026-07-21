'use client';

import { useMemo } from 'react';
import { UserX, Clock } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { riesgoNoShow, explicarRiesgo, type ReservaHistorica, type RiesgoNoShow } from '@/lib/no-show';

// Riesgo de plantón en las clases que vienen. Solo INFORMA (no manda nada): el
// recordatorio genérico previo a clase ya lo cubre la automatización CLASE_MANANA,
// así que aquí no se envía ningún email — se le enseña al propietario dónde tiene
// plazas en riesgo para que decida.

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

  if (filas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Riesgo de plantón
      </h2>
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
      <p className="px-1 text-[11px] text-muted-foreground">
        Basado en su historial reciente de asistencia. Solo informativo — no se envía ningún aviso automático.
      </p>
    </div>
  );
}
