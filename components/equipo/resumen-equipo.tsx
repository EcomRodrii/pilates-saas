'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La parte de arriba de Equipo en el panel nuevo (14-oct-2026), con las piezas
// de la home (`components/dashboard/vivo.tsx`):
//
//   · Cuatro cifras: quién hay, cuántas clases hay esta semana, quién da más y,
//     para la propietaria, lo que cuesta el mes (para el resto, quién tiene
//     acceso, como la tarjeta de siempre).
//   · «Quién da las clases esta semana»: el reparto, persona a persona.
//   · «Quién no está»: las ausencias de los próximos 30 días, solo si hay
//     alguna. Si no se han podido leer, la pantalla las recibe vacías y no
//     distingue «ninguna» de «no lo sé», así que con cero no se dice nada.
//
// Todo sale de lo que la pantalla ya carga (las tarjetas, ya recortadas al rol
// de quien mira por `GET /api/equipo/tarjetas`, y las ausencias); las cuentas
// viven en `lib/equipo/cifras-equipo.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Euro, Plane, ShieldCheck, Star, Users } from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { CabeceraTarjeta, DEGRADADO_LOGO, TarjetaCifra } from '@/components/dashboard/vivo';
import { AUSENCIA_ETIQUETA } from '@/lib/ausencias';
import type { AusenciaInstructora } from '@/lib/api-client';
import type { MiembroCompleto } from '@/lib/equipo-tarjetas';
import { ausenciasProximas, quienMasClases, repartoSemana, sinTarifaConHoras, textoRangoAusencia } from '@/lib/equipo/cifras-equipo';
import { cn, hoyEnEstudio } from '@/lib/utils';

/** Cuántas filas del reparto se ven; el resto se cuenta debajo. */
const FILAS_REPARTO = 6;

const eurosSinDecimales = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const nombreCorto = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

export function CifrasEquipo({ tarjetas, cargando, esPropietaria, irACalendario, irARendimiento, irALiquidaciones }: {
  tarjetas: readonly MiembroCompleto[];
  cargando: boolean;
  esPropietaria: boolean;
  irACalendario: boolean;
  irARendimiento: boolean;
  irALiquidaciones: boolean;
}) {
  const activos = tarjetas.filter(m => m.activo).length;
  const deBaja = tarjetas.length - activos;
  const clases = tarjetas.reduce((a, m) => a + m.semana.reduce((x, y) => x + y, 0), 0);
  const reparto = useMemo(() => repartoSemana(tarjetas), [tarjetas]);
  const top = useMemo(() => quienMasClases(tarjetas), [tarjetas]);
  const conAcceso = tarjetas.filter(m => m.conAcceso).length;
  // Tu propia ficha no cuenta en el coste del equipo (como la tarjeta de siempre).
  const coste = tarjetas.reduce((a, m) => a + (m.esYo ? 0 : (m.costeMes ?? 0)), 0);
  const sinTarifa = esPropietaria ? sinTarifaConHoras(tarjetas) : 0;
  const v = (x: string) => (cargando ? '—' : x);

  return (
    // 2 × 2 hasta que caben cuatro con aire, como en la home.
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4" data-testid="cifras-equipo">
      <TarjetaCifra
        etiqueta="Tu equipo"
        tono="verde"
        Icono={Users}
        href={null}
        valor={v(String(activos))}
        abajo={cargando ? 'Cargando…' : `${activos === 1 ? 'persona activa' : 'personas activas'}${deBaja > 0 ? ` · ${deBaja} de baja` : ''}`}
      />
      <TarjetaCifra
        etiqueta="Clases esta semana"
        tono="azul"
        Icono={CalendarDays}
        href={irACalendario ? '/calendario' : null}
        valor={v(String(clases))}
        arriba={!cargando && reparto.length > 1 ? `entre ${reparto.length} personas` : undefined}
        abajo={cargando ? 'Cargando…' : clases === 0 ? 'Nadie tiene clases esta semana' : 'de lunes a domingo'}
      />
      <TarjetaCifra
        etiqueta="Más clases"
        tono="magenta"
        Icono={Star}
        href={irARendimiento ? '/equipo/rendimiento' : null}
        valor={v(top ? String(top.clases) : '—')}
        arriba={top ? `${nombreCorto(top.nombre)}${top.empatadas > 0 ? ` y ${top.empatadas} más` : ''}` : undefined}
        abajo={cargando ? 'Cargando…' : top ? `clase${top.clases === 1 ? '' : 's'} esta semana` : 'Nadie tiene clases esta semana'}
      />
      {esPropietaria ? (
        <TarjetaCifra
          etiqueta="Coste del mes"
          tono="indigo"
          Icono={Euro}
          href={irALiquidaciones ? '/equipo/liquidaciones' : null}
          valor={cargando ? '—' : <CifraPrivada inline>{eurosSinDecimales(coste)}</CifraPrivada>}
          arriba={!cargando && sinTarifa > 0
            ? <span style={{ color: 'var(--warning)' }}>{sinTarifa} sin tarifa</span>
            : undefined}
          abajo={cargando ? 'Cargando…' : sinTarifa > 0 ? 'no suman: ponles su tarifa por hora' : 'tarifa por hora × horas de clase del mes'}
        />
      ) : (
        <TarjetaCifra
          etiqueta="Con acceso"
          tono="indigo"
          Icono={ShieldCheck}
          href={null}
          valor={v(String(conAcceso))}
          abajo={cargando ? 'Cargando…' : `de ${tarjetas.length} en el equipo`}
        />
      )}
    </div>
  );
}

