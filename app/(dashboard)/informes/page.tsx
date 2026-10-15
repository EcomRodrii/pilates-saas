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
//
// Panel nuevo (15-oct-2026, como «Estadísticas» de Bonsai, captura b-81): los
// mismos bloques en pestañas por tema (Resumen · Dinero · Clases · Clientas ·
// Bonos), y dos que no había: «Clientas en riesgo» y «Estado de los bonos»,
// fotos de hoy hechas con las funciones dueñas (lib/informes/riesgo.ts y
// bonos.ts). Al imprimir salen todas. Sin el panel nuevo, Informes es la de
// siempre, en una página.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ChevronDown, Download, FileText, Loader2, Printer } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { fetchTarifasEquipo, type TarifaInstructor } from '@/lib/api-client';
import { useEstadosClientas } from '@/lib/clientas/use-estados-clientas';
import { cn, formatEuro, fechaLargaEstudio, finDelDiaEstudio, horaEstudio, hoyEnEstudio, inicioDelDiaEstudio } from '@/lib/utils';
import { mismoTramoAnterior, moverPeriodo, textoDeLaComparacion, textoDelPeriodo, tramoVisible } from '@/lib/cobros/lo-cobrado';
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
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { TarjetaCifra, TarjetaOcupacion } from '@/components/dashboard/vivo';
import { CalendarCheck, CalendarX, Euro, Ticket, UserPlus, UserX, Users } from 'lucide-react';
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
import { euroPorPlazaDisponible } from '@/lib/informes/euro-plaza-cliente';
import { pedirPlazasVacias, plazasVaciasDisponible, type EstadoPlazasVacias } from '@/lib/informes/plazas-vacias-cliente';
import { DIAS_CADUCAN_PRONTO, estadoDeLosBonos, type EstadoBonos } from '@/lib/informes/bonos';
import { clientasEnRiesgo, type ClientasEnRiesgo } from '@/lib/informes/riesgo';
import { DIAS_SIN_VENIR } from '@/lib/clientas/estado';
import { BloqueBonos } from '@/components/informes/bloque-bonos';
import { BloqueRiesgo } from '@/components/informes/bloque-riesgo';
import { ReanimarAlCambiar } from '@/components/ui/reanimar-al-cambiar';

// Las pestañas del panel nuevo. La que se ve vive en la URL (?pestana=bonos):
// recargar no devuelve al Resumen y un enlace puede abrir una concreta.
type PestanaInforme = 'resumen' | 'dinero' | 'clases' | 'clientas' | 'bonos';
const PESTANAS: { id: PestanaInforme; nombre: string }[] = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'dinero', nombre: 'Dinero' },
  { id: 'clases', nombre: 'Clases' },
  { id: 'clientas', nombre: 'Clientas' },
  { id: 'bonos', nombre: 'Bonos' },
];

// El mapa de «€ por plaza» (pieza E) entra APAGADO (interruptor
// `INFORMES_EURO_PLAZA`): solo se descarga si el servidor dice que sí. Apagado,
// Informes es la de siempre, sin un byte más.
// Si el trozo no llega (una pestaña abierta antes de un despliegue), no pasa
// nada: Informes sigue como estaba, sin el bloque.
const BloqueEuroPlaza = dynamic(
  () => import('@/components/informes/bloque-euro-plaza').then(m => m.BloqueEuroPlaza).catch(() => function SinBloque() { return null; }),
  { ssr: false },
);

