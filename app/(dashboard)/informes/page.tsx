'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Informes (rediseño del 2-oct-2026, decisiones 9–12 y F1–F5 del fundador).
//
// Un titular con tres hechos —Dinero, Clases, Clientas—, cada uno frente al MISMO
// TRAMO del periodo anterior, y debajo un bloque para cada uno. Periodos: semana,
// mes, trimestre natural y año, con flechas para ver uno cerrado; abre en el mes
// en curso, como Cobros.
//
// Todo se calcula aquí, en el navegador, con las funciones puras de
// `lib/informes/` sobre los arrays del contexto (que ya llegan enteros con
// `fetchAllRows`). Antes las cifras de dinero salían de cuatro RPC con su propio
// rango de fechas, y «Ingresos período» no tenía por qué coincidir con «Cobrado
// en octubre» de Cobros. Ahora es la misma función (`cobradoEnTramo`) sobre los
// mismos recibos: cuadran por construcción, y respetan la sede activa.
//
// Informes es solo de la propietaria (`lib/permisos-reglas.ts` la bloquea a
// recepción y gerencia), así que aquí no hay gates por rol.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Download, FileText, Loader2, Printer } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { fetchTarifasEquipo, type TarifaInstructor } from '@/lib/api-client';
import { useEstadosClientas } from '@/lib/clientas/use-estados-clientas';
import { formatEuro, fechaLargaEstudio, finDelDiaEstudio, horaEstudio, hoyEnEstudio, inicioDelDiaEstudio } from '@/lib/utils';
import { mismoTramoAnterior, moverPeriodo, textoDeLaComparacion, tramoVisible } from '@/lib/cobros/lo-cobrado';
import { dineroDelTramo, diferencia, serieDelGrafico } from '@/lib/informes/dinero';
import { tipoDePlanPorSuscripcion } from '@/lib/informes/motivo-cobro';
import { clasesDelTramo, puntosDeDiferencia, sesionesDelTramo } from '@/lib/informes/clases';
import { clientasDelTramo, nuevasEnTramo } from '@/lib/informes/clientas';
import { cohortesPorPrimeraCompra, cuandoEmpezoCadaClienta } from '@/lib/informes/cohortes';
import { margenSesiones, type MargenSesion } from '@/lib/decision/margen-clase';
import type { SnapshotEstudio } from '@/lib/decision/tipos';
import { esVentaSinRecibo, resumenVentasSinRecibo } from '@/lib/pos/ventas-sin-recibo';
import { csvDeFilas, filasCsvPorOrigen, resumenPorPlataforma } from '@/lib/plataformas/informe-origen';
import { PageHeader } from '@/components/ui/page-header';
import { MenuAcciones } from '@/components/ui/menu-acciones';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { Toast, useToast } from '@/components/ui/toast';
import { useDescargaCobrado } from '@/components/cobros/use-descarga-cobrado';
import type { AvisosCobros } from '@/components/cobros/use-acciones-recibo';
import { Hecho, SelectorPeriodo, conSigno, conSignoEuros, frenteA, tonoDiferencia, type PeriodoInforme } from '@/components/informes/piezas';
import { BloqueDinero } from '@/components/informes/bloque-dinero';
import { pagosHistoricosEnTramo } from '@/lib/cobros/pagos-historicos';
import { usePagosHistoricos } from '@/lib/cobros/use-pagos-historicos';
import { BloqueClases } from '@/components/informes/bloque-clases';
import { BloqueClientas } from '@/components/informes/bloque-clientas';

