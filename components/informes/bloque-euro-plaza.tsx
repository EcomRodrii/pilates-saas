'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «€ por plaza a la venta» (pieza E): compara las horas de la semana entre sí.
// El cálculo vive en `lib/informes/euro-por-plaza.ts` y cuadra al céntimo con
// el «Cobrado» del titular; aquí solo se pinta. Sin imperativos («ciérrala»):
// quien propone cambios de horario es el Centro de Control, no este mapa.
//
// Entra APAGADO (interruptor `INFORMES_EURO_PLAZA`): la página lo carga con
// `dynamic()` y solo si el servidor dice que sí. Nunca Tenti (pantalla de dinero).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ReciboDeInforme } from '@/lib/informes/dinero';
import type { ReservaParaInforme, SesionParaInforme } from '@/lib/informes/clases';
import type { TipoDePlanDe } from '@/lib/informes/motivo-cobro';
import type { Tramo } from '@/lib/cobros/lo-cobrado';
import {
  faltanLosPlanes, finDelMesPasado, finDelTrimestrePasado, mapaEuroPorPlaza, nivelDeColor, MIN_CLASES_CELDA, periodoCerrado,
  TINTA_POR_NIVEL, type CeldaEuroPlaza, type MapaEuroPlaza,
} from '@/lib/informes/euro-por-plaza';
import { cn, fechaLargaEstudio, finDelDiaEstudio, formatEuro, horaEstudio } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { usePanelPrivacy } from '@/lib/panel-privacy';
import { EnlaceExplicador, TarjetaPrimeraVez, useExplicador } from '@/components/explicador/enlace-explicador';
import { CabeceraBloque, type PeriodoInforme } from './piezas';
import { VerCalculo, type LineaCalculo } from './ver-calculo';

/** Lunes primero, como el calendario. `dow` de `franjaLocalDe` (0 = domingo). */
const COLUMNAS = [1, 2, 3, 4, 5, 6, 0] as const;
const DIA_CORTO: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 0: 'Dom' };
const DIA_LARGO: Record<number, string> = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 0: 'Domingo' };
const fondoNivel = (nivel: number) => `color-mix(in oklab, var(--foreground) ${TINTA_POR_NIVEL[nivel]}%, var(--card))`;
/**
 * El texto de una casilla según su nivel, con contraste AA en claro y en oscuro:
 * hasta el nivel 1, la tinta del texto (la línea de abajo, un poco más suave);
 * en el más marcado, el color de la tarjeta.
 */
const textoNivel = (nivel: number | null) =>
  nivel === null || nivel === 0 ? { cifra: 'text-foreground', linea: 'text-muted-foreground' }
    : nivel === 1 ? { cifra: 'text-foreground', linea: 'text-foreground' }
      : { cifra: 'text-card', linea: 'text-card' };
const euros = (n: number) => <CifraPrivada inline>{formatEuro(n)}</CifraPrivada>;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** «los martes», «los sábados». */
const losDias = (dow: number) => `los ${DIA_LARGO[dow].toLowerCase()}${dow === 6 || dow === 0 ? 's' : ''}`;

export interface DatosEuroPlaza {
  sesiones: readonly SesionParaInforme[];
  reservas: readonly ReservaParaInforme[];
  recibos: readonly ReciboDeInforme[];
  tipoDePlanDe: TipoDePlanDe;
}

