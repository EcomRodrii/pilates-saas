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
import { HojaReserva, type ClaseParaReservar, type ResultadoConfirmar } from '@/components/portal/hoja-reserva';
import { HojaPase } from '@/components/portal/hoja-pase';
import { BottomSheet, Button, Toast, type AvisoToast } from '@/components/portal/ui';
import { pedirPaseDeAcceso, portalAuthHeader } from '@/lib/api-client';
import { fetchQuienVaAEstaClase, type QuienVaAEstaClase } from '@/lib/social-companeras-portal.ts';
import { EASE, dur, transicion, display, texto } from '@/lib/portal-design';
import { nombreCortoInstructora } from '@/lib/utils';
import { bloquesVisibles, type BloqueHome } from '@/lib/portal-home-bloques';
import { BloqueHomeRender } from '@/components/portal/bloque-home-render';
import type { PortalSession } from '@/lib/portal-auth';
import type { DatosPase } from '@/components/portal/hoja-pase';
import type { Reserva, Spot } from '@/lib/types';
import { mensajeConfirmarReserva } from '@/lib/reserva-confirmacion-mensaje';
import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';

type Vista = 'todas' | 'mias';

const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];
const RESERVA_ACTIVA: Reserva['estado'][] = ['CONFIRMADA', 'LISTA_ESPERA'];

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
  // Filtro "Con hueco" (Tentare Studio App.dc.html): independiente del tipo
  // de clase, así que es un booleano propio y no un valor especial de
  // `tipoElegido` (a diferencia de FAVORITAS, que sí es excluyente con el
  // tipo — aquí ambos pueden estar activos a la vez).
  const [soloConHueco, setSoloConHueco] = useState(false);
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
  // Para el precio informativo de cada tarjeta (verificado en vivo contra el
  // diseño real: "18 € · bono" en TODAS las tarjetas, reservada o llena
  // incluida) — no es el precio que le toca pagar a ESTA socia (eso ya lo
  // decide `cubierta` más abajo, dentro de la hoja de reserva), es el precio
  // de tarifa del estudio, con el aviso de que un bono también sirve.
  const hayBonoActivo = planesTarifa.some(p => p.tipo === 'BONO' && p.activo);

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
      .map(decorar)
      // "Con hueco": solo clases con plaza libre AHORA MISMO, mismo aforo en
      // tiempo real que ya calcula `decorar` (REFRESCO_ACTIVO_MS) y que pinta
      // `AforoIndicator` en cada tarjeta. Va DESPUÉS de `.map(decorar)`
      // porque `libres` no existe hasta ese paso.
      .filter(c => !soloConHueco || c.libres > 0);
  }, [dias, diaActivo, sesiones, tipoEfectivo, idsFavoritos, decorar, soloConHueco]);

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
    // F-16 (auditoría 20ª pasada): mensaje canónico compartido con las otras
    // dos pantallas que llaman a addReserva con un sitio elegido — antes cada
    // una lo decidía por su cuenta y solo esta distinguía "reservada, pero el
    // sitio elegido lo cogieron antes" de una confirmación normal.
    setAviso({ texto: mensajeConfirmarReserva(r, spotId), error: false });
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

  // Cristal translúcido sobre la foto de cabecera, mismo tratamiento que la
  // campana del hero del Inicio (CHEATSHEET-CSS.md): borde 1px blanco tenue +
  // fondo blanco translúcido con blur, en vez del círculo sólido de antes.
  const circulo: React.CSSProperties = {
    width: 32, height: 32, borderRadius: '50%',
    border: '1px solid rgba(255,255,255,.45)',
    background: 'rgba(250,249,245,.22)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: '#FAF9F5', cursor: 'pointer',
    transition: transicion(['transform']),
  };

  const rangoSemana = `${dias[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — ${dias[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
    .replace(/\./g, '').toUpperCase();

  return (
    <div style={{ minHeight: '100%', background: 'var(--ap-fondo, #FAF9F5)', color: 'var(--ap-tinta, #1A1A1A)', paddingTop: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div {...wrap('listadoClases')}>
      {/* Buscador (CHEATSHEET-CSS.md, hero): mismo pill que la cabecera del
          Inicio, aquí sobre fondo plano y sin blur (no hay foto detrás que
          justifique el cristal). Único punto de entrada al overlay BUSCAR. */}
      <div style={{ padding: '0 20px 14px' }}>
        <button
          type="button" onClick={() => setBuscarAbierto(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '13px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: '#FFFFFF', boxShadow: '0 10px 26px -14px rgba(8,8,8,.22)',
            fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <Search size={15} strokeWidth={2} color="#98A093" />
          <span style={{ fontSize: 13.5, color: '#98A093' }}>Buscar clases, instructoras…</span>
        </button>
      </div>
      {/* Banner de cabecera (CHEATSHEET-CSS.md / Horario): la foto de ESTA
          pantalla (hueco `banda`, 1600×592) con degradado inferior y el
          título superpuesto — mismo hueco que antes, tratamiento más bajo
          (130px, no 160) y con los valores LITERALES del diseño en vez de
          los tokens de tema. */}
      <div style={{ position: 'relative', height: 130, margin: '0 20px 18px', borderRadius: 20, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenDeEstudio('banda', txt('listadoClases', 'fotoUrl', ''))}
          alt=""
          onError={alFallarImagen(IMAGENES_POR_DEFECTO.banda[0])}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: 'var(--portal-foto-pos, center center)', display: 'block',
          }}
        />
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(0deg, rgba(8,8,8,.72) 0%, rgba(8,8,8,.3) 55%, rgba(8,8,8,.04) 100%)',
        }} />
        <div style={{ position: 'absolute', inset: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" aria-label="Semana anterior" onClick={() => { setSemana(s => s - 1); setDiaElegido(0); }} style={circulo}>←</button>
            <button type="button" aria-label="Semana siguiente" onClick={() => { setSemana(s => s + 1); setDiaElegido(0); }} style={circulo}>→</button>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9.5, letterSpacing: '.2em', textTransform: 'uppercase', color: '#A8D0A9', whiteSpace: 'nowrap' } as React.CSSProperties}>{rangoSemana}</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: '#FAF9F5', marginTop: 6 }}>{txt('listadoClases', 'titulo', 'Clases')}</h1>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 20px' }}>
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center', height: 42, marginTop: 4,
          padding: 4, borderRadius: 21, background: '#FFFFFF', border: '1px solid #E5E3DA',
        }}>
          <span
            aria-hidden
            style={{
              position: 'absolute', left: 4, top: 4, bottom: 4, width: 'calc((100% - 8px) / 2)',
              borderRadius: 17, background: '#F1ECE1',
              transform: `translateX(${vista === 'todas' ? 0 : 100}%)`,
              transition: `transform ${dur.tab}ms ${EASE}`, pointerEvents: 'none',
            }}
          />
          {([['todas', 'Todas las clases'], ['mias', `Mis reservas · ${confirmadas}`]] as const).map(([id, etiqueta]) => (
            <button
              key={id} type="button" onClick={() => setVista(id)} aria-pressed={vista === id}
              style={{
                position: 'relative', flex: 1, textAlign: 'center', background: 'none', border: 'none',
                fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                color: vista === id ? '#1A1A1A' : '#98A093', transition: 'color 350ms ease',
              }}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {vista === 'todas' && (
        <>
          {/* Tabs de día (CHEATSHEET-CSS.md, "Tabs día / filtros"): fila
              horizontal de píldoras, no la cuadrícula de 7 con indicador
              deslizante de antes. El paginado de semana sigue siendo el de
              siempre (flechas en el banner) — solo cambia cómo se pinta cada
              día. "Hoy"/"Mañana" arriba en negrita cuando aplica; el resto,
              la fecha en negrita arriba y el día abreviado + fecha debajo. */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 4px', margin: '0 20px', scrollbarWidth: 'none' } as React.CSSProperties}>
            {dias.map((d, i) => {
              const activo = i === diaActivo;
              const abrevMes = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace(/\.$/, '');
              const fechaCorta = `${abrevMes} ${d.getDate()}`;
              const etiquetaArriba = i === indiceHoy ? 'Hoy' : i === indiceHoy + 1 ? 'Mañana' : fechaCorta;
              return (
                <button
                  key={d.toISOString()} type="button" onClick={() => setDiaElegido(i)} aria-pressed={activo}
                  aria-label={d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  style={{
                    flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '6px 14px', borderRadius: 13, fontFamily: 'inherit', cursor: 'pointer',
                    background: activo ? '#1A1A1A' : '#FFFFFF',
                    border: `1.5px solid ${activo ? '#1A1A1A' : '#E5E3DA'}`,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: activo ? '#F1ECE1' : '#1A1A1A', whiteSpace: 'nowrap' }}>
                    {etiquetaArriba}
                  </span>
                  <span style={{ fontSize: 10, color: activo ? 'rgba(241,236,225,.7)' : '#98A093', whiteSpace: 'nowrap' }}>
                    {fechaCorta}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filtros (CHEATSHEET-CSS.md, "Tabs día / filtros"): pill borde
              1px #D9D6C9, activo borde/fondo verde. Mismo grupo excluyente
              de tipo de clase + "Con hueco" independiente que ya había. */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 0 4px', margin: '0 20px 4px', scrollbarWidth: 'none' } as React.CSSProperties}>
            {(tiposClase.length > 1 || idsFavoritos.size > 0) &&
              [{ id: null as string | null, nombre: 'Todo', color: null as string | null },
                ...(idsFavoritos.size > 0 ? [{ id: FAVORITAS, nombre: 'Favoritas', color: null as string | null }] : []),
                ...tiposClase.map(tc => ({ id: tc.id, nombre: tc.nombre, color: tc.color }))].map(chip => {
                const activo = tipoEfectivo === chip.id;
                return (
                  <button
                    key={chip.id ?? 'todas'} type="button" onClick={() => setTipoElegido(chip.id)} aria-pressed={activo}
                    style={{
                      flex: '0 0 auto', padding: '7px 14px', borderRadius: 999,
                      background: activo ? '#EAF0E7' : '#FFFFFF',
                      color: activo ? '#2E5A3A' : '#5A5A52',
                      border: `1px solid ${activo ? '#4F8A5B' : '#D9D6C9'}`,
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer',
                      transition: transicion(['background', 'color', 'border-color'], 300),
                    }}
                  >
                    {chip.id === FAVORITAS && <Star size={12} fill={activo ? 'currentColor' : 'none'} />}
                    {chip.color && !activo && <span style={{ width: 6, height: 6, borderRadius: '50%', background: chip.color }} />}
                    {chip.nombre}
                  </button>
                );
              })}
            {/* "Con hueco" (Tentare Studio App.dc.html): independiente del
                tipo de clase de arriba — no forma parte del grupo excluyente,
                así que puede ir activo a la vez que un tipo o "Favoritas". */}
            <button
              type="button" onClick={() => setSoloConHueco(v => !v)} aria-pressed={soloConHueco}
              style={{
                flex: '0 0 auto', padding: '7px 14px', borderRadius: 999,
                background: soloConHueco ? '#EAF0E7' : '#FFFFFF',
                color: soloConHueco ? '#2E5A3A' : '#5A5A52',
                border: `1px solid ${soloConHueco ? '#4F8A5B' : '#D9D6C9'}`,
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer',
                transition: transicion(['background', 'color', 'border-color'], 300),
              }}
            >
              Con hueco
            </button>
          </div>
        </>
      )}

      <div style={{ padding: '10px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* "N CLASES · HOY" (CHEATSHEET-CSS.md, mono uppercase) — solo en la
            vista de un día concreto (en "Mis reservas" no hay un solo día del
            que contar). */}
        {vista === 'todas' && lista.length > 0 && (
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '.16em', fontWeight: 600, color: '#98A093', textTransform: 'uppercase' } as React.CSSProperties}>
            {lista.length} {lista.length === 1 ? 'clase' : 'clases'} · {diaActivo === indiceHoy ? 'hoy' : diaActivo === indiceHoy + 1 ? 'mañana' : dias[diaActivo]?.toLocaleDateString('es-ES', { weekday: 'long' })}
          </span>
        )}
        {lista.length === 0 ? (
          <p style={{ fontSize: 14, color: '#98A093', textAlign: 'center', padding: '22px 0' }}>
            {vista === 'mias'
              ? txt('listadoClases', 'vacioMias', 'Todavía no tienes ninguna clase reservada.')
              : txt('listadoClases', 'vacioDia', 'No hay clases este día.')}
          </p>
        ) : lista.map((c, i) => {
          const reservada = !!c.mia;
          const completa = c.libres <= 0 && !reservada;
          const esFavorita = idsFavoritos.has(c.sesion.tipoClaseId);
          // Badge de plazas (CHEATSHEET-CSS.md, "Fila de clase"): 3 estados
          // literales, ap-badge--ok/pocas/llena. "Reservada" no está en el
          // diseño de referencia (ninguna de sus filas de ejemplo lo está) —
          // usa el 4º estado ya definido en portal-app.css (`--res`, sólido)
          // en vez de inventar un color nuevo.
          const badge = reservada
            ? { clase: 'ap-badge--res', texto: c.mia!.estado === 'LISTA_ESPERA' ? 'En lista de espera' : 'Reservada' }
            : completa
              ? { clase: 'ap-badge--llena', texto: 'Llena · lista' }
              : c.libres === 1
                ? { clase: 'ap-badge--pocas', texto: '1 plaza' }
                : { clase: 'ap-badge--ok', texto: `${c.libres} plazas` };

          return (
            <div
              key={c.sesion.id}
              className="ap-card ap-anim-up"
              style={{
                position: 'relative', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                opacity: c.pasada ? 0.55 : 1,
                animationDelay: `${i * 55}ms`,
              }}
            >
              <div style={{ flex: '0 0 46px' }}>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{hora(c.sesion.inicio)}</div>
                <div style={{ fontSize: 9.5, color: '#98A093', marginTop: 3 }}>{minutos(c.sesion.inicio, c.sesion.fin)} min</div>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: '#EFEDE4' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.tipo?.nombre ?? 'Clase'}
                </div>
                {c.instr && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    {c.instr.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.instr.fotoUrl} alt="" style={{ width: 20, height: 20, borderRadius: '50%', flex: '0 0 20px', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ width: 20, height: 20, borderRadius: '50%', flex: '0 0 20px', background: c.instr.color ?? '#EFEDE4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#FFFFFF' }}>
                        {c.instr.nombre.trim()[0]?.toUpperCase()}
                      </span>
                    )}
                    {/* Apellido abreviado, como el kit ("Marta G.",
                        CHEATSHEET-CSS.md, "Fila de clase"). Con el nombre
                        completo esta línea NO cabía a 390 px: se recortaba a
                        mitad de palabra en 3 de las 4 filas.
                        ⚠️ Y SIN el nombre del estudio, que el kit sí pone
                        ("Marta G. · Studio Alma"). Allí distingue, porque el
                        prototipo enseña clases de VARIOS estudios en una lista;
                        aquí `useStudio()` está acotado a uno solo, así que era
                        la misma cadena repetida en todas las filas —
                        información cero— comiéndose el sitio del único dato
                        que cambia, el nombre de la instructora. */}
                    <span style={{ fontSize: 11, color: '#5A5A52', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nombreCortoInstructora(c.instr.nombre)}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: '0 0 auto' }}>
                {/* Favorito EN LÍNEA con el badge, no flotando sobre la
                    tarjeta. Estaba en `position:absolute; top:8; right:8` y se
                    montaba encima del badge —medido: la estrella ocupaba
                    x 339-361 y el badge llegaba hasta 355—, así que "10 plazas"
                    salía con una estrella pegada a la última letra. De paso
                    gana área táctil: 22 px de botón se quedaban muy por debajo
                    de los 44 que pide el handoff. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {socioId && c.tipo && (
                    <button
                      type="button"
                      aria-label={esFavorita ? `Quitar ${c.tipo.nombre} de favoritas` : `Marcar ${c.tipo.nombre} como favorita`}
                      aria-pressed={esFavorita}
                      onClick={() => marcarFavorita(c.sesion.tipoClaseId, esFavorita ? 'desmarcar' : 'marcar')}
                      style={{
                        // 44×44 de zona sensible con margen negativo: el dedo
                        // tiene su objetivo entero sin que la fila crezca.
                        width: 44, height: 44, margin: '-11px -11px -11px -6px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: esFavorita ? '#C99A3C' : '#98A093',
                      }}
                    >
                      <Star size={13} fill={esFavorita ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  <span className={`ap-badge ${badge.clase}`}>{badge.texto}</span>
                </div>
                {/* Precio de tarifa, verificado en vivo contra el diseño real
                    (en TODAS las tarjetas, llena incluida) — es informativo,
                    no lo que le toca pagar a ESTA socia si su plan ya lo
                    cubre (eso lo decide la hoja de reserva). */}
                {!reservada && precioClaseSuelta != null && (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#5A5A52', whiteSpace: 'nowrap' }}>
                    {precioClaseSuelta} € {hayBonoActivo ? '· bono' : ''}
                  </span>
                )}
                {reservada ? (
                  // Apiladas, no en línea. Con las dos en horizontal esta
                  // columna medía 112 px y dejaba 125 para el centro, donde la
                  // línea de la instructora pide 132: la fila reservada era la
                  // ÚNICA que seguía recortando ese texto después de abreviar
                  // el apellido. Apiladas la columna baja a lo que mida el
                  // botón más ancho y el centro recupera el sitio.
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {(studio?.requiereCheckinQr ?? true) && (
                      <button
                        type="button"
                        onClick={() => setPaseAbierto({ nombre: c.tipo?.nombre ?? 'Clase', sub: `${hora(c.sesion.inicio)} · ${c.sala?.nombre ?? ''}` })}
                        style={{ fontSize: 10.5, fontWeight: 700, color: '#1A1A1A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Ver mi pase
                      </button>
                    )}
                    <button
                      type="button" onClick={() => cancelar(c)}
                      style={{ fontSize: 10.5, fontWeight: 700, color: '#C2503A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : c.pasada ? null : completa ? (
                  <button
                    type="button" onClick={() => abrirReserva(c)}
                    style={{
                      height: 28, padding: '0 12px', borderRadius: 999, border: '1px solid #D9D6C9',
                      background: 'none', fontSize: 10.5, fontWeight: 700, color: '#5A5A52',
                      whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Unirme
                  </button>
                ) : (
                  <button
                    type="button" onClick={() => abrirReserva(c)}
                    aria-label={`Reservar ${c.tipo?.nombre ?? 'clase'} a las ${hora(c.sesion.inicio)}`}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', background: '#1A1A1A',
                      color: '#F1ECE1', fontSize: 13, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: transicion(['transform']),
                    }}
                  >
                    →
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* El cierre del diseño: después de la última clase se dice que no hay
            más, en vez de dejar el scroll muriendo en blanco. Solo con lista y
            solo en la vista del día. */}
        {vista === 'todas' && lista.length > 0 && (
          <p style={{ fontSize: 14, color: '#98A093', textAlign: 'center', padding: '22px 0 0' }}>
            No hay más clases este {dias[diaActivo]?.toLocaleDateString('es-ES', { weekday: 'long' })}.
          </p>
        )}
      </div>

      </div>

      {/* Bloques del catálogo (banner/texto/cta/faq) — hermanos del
          calendario en el mismo contenedor flex, con el `order` que les
          toque para intercalarse antes o después de él. */}
      {bloquesPersonalizados.map(({ b, orden }) => (
        <div key={b.id} data-bloque-id={b.id} style={{ order: orden, padding: '0 20px' }}>
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
              <h2 style={{ ...display(18), color: '#1A1A1A' }}>¿Cancelar esta clase?</h2>
              <p style={{ ...texto.pie, color: '#5A5A52' }}>
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
            <h2 style={{ ...display(18), color: '#1A1A1A' }}>¿Quieres recuperar tu clase?</h2>
            <p style={{ ...texto.pie, color: '#5A5A52' }}>
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
                    border: '1px solid #E5E3DA', background: '#FFFFFF', color: '#1A1A1A',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {o.tipo?.nombre ?? 'Clase'} · {cuandoSugerencia(o.sesion.inicio, new Date())}
                  </span>
                  {/* El porqué va SIEMPRE con la opción: sin él sería una lista
                      de clases cualquiera, no una recuperación pensada. */}
                  <span style={{ ...texto.pie, color: '#5A5A52' }}>
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