export default function Informes() {
  const {
    recibos, socios, sesiones, reservas, tiposClase, suscripciones, planesTarifa, instructores, ventasPOS, datosIncompletos,
  } = useStudio();
  const { listo: estadosListos, conteos } = useEstadosClientas();
  const toast = useToast();
  const avisos: AvisosCobros = useMemo(() => ({ ok: toast.show, error: toast.showError }), [toast.show, toast.showError]);
  const descargas = useDescargaCobrado(avisos);

  const [periodo, setPeriodo] = useState<PeriodoInforme>('MES');
  // El día que fija el periodo que se ve; `null` = el de hoy.
  const [referencia, setReferencia] = useState<string | null>(null);

  // La hora, en estado y no con `new Date()` en el render: el servidor y el
  // navegador pintan lo mismo (el esqueleto) hasta que monta, y cruzar la
  // medianoche o el fin de mes recalcula en vez de enseñar el periodo de ayer.
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: el SSR pinta el esqueleto y el cliente salta a la hora real tras montar.
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // La tarifa de instructora (dato salarial, su propia RLS): para el margen.
  const [tarifas, setTarifas] = useState<TarifaInstructor[]>([]);
  useEffect(() => {
    let cancelado = false;
    void fetchTarifasEquipo().then(items => { if (!cancelado) setTarifas(items); });
    return () => { cancelado = true; };
  }, []);

  const hoy = ahora ? hoyEnEstudio(ahora) : null;
  const ref = referencia ?? hoy;

  const tramos = useMemo(() => {
    if (!hoy || !ref) return null;
    // `ref` siempre cae en un periodo ya empezado (las flechas no van al futuro).
    const visible = tramoVisible(periodo, ref, hoy) ?? tramoVisible(periodo, hoy, hoy)!;
    return {
      visible,
      anterior: mismoTramoAnterior(periodo, visible),
      comparacion: textoDeLaComparacion(periodo, visible, hoy),
      haySiguiente: moverPeriodo(periodo, ref, 1) <= hoy,
    };
  }, [periodo, ref, hoy]);

  // ── Dinero ──
  const dinero = useMemo(() => {
    if (!tramos) return null;
    const ctx = { periodo, tipoDePlanDe: tipoDePlanPorSuscripcion(suscripciones, planesTarifa) };
    const actual = dineroDelTramo(recibos, tramos.visible, ctx);
    const anterior = tramos.anterior ? dineroDelTramo(recibos, tramos.anterior, ctx) : null;
    return {
      actual, anterior,
      puntos: serieDelGrafico(periodo, tramos.visible, actual, tramos.anterior && anterior ? { tramo: tramos.anterior, dinero: anterior } : null),
    };
  }, [recibos, suscripciones, planesTarifa, periodo, tramos]);

  // Ventas de la caja cobradas sin recibo en el periodo: no están en las cifras y se dice.
  const ventasSinRecibo = useMemo(() => {
    if (!tramos) return { n: 0, total: 0 };
    const { desde, hasta } = tramos.visible;
    return resumenVentasSinRecibo(ventasPOS.filter(v => {
      if (!esVentaSinRecibo(v) || !v.realizadaEn) return false;
      const dia = hoyEnEstudio(new Date(v.realizadaEn));
      return dia >= desde && dia <= hasta;
    }));
  }, [ventasPOS, tramos]);

  // Lo importado del software anterior, AL LADO del cobrado (no son recibos).
  const importado = usePagosHistoricos();
  const importadoDelTramo = useMemo(() => {
    if (!tramos || !importado) return null;
    return {
      actual: pagosHistoricosEnTramo(importado.dias, tramos.visible),
      anterior: tramos.anterior ? pagosHistoricosEnTramo(importado.dias, tramos.anterior) : null,
      completo: importado.completo,
    };
  }, [importado, tramos]);

  // ── Clases ──
  const clases = useMemo(() => {
    if (!tramos || !ahora) return null;
    return {
      actual: clasesDelTramo(sesiones, reservas, tramos.visible, ahora),
      anterior: tramos.anterior ? clasesDelTramo(sesiones, reservas, tramos.anterior, ahora) : null,
    };
  }, [sesiones, reservas, tramos, ahora]);

  // El margen de cada clase ya empezada del periodo (lib/decision/margen-clase.ts,
  // el mismo cálculo que el Centro de Control).
  const margenes = useMemo((): ReadonlyMap<string, MargenSesion> => {
    if (!tramos || !ahora) return new Map();
    const pasadas = sesionesDelTramo(sesiones, tramos.visible, ahora);
    if (pasadas.length === 0) return new Map();
    const snapshot: SnapshotEstudio = {
      studioId: '', socios, reservas, sesiones: pasadas, salas: [], recibos, suscripciones, planesTarifa,
      tiposClase, instructores, automationLogs: [], campanas: [], sustituciones: [],
      instructorTarifas: tarifas,
      intentosFallidos: [], bloqueosAgenda: [], widgetEventosCheckout: [], contactosManuales: [], hechosClientas: {},
      contexto: { nSociasActivas: 0, antiguedadDatosDias: 0, cadenaId: null, nSedesCadena: 1 },
    };
    return new Map(margenSesiones(pasadas, snapshot).map(m => [m.sesionId, m]));
  }, [tramos, ahora, sesiones, socios, reservas, recibos, suscripciones, planesTarifa, tiposClase, instructores, tarifas]);

  // ── Clientas ──
  const clientas = useMemo(() => {
    if (!tramos || !ahora) return null;
    return {
      actual: clientasDelTramo(sesiones, reservas, tramos.visible, ahora),
      anterior: tramos.anterior ? clientasDelTramo(sesiones, reservas, tramos.anterior, ahora) : null,
    };
  }, [sesiones, reservas, tramos, ahora]);

  // Las cohortes y las «nuevas» comparten regla (`cuandoEmpezoCadaClienta`); no
  // dependen del periodo y esperan a que los datos estén enteros.
  const datosCohortes = useMemo(() => ({ socios, suscripciones, planesTarifa, reservas, sesiones }), [socios, suscripciones, planesTarifa, reservas, sesiones]);
  const cohortes = useMemo(
    () => (hoy && estadosListos ? cohortesPorPrimeraCompra(datosCohortes, hoy) : []),
    [datosCohortes, hoy, estadosListos],
  );
  const empezaron = useMemo(() => (hoy ? cuandoEmpezoCadaClienta(datosCohortes, hoy) : new Map<string, string>()), [datosCohortes, hoy]);

  const plataformas = useMemo(() => {
    if (!tramos) return [];
    const desde = new Date(inicioDelDiaEstudio(tramos.visible.desde));
    const hasta = new Date(new Date(finDelDiaEstudio(tramos.visible.hasta)).getTime() - 1);
    return resumenPorPlataforma(reservas, sesiones, desde, hasta);
  }, [reservas, sesiones, tramos]);

  if (!tramos || !dinero || !clases || !clientas || !hoy || !ref) {
    return (
      <div className="animate-pulse space-y-5 p-1">
        <div className="h-8 w-56 rounded-lg bg-border" />
        <div className="h-28 rounded-2xl border border-border bg-card" />
        <div className="h-72 rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  const { visible, comparacion } = tramos;
  const difCobrado = diferencia(dinero.actual.neto, dinero.anterior?.neto);
  const puntos = puntosDeDiferencia(clases.actual, clases.anterior);
  const difVinieron = clientas.anterior ? clientas.actual.vinieron - clientas.anterior.vinieron : null;
  const sociosPorId = new Map(socios.map(s => [s.id, s]));
  const tiposPorId = new Map(tiposClase.map(t => [t.id, t.nombre]));
  const instructorasPorId = new Map(instructores.map(i => [i.id, i.nombre]));
  const descarga = descargas.fase(visible);

  function elegirPeriodo(p: PeriodoInforme) { setPeriodo(p); setReferencia(null); }
  function mover(paso: -1 | 1) { setReferencia(moverPeriodo(periodo, ref!, paso)); }

  function descargarPlataformas() {
    const nombreClase = (id: string | null | undefined) => (id ? tiposPorId.get(id) : undefined) ?? 'Clase';
    const fecha = (iso: string) => `${fechaLargaEstudio(iso)} ${horaEstudio(iso)}`;
    const desde = new Date(inicioDelDiaEstudio(visible.desde));
    const hasta = new Date(new Date(finDelDiaEstudio(visible.hasta)).getTime() - 1);
    const csv = csvDeFilas(filasCsvPorOrigen(reservas, sesiones, desde, hasta, nombreClase, fecha));
    // BOM para que Excel lea bien las tildes.
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reservas-plataformas-${visible.desde}_${visible.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const frente = frenteA(comparacion ?? 'el periodo anterior');

  return (
    <div data-tour="informes-vista" className="space-y-5 pb-24">
      <PageHeader
        title="Informes"
        description="Cuánto has cobrado, cómo se llenan las clases y quién viene, frente al mismo tramo del periodo anterior."
        actions={(
          <div className="flex items-center gap-2 print:hidden">
            <Link href="/cierre" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted">
              <FileText size={15} aria-hidden />Cierre para la gestoría
            </Link>
            <MenuAcciones
              etiqueta="Descargar"
              claseBoton="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              boton={(
                <>
                  {descarga === 'loading' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Download size={15} aria-hidden />}
                  {descarga === 'loading' ? 'Preparando…' : descarga === 'done' ? 'Descargado' : 'Descargar'}
                  <ChevronDown size={14} aria-hidden />
                </>
              )}
              acciones={[
                {
                  texto: 'Lo cobrado (para Excel)', icono: Download, desactivada: descargas.ocupado,
                  nota: 'El mismo fichero que Cobros, con los cobros del periodo que ves.',
                  onClick: () => void descargas.descargar(visible),
                },
                { texto: 'Imprimir / guardar PDF', icono: Printer, onClick: () => setTimeout(() => window.print(), 50) },
              ]}
            />
          </div>
        )}
      />

      <div className="print:hidden">
        <SelectorPeriodo periodo={periodo} referencia={ref} hoy={hoy} haySiguiente={tramos.haySiguiente} onPeriodo={elegirPeriodo} onMover={mover} />
      </div>

      {/* `fetchAllRows` puede fallar a media paginación, y eso se veía igual que
          «0 filas»: un número bajo por un fallo de red parecía un dato real. */}
      {datosIncompletos.some(t => ['recibos', 'sesiones', 'reservas', 'suscripciones'].includes(t)) && (
        <p role="alert" className="rounded-xl bg-warning/10 px-4 py-3 text-[13px] font-medium text-foreground">
          Algunos datos no se han podido cargar del todo por un fallo de conexión: las cifras de esta página pueden estar
          incompletas. Recarga la página; si sigue pasando, contacta con soporte.
        </p>
      )}

      <div className="grid divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0" data-testid="informe-titular">
        <Hecho
          testId="informe-cobrado"
          titulo="Cobrado · neto, ya restado lo devuelto"
          valor={<CifraPrivada inline>{formatEuro(dinero.actual.neto)}</CifraPrivada>}
          comparacion={difCobrado == null ? null : {
            texto: <CifraPrivada inline>{conSignoEuros(difCobrado)}</CifraPrivada>, tono: tonoDiferencia(difCobrado),
            frente: <>{frente} (<CifraPrivada inline>{formatEuro(dinero.anterior?.neto ?? 0)}</CifraPrivada>)</>,
          }}
          nota={`${dinero.actual.nCobros} ${dinero.actual.nCobros === 1 ? 'cobro' : 'cobros'}`}
        />
        <Hecho
          testId="informe-ocupacion"
          titulo="Ocupación de las clases"
          valor={clases.actual.pct == null ? '—' : `${clases.actual.pct} %`}
          comparacion={puntos == null ? null : { texto: conSigno(puntos, ' puntos'), tono: tonoDiferencia(puntos), frente }}
          nota={`${clases.actual.ocupadas} de ${clases.actual.aforo} plazas en ${clases.actual.nClases} ${clases.actual.nClases === 1 ? 'clase' : 'clases'}`}
        />
        <Hecho
          testId="informe-vinieron"
          titulo="Clientas que vinieron"
          valor={clases.actual.sinPasarLista ? '—' : clientas.actual.vinieron}
          comparacion={clases.actual.sinPasarLista || difVinieron == null ? null : { texto: conSigno(difVinieron), tono: tonoDiferencia(difVinieron), frente }}
          nota={clases.actual.sinPasarLista ? 'No se ha pasado lista: no sabemos quién vino.' : 'Distintas, a alguna clase del periodo.'}
        />
      </div>

      <BloqueDinero
        periodo={periodo} actual={dinero.actual} anterior={dinero.anterior} puntos={dinero.puntos} comparacion={comparacion}
        ventasSinRecibo={ventasSinRecibo} importado={importadoDelTramo} plataformas={plataformas} onDescargarPlataformas={descargarPlataformas}
      />
      <BloqueClases
        clases={clases.actual} anterior={clases.anterior} comparacion={comparacion} margenes={margenes}
        nombres={{ tipo: id => tiposPorId.get(id), instructora: id => instructorasPorId.get(id) }}
      />
      <BloqueClientas
        clientas={clientas.actual}
        nuevas={nuevasEnTramo(empezaron, visible)}
        nuevasAntes={tramos.anterior ? nuevasEnTramo(empezaron, tramos.anterior) : null}
        comparacion={comparacion}
        sinPasarLista={clases.actual.sinPasarLista}
        nombreDe={id => { const s = sociosPorId.get(id); return s ? `${s.nombre} ${s.apellidos ?? ''}`.trim() : 'Clienta'; }}
        conteos={conteos}
        cohortes={cohortes}
        cohortesListas={estadosListos}
      />

      {toast.message && (
        <Toast key={toast.message} message={toast.message} variant={toast.variant} action={toast.action} onDismiss={toast.dismiss} />
      )}
    </div>
  );
}