export function BloqueEuroPlaza({ datos, periodo, visible, textoPeriodo, hoy, datosIncompletos, importado, nombres, onIrA }: {
  datos: DatosEuroPlaza;
  periodo: PeriodoInforme;
  visible: Tramo;
  /** «septiembre», «el 3.º trimestre», «2026»: para el cuadre y el detalle. */
  textoPeriodo: string;
  hoy: string;
  datosIncompletos: boolean;
  /** Pagos importados del software anterior en el periodo (no son recibos: no se reparten). */
  importado: { n: number; total: number } | null;
  nombres: { tipo: (id: string) => string | undefined; socia: (id: string) => string };
  /** Saltar a otro periodo desde los avisos («Ver el trimestre pasado»). */
  onIrA: (periodo: PeriodoInforme, referencia: string) => void;
}) {
  const { visto, abrir, terminar, modal, enlaceRef } = useExplicador('euroPorPlaza');
  const cerrado = periodoCerrado(visible, hoy);
  // Sin la tabla de planes, todo caería en «Otros» y el mapa saldría a 0 €: datos a medias.
  const aMedias = datosIncompletos || faltanLosPlanes(datos.recibos, datos.tipoDePlanDe);
  const calculable = cerrado && periodo !== 'SEMANA' && !aMedias;
  // Con el periodo cerrado, «ahora» es su último instante: no se recalcula cada minuto.
  const mapa = useMemo(
    () => (calculable ? mapaEuroPorPlaza(datos.sesiones, datos.reservas, datos.recibos, visible, new Date(finDelDiaEstudio(visible.hasta)), datos.tipoDePlanDe) : null),
    [calculable, datos, visible],
  );

  // El mes y el trimestre anteriores al de hoy (ya cerrados), para los avisos.
  const finMesPasado = finDelMesPasado(hoy);
  const finTrimestrePasado = finDelTrimestrePasado(hoy);

  // Al saltar de periodo desde un aviso, el aviso desaparece: el foco va al título del bloque.
  function irA(p: PeriodoInforme, ref: string) {
    onIrA(p, ref);
    requestAnimationFrame(() => {
      const h = document.getElementById('informe-euro-plaza');
      h?.setAttribute('tabindex', '-1');
      h?.focus();
    });
  }

  let aviso: { texto: string; acciones: ReactNode } | null = null;
  if (aMedias) {
    aviso = {
      texto: 'Con datos a medias no se calcula: algunos datos no se han podido cargar del todo. Al recargar se vuelven a pedir.',
      acciones: <Button onClick={() => window.location.reload()}>Recargar</Button>,
    };
  } else if (periodo === 'SEMANA') {
    aviso = {
      texto: 'Con una semana ninguna hora llega a 4 clases: muy poco para comparar. Se lee mejor con un trimestre ya cerrado.',
      acciones: <Button onClick={() => irA('TRIMESTRE', finTrimestrePasado)}>Ver el trimestre pasado</Button>,
    };
  } else if (!cerrado) {
    aviso = {
      texto: 'Este mapa se calcula con periodos ya terminados: una cuota cobrada el día 1 se repartiría solo entre las clases que van hasta hoy.',
      acciones: (
        <>
          <Button onClick={() => irA('TRIMESTRE', finTrimestrePasado)}>Ver el trimestre pasado</Button>
          <Button variant="outline" onClick={() => irA('MES', finMesPasado)}>Ver el mes pasado</Button>
        </>
      ),
    };
  }

  return (
    <section aria-labelledby="informe-euro-plaza" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid="bloque-euro-plaza">
      <CabeceraBloque
        id="informe-euro-plaza" titulo="€ por plaza a la venta"
        acciones={<EnlaceExplicador ref={enlaceRef} texto="¿Qué es el € por plaza?" onAbrir={abrir} />}
      >
        Cuánto entra por cada plaza que pones a la venta, hora a hora, contando también las vacías. Para comparar tus horas entre sí.
      </CabeceraBloque>

      {aviso ? (
        <div className="rounded-xl bg-muted/50 px-4 py-3" data-testid="euro-plaza-aviso">
          <p className="text-[13px] text-foreground text-pretty">{aviso.texto}</p>
          <div className="mt-2 flex flex-wrap gap-2">{aviso.acciones}</div>
        </div>
      ) : mapa && (
        <>
          {/* Solo cuando hay algo que mirar: con el aviso delante no tiene sentido. */}
          {visto === false && mapa.celdas.length > 0 && (
            <TarjetaPrimeraVez
              texto="Antes de mirarlo: cómo se calcula, en 5 pasos (1 minuto)."
              onVer={abrir} onYaLoSe={() => { terminar('saltado'); enlaceRef.current?.focus(); }}
            />
          )}
          <Mapa mapa={mapa} textoPeriodo={textoPeriodo} importado={importado} nombres={nombres} />
        </>
      )}

      {modal}
    </section>
  );
}