export default function Informes() {
  const {
    recibos, socios, sesiones, reservas, tiposClase, suscripciones, planesTarifa, instructores, ventasPOS, datosIncompletos, dataLoaded,
  } = useStudio();
  const { listo: estadosListos, conteos, porSocio, hechos, ahora: ahoraEstados } = useEstadosClientas();
  const toast = useToast();
  const panelNuevo = usePanelNuevo();
  const avisos: AvisosCobros = useMemo(() => ({ ok: toast.show, error: toast.showError }), [toast.show, toast.showError]);
  const descargas = useDescargaCobrado(avisos);

  const [periodo, setPeriodo] = useState<PeriodoInforme>('MES');

  const [pestana, setPestana] = useState<PestanaInforme>('resumen');
  useEffect(() => {
    if (!panelNuevo) return;
    const p = new URLSearchParams(window.location.search).get('pestana');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: la URL solo existe en el navegador.
    if (p && PESTANAS.some(x => x.id === p)) setPestana(p as PestanaInforme);
  }, [panelNuevo]);
  useEffect(() => {
    if (!panelNuevo) return;
    const url = new URL(window.location.href);
    if (pestana === 'resumen') url.searchParams.delete('pestana');
    else url.searchParams.set('pestana', pestana);
    const destino = url.pathname + url.search;
    if (destino !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', destino);
  }, [pestana, panelNuevo]);
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

  const [euroPlaza, setEuroPlaza] = useState(false);
  useEffect(() => {
    let vivo = true;
    void euroPorPlazaDisponible().then(d => { if (vivo) setEuroPlaza(d); });
    return () => { vivo = false; };
  }, []);

  // «Plazas que dejaron vacías» (P3.15): apagado tras `INFORMES_PLAZAS_VACIAS`.
  // La sonda una vez; si dice que no, la pantalla es la de siempre.
  const [plazasVaciasOn, setPlazasVaciasOn] = useState(false);
  useEffect(() => {
    let vivo = true;
    void plazasVaciasDisponible().then(d => { if (vivo) setPlazasVaciasOn(d); });
    return () => { vivo = false; };
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

  // Las cifras del periodo que se ve. Al cambiar de periodo se vuelve a «Calculando…»:
  // nunca se enseñan las del periodo anterior como si fueran de este.
  const desdeVisible = tramos?.visible.desde ?? null;
  const hastaVisible = tramos?.visible.hasta ?? null;
  const [plazasVacias, setPlazasVacias] = useState<{ clave: string; datos: EstadoPlazasVacias } | null>(null);
  useEffect(() => {
    if (!plazasVaciasOn || !desdeVisible || !hastaVisible) return;
    let vivo = true;
    const clave = `${desdeVisible}_${hastaVisible}`;
    void pedirPlazasVacias(desdeVisible, hastaVisible).then(datos => { if (vivo) setPlazasVacias({ clave, datos }); });
    return () => { vivo = false; };
  }, [plazasVaciasOn, desdeVisible, hastaVisible]);
  const estadoPlazasVacias: EstadoPlazasVacias | null = !plazasVaciasOn ? null
    : plazasVacias && plazasVacias.clave === `${desdeVisible}_${hastaVisible}` ? plazasVacias.datos : { estado: 'cargando' };

  const tipoDePlanDe = useMemo(() => tipoDePlanPorSuscripcion(suscripciones, planesTarifa), [suscripciones, planesTarifa]);
  const datosEuroPlaza = useMemo(() => ({ sesiones, reservas, recibos, tipoDePlanDe }), [sesiones, reservas, recibos, tipoDePlanDe]);

  // ── Dinero ──
  const dinero = useMemo(() => {
    if (!tramos) return null;
    const ctx = { periodo, tipoDePlanDe };
    const actual = dineroDelTramo(recibos, tramos.visible, ctx);
    const anterior = tramos.anterior ? dineroDelTramo(recibos, tramos.anterior, ctx) : null;
    return {
      actual, anterior,
      puntos: serieDelGrafico(periodo, tramos.visible, actual, tramos.anterior && anterior ? { tramo: tramos.anterior, dinero: anterior } : null),
    };
  }, [recibos, tipoDePlanDe, periodo, tramos]);

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

  // Panel nuevo: dos fotos de HOY con las funciones dueñas. `null` = los datos no
  // llegaron enteros (no se enseña un número que podría estar mal); `undefined` =
  // todavía cargando.
  const bonos = useMemo(() => {
    if (!panelNuevo || !hoy || !dataLoaded) return undefined;
    if (datosIncompletos.includes('suscripciones')) return null;
    return estadoDeLosBonos(suscripciones, planesTarifa, hoy);
  }, [panelNuevo, hoy, dataLoaded, datosIncompletos, suscripciones, planesTarifa]);
  const riesgo = useMemo(() => {
    if (!panelNuevo || !dataLoaded) return undefined;
    if (!ahoraEstados) return undefined;
    if (!estadosListos) return null;
    return clientasEnRiesgo(socios, porSocio, hechos, ahoraEstados);
  }, [panelNuevo, dataLoaded, estadosListos, ahoraEstados, socios, porSocio, hechos]);

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
  const planesPorId = new Map(planesTarifa.map(p => [p.id, p.nombre]));
  const nombreCompleto = (id: string) => { const s = sociosPorId.get(id); return s ? `${s.nombre} ${s.apellidos ?? ''}`.trim() : 'Clienta'; };
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

  const titular = panelNuevo ? (
    // Panel nuevo: las cifras del periodo como las de la home, cada una con su color.
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4" data-testid="informe-titular">
      <TarjetaCifra
        etiqueta="Cobrado"
        tono="verde"
        Icono={Euro}
        href={null}
        valor={<CifraPrivada inline>{formatEuro(dinero.actual.neto)}</CifraPrivada>}
        arriba={difCobrado == null ? undefined : <CifraPrivada inline><span className={tonoDiferencia(difCobrado)}>{conSignoEuros(difCobrado)}</span></CifraPrivada>}
        abajo={difCobrado == null ? `${dinero.actual.nCobros} ${dinero.actual.nCobros === 1 ? 'cobro' : 'cobros'}` : frente}
      />
      <TarjetaOcupacion
        etiqueta="Ocupación"
        tono="azul"
        Icono={CalendarCheck}
        href={null}
        ocupacion={{ pct: clases.actual.pct, ocupadas: clases.actual.ocupadas, plazas: clases.actual.aforo, clases: clases.actual.nClases }}
        vacio="No hubo clases en este periodo"
        contexto={puntos == null ? undefined : `${conSigno(puntos, ' puntos')} ${frente}`}
      />
      <TarjetaCifra
        etiqueta="Vinieron"
        tono="magenta"
        Icono={Users}
        href={null}
        valor={clases.actual.sinPasarLista ? '—' : String(clientas.actual.vinieron)}
        arriba={clases.actual.sinPasarLista || difVinieron == null ? undefined : <span className={tonoDiferencia(difVinieron)}>{conSigno(difVinieron)}</span>}
        abajo={clases.actual.sinPasarLista ? 'Sin pasar lista no sabemos quién vino' : difVinieron == null ? 'clientas distintas' : frente}
      />
      <TarjetaCifra
        etiqueta="Nuevas clientas"
        tono="indigo"
        Icono={UserPlus}
        href={null}
        valor={String(nuevasEnTramo(empezaron, visible))}
        {...(() => {
          const antes = tramos.anterior ? nuevasEnTramo(empezaron, tramos.anterior) : null;
          const dif = antes == null ? null : nuevasEnTramo(empezaron, visible) - antes;
          return dif == null
            ? { abajo: 'empezaron en este periodo' }
            : { arriba: <span className={tonoDiferencia(dif)}>{conSigno(dif)}</span>, abajo: frente };
        })()}
      />
    </div>
  ) : (
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
  );
  const bloqueDinero = (
    <BloqueDinero
      periodo={periodo} actual={dinero.actual} anterior={dinero.anterior} puntos={dinero.puntos} comparacion={comparacion}
      ventasSinRecibo={ventasSinRecibo} importado={importadoDelTramo} plataformas={plataformas} onDescargarPlataformas={descargarPlataformas}
    />
  );
  const bloqueClases = (
    <>
      <BloqueClases
        clases={clases.actual} anterior={clases.anterior} comparacion={comparacion} margenes={margenes}
        nombres={{ tipo: id => tiposPorId.get(id), instructora: id => instructorasPorId.get(id) }}
      />
      {euroPlaza && (
        <BloqueEuroPlaza
          datos={datosEuroPlaza} periodo={periodo} visible={visible} hoy={hoy}
          textoPeriodo={textoPeriodoEnFrase(periodo, ref, hoy)}
          datosIncompletos={datosIncompletos.some(t => ['recibos', 'sesiones', 'reservas', 'suscripciones'].includes(t))}
          importado={importadoDelTramo?.actual ?? null}
          nombres={{ tipo: id => tiposPorId.get(id), socia: id => { const s = sociosPorId.get(id); return s ? s.nombre : 'una alumna'; } }}
          onIrA={(p, r) => { setPeriodo(p); setReferencia(r); }}
        />
      )}
    </>
  );
  const bloqueClientas = (
    <BloqueClientas
      clientas={clientas.actual}
      nuevas={nuevasEnTramo(empezaron, visible)}
      nuevasAntes={tramos.anterior ? nuevasEnTramo(empezaron, tramos.anterior) : null}
      comparacion={comparacion}
      sinPasarLista={clases.actual.sinPasarLista}
      nombreDe={nombreCompleto}
      conteos={conteos}
      cohortes={cohortes}
      cohortesListas={estadosListos}
      plazasVacias={estadoPlazasVacias}
    />
  );

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

      {panelNuevo && (
        // Como las pestañas de la ficha de una clienta: en píldora, con su URL.
        <div
          role="tablist"
          aria-label="Temas del informe"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 print:hidden sm:mx-0 sm:w-fit sm:max-w-full sm:rounded-full sm:bg-muted sm:p-1"
        >
          {PESTANAS.map(p => (
            <button
              key={p.id}
              id={`informe-pestana-${p.id}`}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              aria-controls={`informe-panel-${p.id}`}
              onClick={() => setPestana(p.id)}
              className={cn(
                'min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors',
                pestana === p.id ? 'bg-card text-foreground shadow-t-card' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      )}

      {(!panelNuevo || pestana !== 'bonos') && (
        <div className="print:hidden">
          <SelectorPeriodo periodo={periodo} referencia={ref} hoy={hoy} haySiguiente={tramos.haySiguiente} onPeriodo={elegirPeriodo} onMover={mover} />
        </div>
      )}

      {/* `fetchAllRows` puede fallar a media paginación, y eso se veía igual que
          «0 filas»: un número bajo por un fallo de red parecía un dato real. */}
      {datosIncompletos.some(t => ['recibos', 'sesiones', 'reservas', 'suscripciones'].includes(t)) && (
        <p role="alert" className="rounded-xl bg-warning/10 px-4 py-3 text-[13px] font-medium text-foreground">
          Algunos datos no se han podido cargar del todo por un fallo de conexión: las cifras de esta página pueden estar
          incompletas. Recarga la página; si sigue pasando, contacta con soporte.
        </p>
      )}

      {panelNuevo ? (
        <ReanimarAlCambiar clave={pestana} animClassName="tab-content-in" className="space-y-5">
          <PanelInforme id="resumen" visible={pestana}>
            {titular}
            <HoyEnElEstudio riesgo={riesgo} bonos={bonos} onIr={setPestana} />
          </PanelInforme>
          <PanelInforme id="dinero" visible={pestana}>
            {bloqueDinero}
          </PanelInforme>
          <PanelInforme id="clases" visible={pestana}>
            {bloqueClases}
          </PanelInforme>
          <PanelInforme id="clientas" visible={pestana}>
            {/* Lo que se puede hacer hoy, primero: el Resumen trae aquí. */}
            {riesgo !== undefined && <BloqueRiesgo riesgo={riesgo} hoy={hoy} nombreDe={nombreCompleto} />}
            {bloqueClientas}
          </PanelInforme>
          <PanelInforme id="bonos" visible={pestana}>
            {bonos !== undefined && (
              <BloqueBonos estado={bonos} hoy={hoy} nombreDe={nombreCompleto} nombrePlan={id => planesPorId.get(id) ?? 'Bono'} />
            )}
          </PanelInforme>
        </ReanimarAlCambiar>
      ) : (
        <>
          {titular}
          {bloqueDinero}
          {bloqueClases}
          {bloqueClientas}
        </>
      )}

      {toast.message && (
        <Toast key={toast.message} message={toast.message} variant={toast.variant} action={toast.action} onDismiss={toast.dismiss} />
      )}
    </div>
  );
}

/** «septiembre», «el 3.º trimestre», «2026»: el periodo dentro de una frase («Cobrado en …»). */
function textoPeriodoEnFrase(periodo: PeriodoInforme, ref: string, hoy: string): string {
  const t = textoDelPeriodo(periodo, ref, hoy);
  if (periodo === 'MES') return t.charAt(0).toLowerCase() + t.slice(1);
  if (periodo === 'TRIMESTRE') return `el ${t}`;
  return t;
}

/** Una pestaña de Informes (panel nuevo). Las demás siguen montadas y salen al imprimir: el PDF lleva el informe entero. */
function PanelInforme({ id, visible, children }: { id: PestanaInforme; visible: PestanaInforme; children: React.ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`informe-panel-${id}`}
      aria-labelledby={`informe-pestana-${id}`}
      className={cn('space-y-5', id !== visible && 'hidden print:block')}
    >
      {children}
    </div>
  );
}

/** El Resumen del panel nuevo: lo que hay HOY en riesgo y en bonos, y un toque lleva a su pestaña. */
function HoyEnElEstudio({ riesgo, bonos, onIr }: {
  /** `undefined`: cargando; `null`: los datos no llegaron enteros. */
  riesgo: ClientasEnRiesgo | null | undefined;
  bonos: EstadoBonos | null | undefined;
  onIr: (p: PestanaInforme) => void;
}) {
  const ir = (p: PestanaInforme) => (e: { preventDefault: () => void }) => { e.preventDefault(); onIr(p); };
  const sinDato = (x: null | undefined) => (x === null ? 'No se ha podido cargar' : 'Cargando…');
  const caducan = bonos?.sesionesQueCaducan ?? 0;
  return (
    <section aria-labelledby="informe-hoy" className="space-y-3" data-testid="informe-hoy">
      <h2 id="informe-hoy" className="text-[13px] font-semibold text-muted-foreground">Hoy, sin depender del periodo</h2>
      <div className="grid gap-3 sm:grid-cols-3 xl:gap-4">
        <TarjetaCifra
          etiqueta="Sin renovar"
          tono="magenta"
          Icono={UserX}
          href="/informes?pestana=clientas"
          onNavigate={ir('clientas')}
          valor={riesgo ? String(riesgo.sinRenovar.length) : '—'}
          abajo={riesgo ? 'se les acabó el plan y no han vuelto a comprar' : sinDato(riesgo)}
        />
        <TarjetaCifra
          etiqueta="Activas sin venir"
          tono="azul"
          Icono={CalendarX}
          href="/informes?pestana=clientas"
          onNavigate={ir('clientas')}
          valor={riesgo ? String(riesgo.activasSinVenir.length) : '—'}
          abajo={riesgo ? `más de ${DIAS_SIN_VENIR} días sin venir a clase` : sinDato(riesgo)}
        />
        <TarjetaCifra
          etiqueta="Bonos por caducar"
          tono="indigo"
          Icono={Ticket}
          href="/informes?pestana=bonos"
          onNavigate={ir('bonos')}
          valor={bonos ? String(bonos.caducanPronto.length) : '—'}
          abajo={!bonos ? sinDato(bonos)
            : caducan === 0 ? `en los próximos ${DIAS_CADUCAN_PRONTO} días con sesiones sin usar`
              : `con ${caducan} ${caducan === 1 ? 'sesión' : 'sesiones'} sin usar, en ${DIAS_CADUCAN_PRONTO} días`}
        />
      </div>
    </section>
  );
}
