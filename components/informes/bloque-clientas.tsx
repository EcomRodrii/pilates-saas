'use client';

// «Clientas» (rediseño del 2-oct-2026, decisiones 11, F2 y F3): las que más
// vienen —por clases a las que VINIERON, sin medallas—, las nuevas del periodo,
// las activas HOY (que no dependen del periodo, y se dice) y las cohortes, que
// tampoco dependen de él.

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { DIAS_VINO_HACE_POCO, type ConteosEstado } from '@/lib/clientas/estado';
import { MUESTRA_MINIMA_COHORTE, type FilaCohorte, type TramoCohorte } from '@/lib/informes/cohortes';
import type { ClientasDelTramo } from '@/lib/informes/clientas';
import { CabeceraBloque, conSigno, frenteA, tonoDiferencia } from './piezas';

// «may 26»: el mes de una cohorte ('YYYY-MM'), sin depender de la zona del navegador.
const FORMATO_MES_COHORTE = new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' });
function etiquetaMes(ym: string): string {
  return FORMATO_MES_COHORTE.format(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 15)));
}

/** Una celda de cohorte: «3 · 60 %», solo «3» con pocas, o «—» si todavía no se sabe. */
function CeldaCohorte({ tramo }: { tramo: TramoCohorte | null }) {
  if (!tramo) return <span title="Todavía no ha pasado ese mes entero para todas las que empezaron entonces" className="text-muted-foreground">—</span>;
  if (tramo.pct === null) return <span className="tabular-nums text-foreground" title={`Menos de ${MUESTRA_MINIMA_COHORTE}: pocas para sacar un porcentaje`}>{tramo.siguen}</span>;
  return <span className="tabular-nums text-foreground">{tramo.siguen} <span className="font-semibold">· {tramo.pct} %</span></span>;
}

export function BloqueClientas({ clientas, nuevas, nuevasAntes, comparacion, sinPasarLista, nombreDe, conteos, cohortes, cohortesListas }: {
  clientas: ClientasDelTramo;
  nuevas: number;
  nuevasAntes: number | null;
  comparacion: string | null;
  sinPasarLista: boolean;
  nombreDe: (socioId: string) => string;
  conteos: ConteosEstado | null;
  cohortes: FilaCohorte[];
  cohortesListas: boolean;
}) {
  const max = clientas.lasQueMasVienen[0]?.clases ?? 1;
  const difNuevas = nuevasAntes == null ? null : nuevas - nuevasAntes;

  return (
    <section aria-labelledby="informe-clientas" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <CabeceraBloque id="informe-clientas" titulo="Clientas" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="text-[12.5px] text-muted-foreground">Activas hoy</p>
          {conteos ? (
            <Link href="/clientas?estado=ACTIVA" className="text-[24px] font-semibold tabular-nums text-foreground underline-offset-4 hover:underline">
              {conteos.ACTIVA}
            </Link>
          ) : (
            <p className="text-[24px] font-semibold text-muted-foreground">—</p>
          )}
          <p className="text-[12px] text-muted-foreground text-pretty">
            Hoy, no en el periodo: pueden reservar (cuota vigente o bono con sesiones) o han venido en los últimos {DIAS_VINO_HACE_POCO} días.
            Es el mismo número que en Resumen.
            {conteos && (conteos.PAUSADA > 0 || conteos.SIN_RENOVAR > 0) && (
              <>
                {' '}Y{' '}
                {conteos.PAUSADA > 0 && <Link href="/clientas?estado=PAUSADA" className="underline-offset-2 hover:underline">{conteos.PAUSADA} {conteos.PAUSADA === 1 ? 'pausada' : 'pausadas'}</Link>}
                {conteos.PAUSADA > 0 && conteos.SIN_RENOVAR > 0 && ' · '}
                {conteos.SIN_RENOVAR > 0 && <Link href="/clientas?estado=SIN_RENOVAR" className="underline-offset-2 hover:underline">{conteos.SIN_RENOVAR} sin renovar</Link>}
                .
              </>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border p-4" data-testid="informe-nuevas">
          <p className="text-[12.5px] text-muted-foreground">Nuevas en el periodo</p>
          <p className="text-[24px] font-semibold tabular-nums text-foreground">{cohortesListas ? nuevas : '—'}</p>
          <p className="text-[12px] text-muted-foreground text-pretty">
            {cohortesListas && difNuevas != null && comparacion && (
              <><b className={cn('font-semibold tabular-nums', tonoDiferencia(difNuevas))}>{conSigno(difNuevas)}</b> {frenteA(comparacion)}. </>
            )}
            Su primera compra de verdad; no cuentan las importadas ni las que ya venían de antes.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-[13.5px] font-semibold text-foreground">Las que más vienen</h3>
          <p className="text-[12.5px] text-muted-foreground">Por clases a las que vinieron en el periodo.</p>
          {sinPasarLista ? (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-3 text-[13px] text-foreground" role="note">
              En este periodo no se ha pasado lista en ninguna clase: no sabemos quién vino. Al pasar lista en el calendario aparecerán aquí.
            </p>
          ) : clientas.lasQueMasVienen.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted-foreground">Nadie ha venido a una clase en este periodo.</p>
          ) : (
            <ol className="mt-3 space-y-2.5" data-testid="informe-las-que-mas-vienen">
              {clientas.lasQueMasVienen.map(c => (
                <li key={c.socioId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                  <Link href={`/clientas/${c.socioId}`} className="truncate text-[13px] font-medium text-foreground hover:underline">{nombreDe(c.socioId)}</Link>
                  <span className="text-[13px] font-semibold tabular-nums text-foreground">{c.clases} {c.clases === 1 ? 'clase' : 'clases'}</span>
                  <span className="col-span-2 mt-1 h-1.5 rounded-full bg-muted">
                    <span className="block h-1.5 rounded-full bg-foreground/60" style={{ width: `${Math.round((c.clases / max) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h3 className="text-[13.5px] font-semibold text-foreground">Cuántas siguen viniendo, por mes en que empezaron</h3>
          <p className="text-[12.5px] text-muted-foreground text-pretty">
            No depende del periodo de arriba: siempre los seis últimos meses. De las clientas que compraron su primer plan o bono
            cada mes, cuántas vinieron a alguna clase en su segundo mes y en su tercero. No cuentan las importadas ni las que ya
            venían de antes. «—»: ese mes aún no ha pasado entero para todas.
          </p>
          {!cohortesListas ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Cargando…</p>
          ) : cohortes.every(f => f.empezaron === 0) ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Nadie ha empezado en estos seis meses: no hay nada que medir todavía.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[12px] text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Mes</th>
                    <th className="pb-2 pr-3 text-right font-medium">Empezaron</th>
                    <th className="pb-2 pr-3 text-right font-medium">Siguen en su 2.º mes</th>
                    <th className="pb-2 text-right font-medium">En su 3.er mes</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortes.map(f => (
                    <tr key={f.mes} className="border-t border-border">
                      <td className="py-2 pr-3 font-medium capitalize text-foreground">{etiquetaMes(f.mes)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{f.empezaron}</td>
                      <td className="py-2 pr-3 text-right">{f.empezaron > 0 ? <CeldaCohorte tramo={f.segundoMes} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 text-right">{f.empezaron > 0 ? <CeldaCohorte tramo={f.tercerMes} /> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