function Mapa({ mapa, textoPeriodo, importado, nombres }: {
  mapa: MapaEuroPlaza;
  textoPeriodo: string;
  importado: { n: number; total: number } | null;
  nombres: { tipo: (id: string) => string | undefined; socia: (id: string) => string };
}) {
  const [elegida, setElegida] = useState<string | null>(null);
  const detalleRef = useRef<HTMLDivElement>(null);
  const porClave = new Map(mapa.celdas.map(c => [`${c.dow}-${c.inicio}`, c]));
  const celda = elegida ? porClave.get(elegida) ?? null : null;
  const { total, cuadre } = mapa;

  // El detalle sale bajo la rejilla: al abrirlo, se lleva a la vista (con un
  // horario de verdad, una casilla de arriba lo abría 600 px más abajo).
  useEffect(() => {
    if (!elegida) return;
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detalleRef.current?.scrollIntoView({ block: 'nearest', behavior: reducir ? 'auto' : 'smooth' });
  }, [elegida]);
  function cerrarDetalle() {
    const clave = elegida;
    setElegida(null);
    // El foco vuelve a la casilla que lo abrió.
    if (clave) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-celda="${clave}"]`)?.focus());
  }

  if (mapa.celdas.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">Todavía no hay clases ya empezadas en este periodo.</p>;
  }

  // La leyenda enseña a leer el mapa con la casilla real que más clases tiene.
  const ejemploLeyenda = [...mapa.celdas].filter(c => c.euroPorPlaza !== null)
    .sort((a, b) => b.nClases - a.nClases || ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || a.inicio.localeCompare(b.inicio))[0];

  const fuera: LineaCalculo[] = [
    { signo: '−', etiqueta: 'Caja (TPV)', detalle: 'Un ticket puede llevar un bono dentro y no se sabe qué parte.', valor: euros(cuadre.caja) },
    { signo: '−', etiqueta: 'Sesiones privadas', valor: euros(cuadre.sesionesPrivadas) },
    { signo: '−', etiqueta: 'Otros', detalle: 'Matrículas, penalizaciones y cobros sin plan.', valor: euros(cuadre.otros) },
    { signo: '−', etiqueta: 'Cobros sin clienta', valor: euros(cuadre.sinClienta) },
    { signo: '−', etiqueta: 'De alumnas que no ocuparon ninguna plaza', detalle: 'Pagaron en el periodo y no tenían clase en él.', valor: euros(cuadre.deNoVinieron) },
  ];
  const cifras = [cuadre.caja, cuadre.sesionesPrivadas, cuadre.otros, cuadre.sinClienta, cuadre.deNoVinieron];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12.5px] text-muted-foreground">Todas tus horas, en {textoPeriodo}</p>
        <p className="text-[24px] font-semibold tabular-nums text-foreground" data-testid="euro-plaza-total">
          {total.euroPorPlaza === null ? '—' : <>{euros(total.euroPorPlaza)} <span className="text-[14px] font-medium text-muted-foreground">por plaza</span></>}
        </p>
        <p className="text-[12.5px] text-muted-foreground">
          {plural(total.plazas - total.ocupadas, 'plaza sin ocupar', 'plazas sin ocupar')} de {total.plazas} a la venta en {plural(total.nClases, 'clase', 'clases')}.
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-[13px] font-medium text-foreground underline-offset-2 hover:underline">Ver cálculo</summary>
          <div className="mt-2">
            <VerCalculo
              testId="euro-plaza-cuadre"
              lineas={[
                { etiqueta: `Cobrado en ${textoPeriodo}`, detalle: 'El «Cobrado» del principio de Informes.', valor: euros(cuadre.cobrado) },
                // Las líneas a 0 no dicen nada: fuera.
                ...fuera.filter((_, k) => cifras[k] > 0),
                { signo: '=', etiqueta: 'Se reparte entre las plazas', valor: euros(cuadre.repartido), resultado: true },
                { signo: '÷', etiqueta: 'Plazas a la venta', valor: total.plazas },
                { signo: '=', etiqueta: '€ por plaza', valor: total.euroPorPlaza === null ? '—' : euros(total.euroPorPlaza), resultado: true },
              ]}
              nota={(
                <>
                  No es el «Ingreso» de la tabla Clases: ese se estima con la tarifa de cada alumna; este sale de lo cobrado de verdad.
                  Bruto, con IVA y antes de comisiones.
                  {importado && importado.n > 0 && (
                    <> De tu software anterior hay {euros(importado.total)} en {plural(importado.n, 'pago importado', 'pagos importados')}: no se reparten (no son recibos), así que en esas semanas el mapa se queda corto.</>
                  )}
                </>
              )}
            />
          </div>
        </details>
      </div>

      <Leyenda ejemplo={ejemploLeyenda ?? null} hayColor={mapa.cortes.length > 0} />

      <RejillaConScroll>
        <table className="w-full min-w-[540px] table-fixed border-separate border-spacing-0 text-[12.5px]" data-testid="euro-plaza-mapa">
          <caption className="sr-only">€ por plaza a la venta por día de la semana y hora, en {textoPeriodo}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[1] w-11 bg-card sm:w-14"><span className="sr-only">Hora</span></th>
              {COLUMNAS.map(d => (
                <th key={d} scope="col" className="p-0.5 pb-1 text-center text-[12px] font-medium text-muted-foreground">
                  <abbr title={DIA_LARGO[d]} className="no-underline">{DIA_CORTO[d]}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mapa.horas.map(h => (
              <tr key={h}>
                <th scope="row" className="sticky left-0 z-[1] bg-card p-0.5 pr-2 text-right text-[12px] font-medium tabular-nums text-muted-foreground">{h}</th>
                {COLUMNAS.map(d => {
                  const c = porClave.get(`${d}-${h}`);
                  if (!c) {
                    return (
                      <td key={d} className="h-14 p-0.5">
                        <div className="h-full rounded-md bg-muted/40" /><span className="sr-only">{DIA_LARGO[d]} a las {h}: sin clases</span>
                      </td>
                    );
                  }
                  const clave = `${d}-${h}`;
                  return (
                    <td key={d} className="h-14 p-0.5">
                      <CeldaBoton
                        celda={c} nivel={nivelDeColor(c.euroPorPlaza, mapa.cortes)} activa={elegida === clave}
                        onPulsar={() => (elegida === clave ? cerrarDetalle() : setElegida(clave))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </RejillaConScroll>

      {celda && (
        <Detalle ref={detalleRef} celda={celda} textoPeriodo={textoPeriodo} nombres={nombres} onCerrar={cerrarDetalle} />
      )}
    </div>
  );
}

/** Scroll lateral propio (en el móvil no caben 7 días), con un degradado a la derecha mientras queda más. */
function RejillaConScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [queda, setQueda] = useState(false);
  const medir = () => {
    const el = ref.current;
    if (el) setQueda(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useLayoutEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  return (
    <div className="relative -mx-4 sm:mx-0">
      {/* `relative`: el texto `sr-only` de las casillas vacías es absoluto y, sin él, se salía del scroll y ensanchaba la página. */}
      <div ref={ref} onScroll={medir} className="relative overflow-x-auto px-4 sm:px-0">{children}</div>
      {queda && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />}
    </div>
  );
}

function CeldaBoton({ celda: c, nivel, activa, onPulsar }: { celda: CeldaEuroPlaza; nivel: number | null; activa: boolean; onPulsar: () => void }) {
  const colores = textoNivel(nivel);
  // Con el modo privacidad, la cifra se difumina en pantalla: que tampoco se lea en voz alta.
  const { oculto } = usePanelPrivacy();
  const etiqueta = c.euroPorPlaza === null
    ? c.plazas === 0
      ? `${DIA_LARGO[c.dow]} a las ${c.inicio}: ${plural(c.nClases, 'clase', 'clases')} sin plazas a la venta. Ver cálculo`
      : `${DIA_LARGO[c.dow]} a las ${c.inicio}: solo ${plural(c.nClases, 'clase', 'clases')}, muy pocas para fiarse. Ver cálculo`
    : `${DIA_LARGO[c.dow]} a las ${c.inicio}: ${oculto ? 'cifra oculta' : `${formatEuro(c.euroPorPlaza)} por plaza`}, ${c.pct ?? 0} % de las plazas ocupadas, ${plural(c.nClases, 'clase', 'clases')}. Ver cálculo`;
  return (
    <button
      type="button" onClick={onPulsar}
      aria-label={etiqueta} aria-expanded={activa} aria-controls={activa ? 'mapa-plaza-detalle' : undefined}
      data-celda={`${c.dow}-${c.inicio}`}
      className={cn(
        'flex h-full w-full flex-col items-center justify-center rounded-md border px-1 transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        c.euroPorPlaza === null ? 'border-dashed border-border' : 'border-border',
        activa && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
      )}
      style={nivel === null ? undefined : { backgroundColor: fondoNivel(nivel) }}
    >
      {c.euroPorPlaza === null ? (
        <>
          <span className="text-[13px] text-muted-foreground" aria-hidden>—</span>
          <span className="hidden text-[10.5px] text-muted-foreground md:block" aria-hidden>{plural(c.nClases, 'clase', 'clases')}</span>
        </>
      ) : (
        <>
          <CifraPrivada inline className={cn('text-[13px] font-semibold tabular-nums', colores.cifra)}>{formatEuro(c.euroPorPlaza)}</CifraPrivada>
          <span className={cn('hidden text-[10.5px] tabular-nums md:block', colores.linea)} aria-hidden>
            {c.pct ?? 0} % · {plural(c.nClases, 'clase', 'clases')}
          </span>
        </>
      )}
    </button>
  );
}

function Leyenda({ ejemplo, hayColor }: { ejemplo: CeldaEuroPlaza | null; hayColor: boolean }) {
  return (
    <div className="max-w-[75ch] space-y-2 text-[12px] text-muted-foreground" data-testid="euro-plaza-leyenda">
      {ejemplo && ejemplo.euroPorPlaza !== null && (
        <p className="text-pretty">
          <span className="font-medium text-foreground">Cómo se lee:</span> {losDias(ejemplo.dow)} a las {ejemplo.inicio}
          {' '}hubo {plural(ejemplo.nClases, 'clase', 'clases')}; se ocuparon {ejemplo.pct ?? 0} de cada 100 plazas y cada plaza a la venta trajo {euros(ejemplo.euroPorPlaza)}.
          {' '}Cada casilla abre su cálculo.
        </p>
      )}
      {hayColor && (
        <div className="flex flex-wrap items-center gap-2" aria-hidden>
          <span>menos</span>
          {TINTA_POR_NIVEL.map((_, n) => <span key={n} className="h-3 w-6 rounded-sm border border-border" style={{ backgroundColor: fondoNivel(n) }} />)}
          <span>más € por plaza, comparado con tus otras horas</span>
        </div>
      )}
      <p className="text-pretty">
        «—»: menos de {MIN_CLASES_CELDA} clases, muy pocas para fiarse. En gris: no hubo clases. No resta lo que te cuesta
        dar cada clase. Se lee mejor con un trimestre que con un mes: un bono pagado antes del periodo cuenta 0 € en sus clases.
      </p>
    </div>
  );
}

function Detalle({ ref, celda: c, textoPeriodo, nombres, onCerrar }: {
  ref: React.Ref<HTMLDivElement>;
  celda: CeldaEuroPlaza;
  textoPeriodo: string;
  nombres: { tipo: (id: string) => string | undefined; socia: (id: string) => string };
  onCerrar: () => void;
}) {
  const porTipo = new Map<string, number>();
  for (const s of c.sesiones) porTipo.set(s.tipoClaseId, (porTipo.get(s.tipoClaseId) ?? 0) + 1);
  const tipos = [...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${nombres.tipo(id) ?? 'Clase'}${porTipo.size > 1 ? ` (${n})` : ''}`).join(', ');
  const alumnas = c.ocupadas - c.externas;
  return (
    <div
      ref={ref} id="mapa-plaza-detalle" role="region" aria-label={`Cálculo del ${DIA_LARGO[c.dow].toLowerCase()} a las ${c.inicio}`}
      className="scroll-mt-24 rounded-xl border border-border p-4 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      data-testid="euro-plaza-detalle"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-foreground">{DIA_LARGO[c.dow]} · {c.inicio} · en {textoPeriodo}</h3>
        <Button variant="ghost" onClick={onCerrar} className="shrink-0 text-muted-foreground">Cerrar</Button>
      </div>
      <div className="mt-2">
        <VerCalculo
          testId="euro-plaza-calculo-celda"
          lineas={[
            { etiqueta: 'Clases', detalle: tipos, valor: c.nClases },
            { etiqueta: 'Plazas a la venta', valor: c.plazas },
            {
              etiqueta: `Plazas ocupadas (${c.pct ?? 0} %)`,
              detalle: c.externas > 0 ? `${alumnas} de alumnas y ${c.externas} de ClassPass, Wellhub o USC, que cuentan 0 €.` : undefined,
              valor: c.ocupadas,
            },
            ...(c.sinCobro > 0 ? [{
              etiqueta: 'De ellas, sin cobro que repartir',
              detalle: 'Pagó antes del periodo, pagó en la Caja (el ticket no se reparte), es cortesía o le falta el recibo: cuentan 0 €.',
              valor: c.sinCobro,
            }] : []),
            { etiqueta: 'Repartido a estas clases', detalle: 'Lo que pagaron sus alumnas en el periodo, en la parte que toca a estas clases.', valor: euros(c.repartido), resultado: true },
            { signo: '÷', etiqueta: 'Plazas a la venta', valor: c.plazas },
            {
              signo: '=', etiqueta: '€ por plaza', resultado: true,
              valor: c.euroPorPlaza !== null ? euros(c.euroPorPlaza)
                : c.plazas === 0 ? 'Sin plazas a la venta' : `Solo ${plural(c.nClases, 'clase', 'clases')}: muy pocas para fiarse`,
            },
          ]}
          nota={c.ejemplo && (
            <>
              Por ejemplo, {nombres.socia(c.ejemplo.socioId)}: pagó {euros(c.ejemplo.pagado)} en el periodo y ocupó {plural(c.ejemplo.plazasEnElPeriodo, 'plaza', 'plazas')},
              {' '}así que cada una vale {euros(c.ejemplo.valorPlaza)}. Aquí ocupó {c.ejemplo.plazasAqui}: {euros(c.ejemplo.valorPlaza * c.ejemplo.plazasAqui)} de los {euros(c.repartido)}.
            </>
          )}
        />
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] font-medium text-foreground underline-offset-2 hover:underline">Ver las {plural(c.nClases, 'clase', 'clases')}</summary>
        <ul className="mt-2 divide-y divide-border text-[12.5px]">
          {c.sesiones.map(s => (
            <li key={s.sesionId} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5">
              <span className="text-foreground">{fechaLargaEstudio(s.inicio)} · {horaEstudio(s.inicio)} · {nombres.tipo(s.tipoClaseId) ?? 'Clase'}</span>
              <span className="tabular-nums text-muted-foreground">{s.ocupadas}/{s.aforo} · {euros(s.repartido)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
