'use client';

// CLASES — vista de presentación, desacoplada de la sesión real (Fase 5 del
// editor de temas: vista previa completa de la app de socias).
//
// Extraída de app/portal/[slug]/clases/page.tsx, que ahora es un wrapper fino
// (usePortalAuth real). Misma idea que PortalHomeView: recibe `session` por
// prop en vez de leer usePortalAuth() directamente, así se puede montar tanto
// con una socia real como con la sesión de muestra de /portal-preview/[slug]
// (lib/theme/preview-sesion-muestra.ts) sin duplicar 550 líneas de JSX.
//
// `escribible = false` (solo en preview): las acciones de escritura
// (reservar, cancelar, marcar favorita, pedir pase) NO llaman a useStudio()/a
// la API real — la propietaria ve el mismo flujo de UI (abrir la hoja de
// reserva, el bottom sheet de cancelación) sin dejar rastro en `reservas` con
// un socioId ficticio que no existe en `socios` (rompería cualquier FK real
// si se dejara pasar).
//
// La preparación de datos es la de siempre (mismos índices en una pasada, misma
// cobertura de plan, misma ventana de cancelación). Lo que cambia es la
// composición y, sobre todo, que esta pantalla deja de usar `ReservaCalendario`.
//
// POR QUÉ SE DESACOPLA (del componente de calendario, motivo original):
// `ReservaCalendario` lo comparten esta pantalla y `/reservar/[slug]`, y desde
// el rediseño **tienen diseños distintos** — el portal va por el prototipo y
// la página pública por `Reservas.dc.html`. Mantenerlo compartido obligaría a
// un solo componente a servir dos lenguajes visuales, que es como se acaba con
// props tipo `variant` que nadie entiende. La LÓGICA no se duplica: sigue en
// `useStudio()` y en `lib/booking-logic`; lo que se separa es la presentación.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Star, Search } from 'lucide-react';
import { BuscarOverlay } from '@/components/portal/buscar-overlay';
import { useStudio, REFRESCO_ACTIVO_MS } from '@/lib/studio-context';
import { tieneCoberturaPlan } from '@/lib/portal-home-logic';
import { esCancelacionTardia, heredaOverride } from '@/lib/booking-logic';
import { alternativasTras, cuandoSugerencia, type SugerenciaClase } from '@/lib/portal-sugerencias';
import { useModo } from '@/lib/portal-modo';
import { HojaReserva, type ClaseParaReservar, type ResultadoConfirmar } from '@/components/portal/hoja-reserva';
import { HojaPase } from '@/components/portal/hoja-pase';
import { BottomSheet, Button, Toast, AforoIndicator, type AvisoToast } from '@/components/portal/ui';
import { pedirPaseDeAcceso, portalAuthHeader } from '@/lib/api-client';
import { fetchQuienVaAEstaClase, type QuienVaAEstaClase } from '@/lib/social-companeras-portal.ts';
import { EASE, dur, transicion, display, micro, texto, radio, sombra, escala } from '@/lib/portal-design';
import { bloquesVisibles, type BloqueHome } from '@/lib/portal-home-bloques';
import { BloqueHomeRender } from '@/components/portal/bloque-home-render';
import type { PortalSession } from '@/lib/portal-auth';
import type { DatosPase } from '@/components/portal/hoja-pase';
import type { Reserva, Spot } from '@/lib/types';
import { BandaFoto } from '@/components/portal/banda-foto';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';

type Vista = 'todas' | 'mias';

