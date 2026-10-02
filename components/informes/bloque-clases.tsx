'use client';

// «Clases» (rediseño del 2-oct-2026, decisiones 11, F3 y F5): UNA tabla por tipo
// de clase. Cada tipo se despliega por franja (día y hora) y cada franja, por
// clase: fecha, instructora, asistentes y el margen con su punto de equilibrio.
// «Clases más populares» ya no es un bloque aparte: es esta tabla.
//
// Dos reglas distintas, y se dicen las dos:
// · Ocupación (`lib/informes/clases.ts`): vinieron + faltaron + sin pasar lista.
// · Asistentes del margen (`lib/decision/margen-clase.ts`, que también usa el
//   Centro de Control y no se toca): vinieron + sin pasar lista, sin las faltas.

import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn, fechaLargaEstudio, horaEstudio } from '@/lib/utils';
import type { ClasesDelTramo, SesionDelInforme, TipoDelInforme } from '@/lib/informes/clases';
import type { MargenSesion } from '@/lib/decision/margen-clase';
import { CabeceraBloque, conSigno, Euros, frenteA, tonoDiferencia } from './piezas';

export interface NombresClases {
  tipo: (id: string) => string | undefined;
  instructora: (id: string) => string | undefined;
}

/** La suma de los márgenes que se saben; `null` si no se sabe ninguno. */
function margenDe(sesiones: readonly SesionDelInforme[], margenes: ReadonlyMap<string, MargenSesion>) {
  let total = 0, sabidas = 0;
  for (const s of sesiones) {
    const m = margenes.get(s.sesionId)?.margen;
    if (m == null) continue;
    total += m; sabidas++;
  }
  return sabidas === 0 ? null : { total: Math.round(total * 100) / 100, sinTarifa: sesiones.length - sabidas };
}

function CeldaMargen({ sesiones, margenes }: { sesiones: readonly SesionDelInforme[]; margenes: ReadonlyMap<string, MargenSesion> }) {
  const m = margenDe(sesiones, margenes);
  if (!m) return <span className="text-muted-foreground" title="Sin tarifa de instructora: no se inventa un coste">—</span>;
  return (
    <span
      className={cn('font-semibold tabular-nums', m.total < 0 ? 'text-destructive' : 'text-foreground')}
      title={m.sinTarifa > 0 ? `${m.sinTarifa} ${m.sinTarifa === 1 ? 'clase no cuenta' : 'clases no cuentan'}: su instructora no tiene tarifa` : undefined}
    >
      <Euros n={m.total} />{m.sinTarifa > 0 && '*'}
    </span>
  );
}

const pct = (n: number | null) => (n == null ? '—' : `${n} %`);