/** El reparto de la semana y quién no está: dos tarjetas, juntas en pantallas anchas. */
export function SemanaDelEquipo({ tarjetas, ausencias, onAbrirAusencias }: {
  tarjetas: readonly MiembroCompleto[];
  ausencias: readonly AusenciaInstructora[];
  /** Abre las ausencias de esa persona (quien gestiona el equipo); sin él, las filas no se pulsan. */
  onAbrirAusencias?: (instructorId: string) => void;
}) {
  // El día del estudio, fijado al montar: leer el reloj al pintar daría otra cosa en cada render.
  const [hoy] = useState(() => hoyEnEstudio());
  const reparto = useMemo(() => repartoSemana(tarjetas), [tarjetas]);
  const porId = useMemo(() => new Map(tarjetas.map(m => [m.id, m])), [tarjetas]);
  // Solo de quien sigue en el equipo: la ausencia de alguien ya de baja no cambia a quién pedir una clase.
  const fuera = useMemo(
    () => ausenciasProximas(ausencias, hoy).filter(a => porId.get(a.instructorId)?.activo),
    [ausencias, hoy, porId],
  );
  if (reparto.length === 0 && fuera.length === 0) return null;
  const max = reparto[0]?.clases ?? 1;
  const total = reparto.reduce((a, f) => a + f.clases, 0);

  return (
    <div className={cn('grid grid-cols-1 items-start gap-5', reparto.length > 0 && fuera.length > 0 && 'xl:grid-cols-2')}>
      {reparto.length > 0 && (
        <section aria-labelledby="reparto-semana" className="rounded-t-card border border-border bg-card p-4 shadow-t-card sm:p-5">
          <CabeceraTarjeta
            tono="azul"
            Icono={BarChart3}
            titulo="Quién da las clases esta semana"
            id="reparto-semana"
            sub={`${total} clase${total === 1 ? '' : 's'} programada${total === 1 ? '' : 's'}, de lunes a domingo`}
          />
          <ul className="mt-4 flex flex-col gap-2.5">
            {reparto.slice(0, FILAS_REPARTO).map(({ miembro: m, clases }) => (
              <li key={m.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2rem] items-center gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <ProfileAvatar avatarId={m.avatar} fotoUrl={m.fotoUrl} nombre={m.nombre} color={m.color} size="xs" />
                  <span className="truncate text-[13px] font-semibold text-foreground">{m.nombre}</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--foreground) 8%, transparent)' }} aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${Math.max((clases / max) * 100, 4)}%`, backgroundImage: DEGRADADO_LOGO }} />
                </span>
                <span className="text-right text-[13px] font-semibold tabular-nums text-foreground">
                  {clases}<span className="sr-only"> clase{clases === 1 ? '' : 's'}</span>
                </span>
              </li>
            ))}
          </ul>
          {reparto.length > FILAS_REPARTO && (
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              Y {reparto.length - FILAS_REPARTO} persona{reparto.length - FILAS_REPARTO === 1 ? '' : 's'} más con clases esta semana.
            </p>
          )}
        </section>
      )}

      {fuera.length > 0 && (
        <section aria-labelledby="quien-no-esta" className="overflow-hidden rounded-t-card border border-border bg-card shadow-t-card">
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            <CabeceraTarjeta tono="indigo" Icono={Plane} titulo="Quién no está" id="quien-no-esta" sub="Hoy y en los próximos 30 días" />
          </div>
          <ul className="mt-3 divide-y divide-muted">
            {fuera.map(a => {
              const m = porId.get(a.instructorId)!;
              const contenido = (
                <>
                  <ProfileAvatar avatarId={m.avatar} fotoUrl={m.fotoUrl} nombre={m.nombre} color={m.color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">{m.nombre}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{textoRangoAusencia(a.desde, a.hasta, hoy)}</span>
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color: 'var(--cat-5)', backgroundColor: 'color-mix(in srgb, var(--cat-5) 14%, var(--card))' }}
                  >
                    {AUSENCIA_ETIQUETA[a.tipo]}
                  </span>
                </>
              );
              const clase = 'flex w-full items-center gap-3 px-4 py-2.5 text-left sm:px-5';
              return (
                <li key={a.id}>
                  {onAbrirAusencias ? (
                    <button type="button" onClick={() => onAbrirAusencias(a.instructorId)} className={cn(clase, 'transition-colors hover:bg-muted')}>
                      {contenido}
                    </button>
                  ) : (
                    <div className={clase}>{contenido}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="pb-2" />
        </section>
      )}
    </div>
  );
}