const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];
const RESERVA_ACTIVA: Reserva['estado'][] = ['CONFIRMADA', 'LISTA_ESPERA'];
const LETRA_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/** Lunes de la semana de `d`, a las 00:00. */
function lunesDe(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // getDay(): 0 = domingo. El domingo pertenece a la semana que TERMINA, así
  // que retrocede seis días, no cero.
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const claveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Stub de "pedir pase" para preview: NO llama a la API real (socioId ficticio,
// 404/error garantizado) — devuelve un pase de muestra para que la hoja se
// vea con contenido real en vez de un error o un hueco en blanco.
async function pedirPaseDeMuestra(): Promise<DatosPase> {
  return {
    hayPase: true, vigente: true, yaAsistida: false, codigo: 'PREVIEW', token: null,
    paseHasta: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

export function PortalClasesView({
  session, escribible = true, bloquesOverride,
}: { session: PortalSession | null; escribible?: boolean; bloquesOverride?: BloqueHome[] }) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    sesiones, reservas, tiposClase, salas, instructores, spots,
    planesTarifa, suscripciones, studio, addReserva, cancelarReserva,
    favoritos, toggleFavorito, bloquesClases: bloquesClasesPublicado, refrescarAforo,
  } = useStudio();
  const { t, noche } = useModo();
  const socioId = session?.socioId ?? null;

  // El aforo que se ve aquí es el del último `cargarPublico()` (al montar, o
  // al volver a primer plano si pasaron 15s+). Si otra socia ocupa la última
  // plaza mientras esta pantalla sigue abierta, no se entera hasta que pasa
  // una de esas dos cosas — la queja de "no parece tiempo real". Realtime de
  // verdad queda fuera de esta fase a propósito (ver REFRESCO_ACTIVO_MS en
  // studio-context.tsx); un intervalo corto MIENTRAS esta pantalla está
  // montada corrige el caso real: la socia mirando el calendario mientras
  // alguien reserva a la vez. Se usa un ref para no reiniciar el intervalo en
  // cada render (recargarPublico es una función nueva por render).
  //
  // El tic pide SOLO el aforo (`refrescarAforo`), no `recargarPublico`: este
  // último trae el catálogo entero del estudio y el histórico financiero de la
  // socia, que no cambian en cinco segundos. Y se salta el tic con la pestaña
  // oculta, porque entonces no lo ve nadie.
  const recargarRef = useRef(refrescarAforo);
  useEffect(() => { recargarRef.current = refrescarAforo; });
  useEffect(() => {
    if (!escribible) return; // preview: sin servidor real que consultar
    // Con la pestaña oculta no hay nadie mirando el aforo, así que el tic no
    // aporta nada y sí cuesta. Al volver a primer plano re-sincroniza el
    // listener de `visibilitychange` de studio-context.tsx, así que pausar aquí
    // no deja datos rancios a la vista.
    const id = setInterval(() => {
      if (document.hidden) return;
      recargarRef.current();
    }, REFRESCO_ACTIVO_MS);
    return () => clearInterval(id);
  }, [escribible]);

  // Constructor de bloques (Fase 1 del Theme Builder, generaliza Fase 3): el
  // calendario de clases es el único bloque `sistema` de esta pantalla — se
  // ordena por CSS `order` sin mover el DOM, mismo mecanismo que Inicio. Los
  // bloques del catálogo se intercalan como hermanos antes o después.
  const bloques = bloquesOverride ?? bloquesClasesPublicado;
  const bloquesOrdenados = useMemo(() => bloquesVisibles(bloques), [bloques]);
  const wrap = (sistemaId: 'listadoClases') => {
    const i = bloquesOrdenados.findIndex((b) => b.kind === 'sistema' && b.sistemaId === sistemaId);
    return { style: { order: i === -1 ? 0 : i } };
  };
  /**
   * El texto de un bloque de SISTEMA, ya resuelto. `resolverBloques` rellena
   * lo que el estudio no haya tocado con el literal de siempre, así que sin
   * config guardada esto devuelve exactamente lo que se pintaba antes.
   */
  const txt = (sistemaId: 'listadoClases', campo: string, siVacio: string): string => {
    const b = bloquesOrdenados.find((x) => x.kind === 'sistema' && x.sistemaId === sistemaId);
    const v = b && b.kind === 'sistema' ? b.config?.[campo] : undefined;
    // ⚠️ La cadena VACÍA cuenta como "no puesto" y cae al literal de quien
    // llama — el parámetro se llama `siVacio`. Sin esto, un campo cuyo
    // `porDefecto` es '' (como `fraseConClase`, que va vacío a propósito para
    // que cada variante de cabecera conserve SU frase) borraba el texto en vez
    // de heredarlo. Lo cazó el e2e de la cabecera `titular` en CI.
    return typeof v === 'string' && v !== '' ? v : siVacio;
  };

  const bloquesPersonalizados = useMemo(
    () => bloquesOrdenados
      .map((b, i) => ({ b, orden: i }))
      .filter((x): x is { b: Exclude<BloqueHome, { kind: 'sistema' }>; orden: number } => x.b.kind !== 'sistema'),
    [bloquesOrdenados],
  );

  const [vista, setVista] = useState<Vista>('todas');
  const [semana, setSemana] = useState(0);
  const [diaElegido, setDiaElegido] = useState<number | null>(null);
  // Estado inicial desde `?tipo=` (BuscarOverlay navega aquí con ese query al
  // tocar un resultado de tipo de clase) — se lee UNA vez al montar, como
  // `diaElegido`; el efecto de abajo cubre el caso en que esta pantalla YA
  // está montada y el overlay navega a la MISMA ruta con otro `?tipo=`
  // (mismo pathname, portal-shell.tsx no la remonta).
  const [tipoElegido, setTipoElegido] = useState<string | null>(() => searchParams?.get('tipo') ?? null);
  useEffect(() => {
    const q = searchParams?.get('tipo') ?? null;
    if (!q) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL (sistema externo): BuscarOverlay puede navegar aquí con OTRO `?tipo=` mientras esta pantalla ya está montada.
    setTipoElegido(q);
    setVista('todas');
  }, [searchParams]);
  // 'favoritas' es un valor especial de `tipoElegido`: reutiliza el mismo
  // estado que ya filtra por tipo de clase, en vez de un segundo booleano que
  // tendría que sincronizarse con él.
  const FAVORITAS = '__favoritas__';
  const idsFavoritos = useMemo(() => new Set(favoritos.map(f => f.tipoClaseId)), [favoritos]);
  // Derivado, no estado: si se queda sin favoritos con el filtro puesto (p.ej.
  // desmarca su última favorita), el chip "Favoritas" desaparece de la fila —
  // sin esto el listado se quedaba vacío sin ningún control visible para
  // volver a "Todas". Tratarlo como valor derivado (en vez de sincronizarlo
  // con un efecto que llama a setTipoElegido) evita un render en cascada.
  const tipoEfectivo = tipoElegido === FAVORITAS && idsFavoritos.size === 0 ? null : tipoElegido;
  const [reservandoId, setReservandoId] = useState<string | null>(null);
  // "Quién más va" (Community & Messaging OS, mismo patrón que
  // app/portal/[slug]/clases/[sesionId]/page.tsx) — se pide SOLO mientras hay
  // una clase abierta en la hoja, nunca para las 7+ de la lista a la vez.
  const [quienVa, setQuienVa] = useState<QuienVaAEstaClase | null>(null);
  const [cancelando, setCancelando] = useState<{ sesion: { inicio: string; tipoClaseId: string }; mia: Reserva | null } | null>(null);
  const [paseAbierto, setPaseAbierto] = useState<{ nombre: string; sub: string } | null>(null);
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  // Tras cancelar, las clases con las que puede recuperar esa sesión. Antes,
  // cancelar terminaba en un toast ("Reserva cancelada.") y un callejón: la
  // socia se quedaba sin plaza y sin ninguna alternativa delante.
  const [recuperacion, setRecuperacion] = useState<{ sesionId: string; opciones: SugerenciaClase[] } | null>(null);

  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;

  const activeSus = useMemo(() =>
    suscripciones.find(s => s.socioId === socioId && s.estado === 'ACTIVA') ?? null,
  [suscripciones, socioId]);
  const planActivo = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) ?? null : null;
  const cubierta = tieneCoberturaPlan(activeSus, planActivo);

  // Índices en una pasada — evita recorrer `reservas` por cada sesión.
  const { ocupadasPorSesion, spotsOcupadosPorSesion, miReservaPorSesion } = useMemo(() => {
    const ocupadas = new Map<string, number>();
    const spotsOcup = new Map<string, string[]>();
    const mia = new Map<string, Reserva>();
    for (const r of reservas) {
      if (OCUPA_PLAZA.includes(r.estado)) {
        ocupadas.set(r.sesionId, (ocupadas.get(r.sesionId) ?? 0) + 1);
        if (r.spotId) {
          const arr = spotsOcup.get(r.sesionId) ?? [];
          arr.push(r.spotId);
          spotsOcup.set(r.sesionId, arr);
        }
      }
      if (socioId && r.socioId === socioId && RESERVA_ACTIVA.includes(r.estado)) mia.set(r.sesionId, r);
    }
    return { ocupadasPorSesion: ocupadas, spotsOcupadosPorSesion: spotsOcup, miReservaPorSesion: mia };
  }, [reservas, socioId]);

  const spotsPorSala = useMemo(() => {
    const m = new Map<string, Spot[]>();
    for (const sp of spots) {
      if (!sp.activo) continue;
      const arr = m.get(sp.salaId) ?? [];
      arr.push(sp);
      m.set(sp.salaId, arr);
    }
    return m;
  }, [spots]);

  // Estable durante la vida de la página: con Date.now() la dependencia sería
  // nueva en cada render y no se memoizaría nada.
  const ahora = useMemo(() => new Date(), []);
  const dias = useMemo(() => {
    const l = lunesDe(ahora);
    l.setDate(l.getDate() + semana * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(l);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [ahora, semana]);

  // El día activo por defecto: hoy si cae en la semana que se mira, y si no, el
  // lunes. Sin esto, al pasar de semana quedaba señalado un día fuera de vista.
  const indiceHoy = dias.findIndex(d => claveDia(d) === claveDia(ahora));
  const diaActivo = diaElegido ?? (indiceHoy >= 0 ? indiceHoy : 0);

  const decorar = useMemo(() => (s: typeof sesiones[number]) => {
    const ocupadas = ocupadasPorSesion.get(s.id) ?? 0;
    return {
      sesion: s,
      tipo: tiposClase.find(tc => tc.id === s.tipoClaseId),
      sala: salas.find(sl => sl.id === s.salaId),
      instr: instructores.find(i => i.id === s.instructorId),
      mia: miReservaPorSesion.get(s.id) ?? null,
      ocupadas,
      libres: Math.max(0, s.aforoMaximo - ocupadas),
      pasada: new Date(s.inicio) < ahora,
    };
  }, [ocupadasPorSesion, tiposClase, salas, instructores, miReservaPorSesion, ahora]);

  const clases = useMemo(() => {
    const dia = dias[diaActivo];
    if (!dia) return [];
    const clave = claveDia(dia);
    return sesiones
      .filter(s => !s.cancelada && s.inicio.slice(0, 10) === clave)
      .filter(s => tipoEfectivo === FAVORITAS ? idsFavoritos.has(s.tipoClaseId) : (!tipoEfectivo || s.tipoClaseId === tipoEfectivo))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(decorar);
  }, [dias, diaActivo, sesiones, tipoEfectivo, idsFavoritos, decorar]);

  const misClases = useMemo(() =>
    sesiones
      .filter(s => !s.cancelada && miReservaPorSesion.has(s.id) && new Date(s.inicio) >= ahora)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(decorar),
  [sesiones, miReservaPorSesion, ahora, decorar]);

  const confirmadas = misClases.filter(c => c.mia?.estado === 'CONFIRMADA').length;
  const lista = vista === 'todas' ? clases : misClases;

  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const minutos = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

  function abrirReserva(c: typeof clases[number]) {
    setReservandoId(c.sesion.id);
  }

  // Objeto derivado, no snapshot: antes `abrirReserva` congelaba el aforo/las
  // plazas al momento de abrir, así que el refresco activo de 5s
  // (REFRESCO_ACTIVO_MS) actualizaba la LISTA detrás de la hoja pero no lo
  // que la hoja misma mostraba — la propia garantía que ese refresco existe
  // para dar quedaba rota justo donde más importa (la socia a punto de
  // confirmar). Recalcularlo en cada render, igual que ya hacía
  // `claseParaReservar` en la página de detalle de clase, lo mantiene vivo.
  const reservando: ClaseParaReservar | null = useMemo(() => {
    if (!reservandoId) return null;
    const s = sesiones.find(x => x.id === reservandoId);
    if (!s) return null;
    const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
    const sala = salas.find(sl => sl.id === s.salaId);
    const instr = instructores.find(i => i.id === s.instructorId);
    // Fase 1 de reglas por tipo de clase: la ventana de cancelación real de
    // ESTA clase, nunca un "12h" fijo — mismo cálculo que ya usa `tardiaDe()`
    // más abajo, pasado por `heredaOverride()` (lib/booking-logic.ts) en vez
    // de reescribir el `??` a mano una segunda vez.
    const ventanaCancelacionHoras = heredaOverride(tipo?.ventanaCancelacionHoras ?? null, studio?.cancelacionVentanaHoras ?? 0);
    // Cuenta REAL de quién ya espera turno para esta sesión (estado
    // LISTA_ESPERA en `reservas`, que en el portal ya trae los recuentos
    // públicos de TODAS las socias — ver studio-context.tsx). Nunca una
    // posición inventada.
    const enEspera = reservas.filter(r => r.sesionId === s.id && r.estado === 'LISTA_ESPERA').length;
    return {
      id: s.id, inicio: s.inicio, fin: s.fin,
      nombre: tipo?.nombre ?? 'Clase',
      nivel: tipo?.nivel === 'TODOS' ? 'Todos los niveles' : tipo?.nivel ?? null,
      salaNombre: sala?.nombre ?? null,
      instructorNombre: instr?.nombre ?? null,
      instructorFotoUrl: instr?.fotoUrl ?? null,
      instructorId: instr?.id ?? null,
      aforoMaximo: s.aforoMaximo,
      ocupadas: ocupadasPorSesion.get(s.id) ?? 0,
      spots: spotsPorSala.get(s.salaId) ?? [],
      spotsOcupados: spotsOcupadosPorSesion.get(s.id) ?? [],
      precio: cubierta ? null : precioClaseSuelta,
      sesionesTrasReservar: cubierta && activeSus?.sesionesRestantes != null
        ? Math.max(0, activeSus.sesionesRestantes - 1)
        : null,
      ventanaCancelacionHoras,
      enEspera,
    };
  }, [
    reservandoId, sesiones, tiposClase, salas, instructores, ocupadasPorSesion,
    spotsPorSala, spotsOcupadosPorSesion, cubierta, precioClaseSuelta, activeSus,
    studio?.cancelacionVentanaHoras, reservas,
  ]);

  // "Quién más va" — el mismo fetch/patrón que la página de detalle de clase
  // (app/portal/[slug]/clases/[sesionId]/page.tsx), disparado cuando se abre
  // una clase concreta en la hoja. En preview (`escribible=false`) no hay
  // sesión real ni socioId real que consultar, así que ni se intenta.
  useEffect(() => {
    if (!reservandoId || !studio?.id || !socioId || !escribible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpia la compañera de la clase ANTERIOR al cerrar la hoja o cambiar de clase; sincroniza con la identidad de `reservandoId`, no con el propio render.
      setQuienVa(null);
      return;
    }
    let vivo = true;
    (async () => {
      const headers = await portalAuthHeader();
      const r = await fetchQuienVaAEstaClase(headers, studio.id, reservandoId);
      if (!vivo) return;
      if ('error' in r) return; // silencioso: es un extra, no un dato crítico de la clase.
      setQuienVa(r);
    })();
    return () => { vivo = false; };
  }, [reservandoId, studio?.id, socioId, escribible]);

  // Devuelve el resultado a `HojaReserva`, que posee el morph del botón y el
  // cierre de la hoja (~1.2s tras el éxito) — este sitio ya no cierra
  // `reservando` a mano. Sigue sin haber optimismo: `addReserva` se espera
  // entero antes de decir nada (bug #500).
  async function confirmar(spotId: string | null): Promise<ResultadoConfirmar> {
    if (!reservando || !socioId) return { ok: false, error: 'No se ha podido confirmar la reserva.' };
    if (!escribible) {
      setAviso({ texto: 'Vista previa: esta reserva no se guarda de verdad.', error: false });
      return { ok: true, estado: 'CONFIRMADA' };
    }
    const r = await addReserva(reservando.id, socioId, spotId);
    if (!r.ok) return { ok: false, error: r.error };
    setAviso({
      // ⚠️ Si eligió sitio y el servidor no pudo dárselo, se DICE. La reserva
      // es buena; la plaza no, y son dos cosas distintas — sin esto se
      // presentaba esperando el reformer que había elegido y era de otra.
      texto: r.estado === 'LISTA_ESPERA'
        ? 'La clase estaba completa: te hemos puesto en la lista de espera.'
        : r.estado === 'PENDIENTE_APROBACION'
          ? 'Reserva enviada: queda pendiente de aprobación.'
          : spotId && !r.spotAsignado
            ? 'Reservada, pero el sitio que elegiste lo cogieron antes. Te lo asignamos al llegar.'
            : 'Reservada. Te esperamos.',
      error: false,
    });
    return { ok: true, estado: r.estado };
  }

  // Antes: si la cancelación era tardía, `window.confirm()` nativo (sin marca,
  // podía comportarse raro en un PWA instalado); si no era tardía, cancelaba
  // DIRECTO sin preguntar nada — un toque accidental con el pulgar perdía la
  // plaza sin poder deshacerlo. Ahora siempre confirma, con el mismo
  // BottomSheet que el resto del portal (/reservas, detalle de clase).
  function cancelar(c: { sesion: { inicio: string; tipoClaseId: string }; mia: Reserva | null }) {
    if (!c.mia) return;
    setCancelando(c);
  }

  function tardiaDe(c: { sesion: { inicio: string; tipoClaseId: string } }): { tardia: boolean; ventana: number } {
    const ventana = tiposClase.find(tc => tc.id === c.sesion.tipoClaseId)?.ventanaCancelacionHoras
      ?? studio?.cancelacionVentanaHoras ?? 0;
    return { tardia: esCancelacionTardia(c.sesion.inicio, new Date(), ventana), ventana };
  }

  function marcarFavorita(tipoClaseId: string, accion: 'marcar' | 'desmarcar') {
    if (!escribible) return;
    void toggleFavorito(tipoClaseId, accion);
  }

  const circulo: React.CSSProperties = {
    width: 38, height: 38, borderRadius: '50%',
    border: `1px solid ${noche ? 'rgba(243,241,233,.14)' : 'rgba(34,38,31,.14)'}`,
    background: noche ? 'rgba(28,31,23,.7)' : 'rgba(255,255,255,.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: t.muted2, cursor: 'pointer',
    transition: transicion(['background'], dur.color),
  };

  const rangoSemana = `${dias[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — ${dias[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
    .replace(/\./g, '').toUpperCase();

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink, paddingTop: 62 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div {...wrap('listadoClases')}>
      {/* La foto de ESTA pantalla, o la banda por defecto. Es la única
          superficie del portal que se ve sin velo ni degradado encima. */}
      <BandaFoto url={imagenDeEstudio('banda', txt('listadoClases', 'fotoUrl', ''))} />
      <div style={{ padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...micro(9.5, 0.28), color: t.micro, whiteSpace: 'nowrap' }}>{rangoSemana}</div>
            <h1 style={{ ...display(escala('titulo-pantalla', 50)), color: t.ink, marginTop: 12 }}>{txt('listadoClases', 'titulo', 'Clases')}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
            {/* Punto de entrada al overlay BUSCAR (Tentare Studio App.dc.html),
                mismo círculo que las flechas de semana — nunca un push de
                ruta, solo abre el overlay encima de esta pantalla. */}
            <button type="button" aria-label="Buscar" onClick={() => setBuscarAbierto(true)} style={circulo}>
              <Search size={15} strokeWidth={2} />
            </button>
            <button type="button" aria-label="Semana anterior" onClick={() => { setSemana(s => s - 1); setDiaElegido(0); }} style={circulo}>←</button>
            <button type="button" aria-label="Semana siguiente" onClick={() => { setSemana(s => s + 1); setDiaElegido(0); }} style={circulo}>→</button>
          </div>
        </div>

        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center', height: 46, marginTop: 22,
          padding: 5, borderRadius: 23,
          background: noche ? 'rgba(28,31,23,.6)' : 'rgba(255,255,255,.6)',
          border: `1px solid ${t.line}`,
        }}>
          <span
            aria-hidden
            style={{
              position: 'absolute', left: 5, top: 5, bottom: 5, width: 'calc((100% - 10px) / 2)',
              borderRadius: 18, background: noche ? t.surface2 : '#FFFFFF', boxShadow: sombra.pastilla,
              transform: `translateX(${vista === 'todas' ? 0 : 100}%)`,
              transition: `transform ${dur.tab}ms ${EASE}`, pointerEvents: 'none',
            }}
          />
          {([['todas', 'Todas las clases'], ['mias', `Mis reservas · ${confirmadas}`]] as const).map(([id, etiqueta]) => (
            <button
              key={id} type="button" onClick={() => setVista(id)} aria-pressed={vista === id}
              style={{
                position: 'relative', flex: 1, textAlign: 'center', background: 'none', border: 'none',
                fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
                color: vista === id ? t.ink : t.muted, transition: 'color 350ms ease',
              }}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {vista === 'todas' && (
        <>
          {(tiposClase.length > 1 || idsFavoritos.size > 0) && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '18px 24px 4px', scrollbarWidth: 'none' } as React.CSSProperties}>
              {[{ id: null as string | null, nombre: 'Todas', color: null as string | null },
                ...(idsFavoritos.size > 0 ? [{ id: FAVORITAS, nombre: 'Favoritas', color: null as string | null }] : []),
                ...tiposClase.map(tc => ({ id: tc.id, nombre: tc.nombre, color: tc.color }))].map(chip => {
                const activo = tipoEfectivo === chip.id;
                return (
                  <button
                    key={chip.id ?? 'todas'} type="button" onClick={() => setTipoElegido(chip.id)} aria-pressed={activo}
                    style={{
                      // `radioTema.chip` del tema (varsRadioTema, lib/theme-runtime.ts).
                      // Sin ese campo —hoy, ningún tema lo declara— cae al 18 de
                      // siempre, así que el cambio es no-op hasta que un tema lo pida.
                      flex: '0 0 auto', height: 36, padding: chip.color ? '0 16px' : '0 18px',
                      borderRadius: 'var(--portal-radius-chip, 18px)',
                      background: activo ? 'var(--portal-brand)' : (noche ? 'rgba(28,31,23,.7)' : 'rgba(255,255,255,.7)'),
                      color: activo ? 'var(--portal-brand-foreground)' : t.muted2,
                      border: `1px solid ${activo ? 'transparent' : t.line}`,
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 11.5, fontWeight: 500, fontFamily: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer',
                      transition: transicion(['background', 'color'], 300),
                    }}
                  >
                    {chip.id === FAVORITAS && <Star size={12} fill={activo ? 'currentColor' : 'none'} />}
                    {chip.color && !activo && <span style={{ width: 6, height: 6, borderRadius: '50%', background: chip.color }} />}
                    {chip.nombre}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ position: 'relative', display: 'flex', margin: '20px 24px 0', paddingBottom: 18, borderBottom: `1px solid ${t.line}` }}>
            <span
              aria-hidden
              style={{
                position: 'absolute', left: 0, top: 0, width: 'calc(100% / 7)', height: 72,
                display: 'flex', justifyContent: 'center', pointerEvents: 'none',
                transform: `translateX(${diaActivo * 100}%)`,
                transition: `transform 550ms ${EASE}`,
              }}
            >
              {/* Mismo criterio que los chips de arriba: con `radioTema.chip`
                  la píldora del día pasa a cápsula (999) como en el prototipo;
                  sin él, el 22 de siempre. */}
              <span style={{ width: 44, height: 72, borderRadius: 'var(--portal-radius-chip, 22px)', background: 'var(--portal-brand)', boxShadow: '0 12px 24px -14px rgba(34,42,30,.6)' }} />
            </span>
            {dias.map((d, i) => {
              const activo = i === diaActivo;
              const pasado = claveDia(d) < claveDia(ahora);
              return (
                <button
                  key={d.toISOString()} type="button" onClick={() => setDiaElegido(i)} aria-pressed={activo}
                  aria-label={d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  style={{
                    position: 'relative', flex: 1, height: 72, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 7,
                    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '.16em', color: activo ? 'color-mix(in srgb, var(--portal-brand-foreground) 65%, transparent)' : t.micro }}>
                    {LETRA_DIA[d.getDay()]}
                  </span>
                  <span style={{ ...display(21), color: activo ? 'var(--portal-brand-foreground)' : (pasado ? t.micro : t.ink) }}>
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div style={{ padding: '26px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lista.length === 0 ? (
          <p style={{ ...display(16, true), color: t.muted2, textAlign: 'center', padding: '22px 0' }}>
            {vista === 'mias'
              ? txt('listadoClases', 'vacioMias', 'Todavía no tienes ninguna clase reservada.')
              : txt('listadoClases', 'vacioDia', 'No hay clases este día.')}
          </p>
        ) : lista.map(c => {
          const reservada = !!c.mia;
          const completa = c.libres <= 0 && !reservada;
          const spotMio = c.mia?.spotId ? spots.find(sp => sp.id === c.mia!.spotId) : null;
          const esFavorita = idsFavoritos.has(c.sesion.tipoClaseId);

          return (
            <div
              key={c.sesion.id}
              style={{
                position: 'relative',
                borderRadius: `var(--portal-radius-card, ${radio.card}px)`, padding: 20, display: 'flex', gap: 18,
                background: reservada
                  ? (noche ? t.surface2 : '#EEF0EA')
                  : (completa || c.pasada ? (noche ? 'rgba(28,31,23,.5)' : 'rgba(255,255,255,.5)') : t.surface),
                border: `1px solid ${reservada ? (noche ? 'rgba(169,187,160,.22)' : 'rgba(44,53,44,.16)') : 'transparent'}`,
                boxShadow: reservada || completa || c.pasada ? undefined : '0 14px 32px -24px rgba(34,42,30,.5)',
                opacity: c.pasada ? 0.6 : 1,
              }}
            >
              <div style={{ flex: '0 0 52px' }}>
                <div style={{ ...display(26), color: completa || c.pasada ? t.muted2 : t.ink }}>{hora(c.sesion.inicio)}</div>
                <div style={{ ...texto.nota, fontSize: 10, color: t.muted2, marginTop: 6 }}>{minutos(c.sesion.inicio, c.sesion.fin)} min</div>
              </div>
              <div style={{ width: 1, background: t.line }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {reservada && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--portal-brand)' }} />
                    <span style={{ ...micro(8.5, 0.24, 600), color: t.ink }}>
                      {c.mia!.estado === 'LISTA_ESPERA'
                        ? 'En lista de espera'
                        : spotMio ? `Reservada · plaza ${spotMio.numero}` : 'Reservada'}
                    </span>
                  </div>
                )}
                <div style={{ ...display(23, reservada, 1.05), color: completa || c.pasada ? t.muted2 : t.ink, textWrap: 'pretty' } as React.CSSProperties}>
                  {c.tipo?.nombre ?? 'Clase'}
                </div>
                <div style={{ ...texto.nota, color: t.muted, marginTop: 6 }}>
                  {[c.tipo?.nivel === 'TODOS' ? 'Todos los niveles' : c.tipo?.nivel, c.sala?.nombre, reservada ? c.instr?.nombre : null].filter(Boolean).join(' · ')}
                </div>
                {!reservada && c.instr && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14 }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', flex: '0 0 26px', background: c.instr.color ?? t.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#FFFFFF' }}>
                      {c.instr.nombre.trim()[0]?.toUpperCase()}
                    </span>
                    <span style={{ ...texto.metaFuerte, fontSize: 11.5, color: t.muted2 }}>{c.instr.nombre}</span>
                  </div>
                )}
              </div>
              {c.tipo?.fotoUrl && (
                <div style={{ flex: '0 0 52px', width: 52, height: 52, borderRadius: 14, overflow: 'hidden', alignSelf: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.tipo.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: completa || c.pasada ? 0.6 : 1 }} />
                </div>
              )}
              {/* ⚠️ El hueco de arriba es para el icono de favorita, que va en
                  `position: absolute` en la esquina (top 10, alto 26). Antes
                  se apartaba el texto de plazas hacia la IZQUIERDA con un
                  relleno, y eso depende de lo largo que sea el texto: con
                  "8 plazas libres" el icono seguía cayéndole encima. Apartarlo
                  hacia ABAJO no depende de nada — el icono acaba en el píxel
                  36 y esta columna empieza después, mida lo que mida. */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                justifyContent: 'space-between', gap: 8,
                paddingTop: socioId && c.tipo ? 30 : 0,
              }}>
                {!reservada && (
                  <AforoIndicator
                    libres={c.libres}
                    umbralUrgencia={3}
                    style={{ fontSize: 10.5, fontWeight: 500, whiteSpace: 'nowrap' }}
                  />
                )}
                {reservada ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    {(studio?.requiereCheckinQr ?? true) && (
                      <button
                        type="button"
                        onClick={() => setPaseAbierto({ nombre: c.tipo?.nombre ?? 'Clase', sub: `${hora(c.sesion.inicio)} · ${c.sala?.nombre ?? ''}` })}
                        style={{ ...texto.nota, fontSize: 10.5, fontWeight: 500, color: t.ink, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Ver mi pase
                      </button>
                    )}
                    <button
                      type="button" onClick={() => cancelar(c)}
                      style={{ ...texto.nota, fontSize: 10.5, color: t.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : c.pasada ? null : completa ? (
                  <button
                    type="button" onClick={() => abrirReserva(c)}
                    style={{
                      height: 34, padding: '0 16px', borderRadius: 'var(--portal-radius-boton, 17px)', border: `1px solid ${t.line}`,
                      background: 'none', fontSize: 10.5, fontWeight: 500, color: t.muted2,
                      whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Lista de espera
                  </button>
                ) : (
                  <button
                    type="button" onClick={() => abrirReserva(c)}
                    aria-label={`Reservar ${c.tipo?.nombre ?? 'clase'} a las ${hora(c.sesion.inicio)}`}
                    style={{
                      width: 38, height: 38, borderRadius: '50%', background: 'var(--portal-brand)',
                      color: 'var(--portal-brand-foreground)', fontSize: 15, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: transicion(['transform']),
                    }}
                  >
                    →
                  </button>
                )}
              </div>
              {socioId && c.tipo && (
                <button
                  type="button"
                  aria-label={esFavorita ? `Quitar ${c.tipo.nombre} de favoritas` : `Marcar ${c.tipo.nombre} como favorita`}
                  aria-pressed={esFavorita}
                  onClick={() => marcarFavorita(c.sesion.tipoClaseId, esFavorita ? 'desmarcar' : 'marcar')}
                  style={{
                    position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: '50%',
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: esFavorita ? t.heroAccent : t.muted2,
                  }}
                >
                  <Star size={15} fill={esFavorita ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>
          );
        })}

        {/* El cierre del diseño: después de la última clase se dice que no hay
            más, en vez de dejar el scroll muriendo en blanco. Solo con lista y
            solo en la vista del día. */}
        {vista === 'todas' && lista.length > 0 && (
          <p style={{ ...display(16, true), color: t.muted2, textAlign: 'center', padding: '22px 0 0' }}>
            No hay más clases este {dias[diaActivo]?.toLocaleDateString('es-ES', { weekday: 'long' })}.
          </p>
        )}
      </div>

      </div>

      {/* Bloques del catálogo (banner/texto/cta/faq) — hermanos del
          calendario en el mismo contenedor flex, con el `order` que les
          toque para intercalarse antes o después de él. */}
      {bloquesPersonalizados.map(({ b, orden }) => (
        <div key={b.id} data-bloque-id={b.id} style={{ order: orden, padding: '0 24px' }}>
          <BloqueHomeRender bloque={b} slug={slug} />
        </div>
      ))}
      </div>

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />

      <HojaReserva
        key={reservando?.id ?? 'ninguna'}
        clase={reservando}
        onClose={() => setReservandoId(null)}
        onConfirmar={confirmar}
        quienVa={quienVa}
        // En la vista previa del editor no se ofrece: `/compras` no existe bajo
        // /portal-preview y el botón llevaría a un 404 (mismo criterio que
        // `navegar` en el resto de vistas del portal).
        onComprar={escribible ? () => router.push(`/portal/${slug}/compras`) : undefined}
      />

      <BottomSheet open={!!cancelando} onClose={() => setCancelando(null)}>
        {cancelando && (() => {
          const { tardia, ventana } = tardiaDe(cancelando);
          return (
            <>
              <h2 style={{ ...display(18), color: t.ink }}>¿Cancelar esta clase?</h2>
              <p style={{ ...texto.pie, color: t.muted }}>
                {tardia
                  ? `Quedan menos de ${ventana} h para la clase. Según la política del estudio, puede que no se te devuelva la sesión.`
                  : 'Perderás tu plaza y liberarás el hueco para otra socia.'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" onClick={() => setCancelando(null)} style={{ flex: 1 }}>Volver</Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    const mia = cancelando.mia;
                    setCancelando(null);
                    if (!mia) return;
                    if (!escribible) {
                      setAviso({ texto: 'Vista previa: esta cancelación no se guarda de verdad.', error: false });
                      return;
                    }
                    const sesionCancelada = sesiones.find(s => s.id === mia.sesionId) ?? null;
                    void cancelarReserva(mia.id).then(r => {
                      if (!r.ok) { setAviso({ texto: r.error, error: true }); return; }
                      setAviso({ texto: 'Reserva cancelada.', error: false });
                      // Y en vez de dejarla ahí, se le ofrece cómo recuperarla.
                      // Solo si hay algo REAL que ofrecer: sin alternativas no
                      // se abre nada (una hoja vacía es peor que ninguna hoja).
                      if (!socioId || !sesionCancelada) return;
                      const opciones = alternativasTras(sesionCancelada, {
                        now: new Date(), socioId,
                        // La reserva recién cancelada sigue en el estado local
                        // hasta el próximo refresco; se descarta a mano para
                        // que su sesión pueda volver a ofrecerse.
                        misReservas: reservas.filter(x => x.socioId === socioId && x.id !== mia.id),
                        reservas: reservas.filter(x => x.id !== mia.id),
                        sesiones, tiposClase, suscripciones, planesTarifa,
                      });
                      if (opciones.length > 0) setRecuperacion({ sesionId: sesionCancelada.id, opciones });
                    });
                  }}
                  style={{ flex: 1 }}
                >
                  Sí, cancelar
                </Button>
              </div>
            </>
          );
        })()}
      </BottomSheet>
      {/* Recuperar la clase que acaba de cancelar. No sustituye al toast de
          confirmación: primero se le dice que su cancelación salió bien, y
          encima aparece esto. */}
      <BottomSheet open={!!recuperacion} onClose={() => setRecuperacion(null)}>
        {recuperacion && (
          <>
            <h2 style={{ ...display(18), color: t.ink }}>¿Quieres recuperar tu clase?</h2>
            <p style={{ ...texto.pie, color: t.muted }}>
              {recuperacion.opciones.length === 1
                ? 'He encontrado una opción que te encaja.'
                : `He encontrado ${recuperacion.opciones.length} opciones que te encajan.`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {recuperacion.opciones.map(o => (
                <button
                  key={o.sesion.id}
                  type="button"
                  onClick={() => {
                    setRecuperacion(null);
                    // Por el camino normal de reserva (HojaReserva), el mismo
                    // que pulsar la clase en la lista: elegir sitio, aviso de
                    // aforo y confirmación reales. Nada de una vía paralela.
                    setReservandoId(o.sesion.id);
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '12px 14px', borderRadius: 14, textAlign: 'left', width: '100%',
                    border: `1px solid ${t.line}`, background: noche ? t.surface2 : '#FFFFFF', color: t.ink,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {o.tipo?.nombre ?? 'Clase'} · {cuandoSugerencia(o.sesion.inicio, new Date())}
                  </span>
                  {/* El porqué va SIEMPRE con la opción: sin él sería una lista
                      de clases cualquiera, no una recuperación pensada. */}
                  <span style={{ ...texto.pie, color: t.muted }}>
                    {o.motivo} · {o.plazasLibres === 1 ? 'queda 1 plaza' : `quedan ${o.plazasLibres} plazas`}
                  </span>
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setRecuperacion(null)} style={{ width: '100%', marginTop: 4 }}>
              Ahora no
            </Button>
          </>
        )}
      </BottomSheet>

      <HojaPase
        abierta={paseAbierto != null}
        onClose={() => setPaseAbierto(null)}
        slug={slug}
        nombreEstudio={studio?.nombre ?? 'tu estudio'}
        tituloClase={paseAbierto?.nombre ?? ''}
        subtitulo={paseAbierto?.sub ?? ''}
        pedirPase={escribible ? pedirPaseDeAcceso : pedirPaseDeMuestra}
      />

      <BuscarOverlay open={buscarAbierto} onClose={() => setBuscarAbierto(false)} />
    </div>
  );
}