export function BloqueClases({ clases, anterior, comparacion, margenes, nombres }: {
  clases: ClasesDelTramo;
  anterior: ClasesDelTramo | null;
  comparacion: string | null;
  margenes: ReadonlyMap<string, MargenSesion>;
  nombres: NombresClases;
}) {
  const [tiposAbiertos, setTiposAbiertos] = useState<ReadonlySet<string>>(new Set());
  const [franjasAbiertas, setFranjasAbiertas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (set: (f: (s: ReadonlySet<string>) => ReadonlySet<string>) => void, clave: string) =>
    set(s => { const n = new Set(s); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
  const anteriorPorTipo = new Map((anterior?.tipos ?? []).map(t => [t.tipoClaseId, t]));
  const hayMargenSinTarifa = clases.sesiones.some(s => margenes.get(s.sesionId)?.margen == null);

  return (
    <section aria-labelledby="informe-clases" className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <CabeceraBloque id="informe-clases" titulo="Clases">
        Las clases ya empezadas del periodo. Ocupación: plazas reservadas sobre el aforo, vinieran o no (una falta también
        ocupó la plaza). Despliega un tipo para verlo por franja, y una franja para ver cada clase con su margen.
      </CabeceraBloque>

      {clases.nClases === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">No hay clases ya empezadas en este periodo.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[620px] text-[13px]" data-testid="informe-tabla-clases">
            <thead>
              <tr className="text-left text-[12px] text-muted-foreground">
                <th className="pb-2 font-medium">Clase</th>
                <th className="pb-2 text-right font-medium">Clases</th>
                <th className="pb-2 text-right font-medium">Plazas</th>
                <th className="pb-2 text-right font-medium">Ocupación</th>
                <th className="pb-2 text-right font-medium" title={comparacion ? frenteA(comparacion) : undefined}>Antes</th>
                <th className="pb-2 text-right font-medium" title="Sobre el coste de instructora; no incluye la sala">Margen</th>
              </tr>
            </thead>
            <tbody>
              {clases.tipos.map(t => (
                <FilasTipo
                  key={t.tipoClaseId} tipo={t} anterior={anteriorPorTipo.get(t.tipoClaseId) ?? null}
                  abierto={tiposAbiertos.has(t.tipoClaseId)} onAlternar={() => alternar(setTiposAbiertos, t.tipoClaseId)}
                  franjasAbiertas={franjasAbiertas} onAlternarFranja={c => alternar(setFranjasAbiertas, c)}
                  margenes={margenes} nombres={nombres}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12px] text-muted-foreground text-pretty">
        «Antes»: cuántos puntos sube o baja la ocupación {frenteA(comparacion ?? 'el periodo anterior')}.
        {' '}Margen: lo que dejaron sus asistentes menos el coste de la instructora (sin la sala). Para el margen, asistentes son
        las que vinieron y las que tenían plaza sin pasar lista; las que no se presentaron no cuentan.
        {hayMargenSinTarifa && ' Las clases de una instructora sin tarifa no tienen margen: no se inventa un coste (*).'}
      </p>
    </section>
  );
}

function FilasTipo({ tipo, anterior, abierto, onAlternar, franjasAbiertas, onAlternarFranja, margenes, nombres }: {
  tipo: TipoDelInforme;
  anterior: TipoDelInforme | null;
  abierto: boolean;
  onAlternar: () => void;
  franjasAbiertas: ReadonlySet<string>;
  onAlternarFranja: (clave: string) => void;
  margenes: ReadonlyMap<string, MargenSesion>;
  nombres: NombresClases;
}) {
  const puntos = anterior && tipo.pct != null && anterior.pct != null ? tipo.pct - anterior.pct : null;
  const sesiones = tipo.franjas.flatMap(f => f.sesiones);
  return (
    <>
      <tr className="border-t border-border">
        <td className="py-2">
          <button type="button" onClick={onAlternar} aria-expanded={abierto} className="inline-flex items-center gap-1 text-left font-medium text-foreground">
            <ChevronRight size={14} className={cn('shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-90')} aria-hidden />
            {nombres.tipo(tipo.tipoClaseId) ?? 'Tipo de clase borrado'}
          </button>
        </td>
        <td className="py-2 text-right tabular-nums">{tipo.nClases}</td>
        <td className="py-2 text-right tabular-nums">{tipo.ocupadas}/{tipo.aforo}</td>
        <td className="py-2 text-right font-semibold tabular-nums text-foreground">{pct(tipo.pct)}</td>
        <td className={cn('py-2 text-right tabular-nums', tonoDiferencia(puntos))}>{puntos == null ? '—' : conSigno(puntos)}</td>
        <td className="py-2 text-right"><CeldaMargen sesiones={sesiones} margenes={margenes} /></td>
      </tr>
      {abierto && tipo.franjas.map(f => {
        const clave = `${tipo.tipoClaseId}|${f.clave}`;
        const fAbierta = franjasAbiertas.has(clave);
        return (
          <Fragment key={clave}>
            <tr className="border-t border-border/60 bg-muted/30">
              <td className="py-1.5 pl-5">
                <button type="button" onClick={() => onAlternarFranja(clave)} aria-expanded={fAbierta} className="inline-flex items-center gap-1 text-left text-foreground">
                  <ChevronRight size={13} className={cn('shrink-0 text-muted-foreground transition-transform', fAbierta && 'rotate-90')} aria-hidden />
                  {f.texto}
                </button>
              </td>
              <td className="py-1.5 text-right tabular-nums">{f.nClases}</td>
              <td className="py-1.5 text-right tabular-nums">{f.ocupadas}/{f.aforo}</td>
              <td className="py-1.5 text-right tabular-nums text-foreground">{pct(f.pct)}</td>
              <td className="py-1.5" />
              <td className="py-1.5 text-right"><CeldaMargen sesiones={f.sesiones} margenes={margenes} /></td>
            </tr>
            {fAbierta && (
              <tr className="bg-muted/30">
                <td colSpan={6} className="pb-3 pl-10 pr-2">
                  <DetalleSesiones sesiones={f.sesiones} margenes={margenes} nombres={nombres} />
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** El tercer nivel (F5): cada clase con su margen y su punto de equilibrio. */
function DetalleSesiones({ sesiones, margenes, nombres }: { sesiones: SesionDelInforme[]; margenes: ReadonlyMap<string, MargenSesion>; nombres: NombresClases }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-left text-[11.5px] text-muted-foreground">
          <th className="py-1 font-medium">Fecha</th>
          <th className="py-1 font-medium">Instructora</th>
          <th className="py-1 text-right font-medium" title="Vinieron y plazas sin pasar lista">Asistentes</th>
          <th className="py-1 text-right font-medium">Ingreso</th>
          <th className="py-1 text-right font-medium">Coste</th>
          <th className="py-1 text-right font-medium">Margen</th>
          <th className="py-1 text-right font-medium" title="Cuántas alumnas tienen que venir para que la clase no dé pérdidas">Equilibrio</th>
        </tr>
      </thead>
      <tbody>
        {sesiones.map(s => {
          const m = margenes.get(s.sesionId);
          return (
            <tr key={s.sesionId} className="border-t border-border/60">
              <td className="whitespace-nowrap py-1 text-foreground">{fechaLargaEstudio(s.inicio)} · {horaEstudio(s.inicio)}</td>
              <td className="py-1 text-foreground">{nombres.instructora(s.instructorId) ?? '—'}</td>
              <td className="py-1 text-right tabular-nums">{m?.asistentes ?? '—'}</td>
              <td className="py-1 text-right tabular-nums">{m ? <Euros n={m.ingresoImputado} /> : '—'}</td>
              <td className="py-1 text-right tabular-nums">{m?.costeInstructora == null ? '— (sin tarifa)' : <Euros n={m.costeInstructora} />}</td>
              <td className={cn('py-1 text-right font-semibold tabular-nums', m?.margen == null ? 'text-muted-foreground' : m.margen < 0 ? 'text-destructive' : 'text-foreground')}>
                {m?.margen == null ? '—' : <Euros n={m.margen} />}
              </td>
              <td className="py-1 text-right tabular-nums">{m?.breakEvenAsistentes ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
