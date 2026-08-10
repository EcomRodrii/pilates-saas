'use client';

// Editor de Apariencia a pantalla completa (PR 4 del encargo "biblioteca de
// temas + editor único"). Monta en /configuracion/apariencia/editor, SIN el
// sidebar del dashboard (components/layout/dashboard-shell.tsx tiene el hueco
// para esta ruta concreta, mismo patrón que PantallaBienvenida).
//
// Sustituye al ThemeWorkspace de #623/#626 (pestañas Secciones/Ajustes +
// cuatro botones de guardar/publicar distintos) por un rail único con DOS
// grupos siempre visibles (Tema / Pantallas) y UN SOLO Publicar. Reutiliza
// SIN modificar los 4 hooks y sus listas/paneles ya existentes — esto es
// composición y orquestación, no una reescritura de la lógica de negocio.
//
// "Inicio del panel" y "Contenido del portal" se quedan en el árbol de
// Pantallas aunque el encargo original solo lista Inicio/Clases/Bonos/
// Reservas/Perfil: contenido-portal-editor.tsx pide explícitamente "úsalo,
// no lo reescribas", y quitar el acceso sería una regresión. El botón
// Publicar único solo actúa sobre Tema + bloques de Inicio/Clases/Bonos
// (que es lo que el encargo pide publicar junto) — Inicio del panel conserva
// su "Guardar cambios" propio (sin publicar, como siempre), y Contenido del
// portal se sigue guardando solo, campo a campo.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ChevronDown, ChevronRight, ZoomIn, ZoomOut, MousePointerClick, Hand, RotateCcw, AlertTriangle, Undo2, Redo2,
  Smartphone, Tablet, Monitor, type LucideIcon,
} from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { useStudio } from '@/lib/studio-context';
import { PANTALLA_IDS, PANTALLA_LABEL, bloqueEstaCompleto, type PantallaId, type BloqueHome } from '@/lib/portal-home-bloques';
import { guardarThemeBorrador, publicarThemeApi, guardarBloquesBorradorApi, publicarBloquesApi, fetchThemePublicado } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import { useHomeSeccionesEditor, HomeSeccionesList } from './home-editor';
import { useContenidoPortalEditor, ContenidoPortalList, ContenidoPortalPanel } from './contenido-portal-editor';
import { useBloquesEditor, CatalogoBloques, BloquesSeccionesList, BloquesConfigPanel, labelDe } from './portal-bloques-editor';
import { useThemeEditor, AjustesCategoriaPanel, AJUSTES_CATEGORIAS, type AjustesCategoriaId } from './theme-editor';

/**
 * Qué ajustes se ven en el PORTAL DE LA SOCIA y no en la página pública de
 * reservas.
 *
 * ⚠️ Toda la pestaña «Ajustes del tema» previsualizaba sobre `/reservar/{slug}`
 * — la página pública— mientras sus controles tocaban el portal: la cabecera
 * del Inicio, la tarjeta principal, los accesos rápidos, los retos, la
 * bienvenida y los tamaños de texto. Ninguna de esas piezas existe en
 * `/reservar`, así que la propietaria elegía «Accesos rápidos → Círculos» y el
 * lienzo NO se movía. Encima la barra superior decía «Inicio», que tampoco era
 * lo que se estaba viendo. Visto en el editor real, no leyendo el código.
 *
 * Es el mismo fallo que ya costó el «todos los temas parecen iguales»: un
 * preview que no enseña lo que se está tocando no es una ayuda, es una mentira
 * que hace desistir.
 *
 * `redes-sociales` se queda fuera a propósito — los enlaces solo salen en el
 * pie de la página pública, así que ahí `/reservar` SÍ es la superficie
 * correcta.
 */
const AJUSTES_EN_EL_PORTAL = new Set<AjustesCategoriaId>([
  'paleta', 'color-marca', 'tipografia', 'esquinas', 'boton', 'tarjetas',
  'forma-portal', 'navegacion-portal', 'logo-favicon',
]);
import { HomePreview, PANTALLAS_SOLO_NAVEGABLES, type VistaId } from './home-preview';
import { SelectorPagina, type OpcionPagina } from './selector-pagina';
import { DISPOSITIVOS, DISPOSITIVO_IDS, type DispositivoId } from '@/lib/theme/dispositivos';
import { useAutoguardado } from './use-autoguardado';
import { textoEstado } from '@/lib/theme/autoguardado';
import type { ModoPreview } from '@/components/portal/portal-preview-bridge';
import {
  ESTADO_INICIAL, elegirPagina, elegirBloque, elegirItemContenido, elegirCategoria,
  pantallaOperativa, type EstadoEditor,
} from '@/lib/theme/editor-navegacion';
import { ThemePreview } from './theme-preview';
import { contarCambios } from './theme-library';
import { pilaADeshacer, pilaARehacer } from '@/lib/theme/editor-historial';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ThemeConfig } from '@/lib/theme-schema';

const RUTA_BIBLIOTECA = '/configuracion/apariencia';

const ICONO_DISPOSITIVO: Record<DispositivoId, LucideIcon> = {
  movil: Smartphone, tablet: Tablet, completo: Monitor,
};

type IdPantalla = PantallaId | 'dashboard-inicio' | 'contenido-portal' | 'bienvenida' | 'reservas' | 'perfil';

type Nodo =
  | { tipo: 'tema'; categoria: AjustesCategoriaId }
  | { tipo: 'pantalla'; id: IdPantalla }
  | { tipo: 'item'; grupo: PantallaId | 'contenido-portal'; itemId: string };


/**
 * `EstadoEditor` → el `Nodo` que entiende el rail. Solo traduce vocabulario:
 * ninguna regla de navegación vive aquí (están en editor-navegacion.ts).
 */
function nodoDeEstado(e: EstadoEditor): Nodo {
  if (e.seleccion?.tipo === 'categoria') return { tipo: 'tema', categoria: e.seleccion.id as AjustesCategoriaId };
  if (e.seleccion?.tipo === 'bloque') return { tipo: 'item', grupo: e.seleccion.pantalla, itemId: e.seleccion.id };
  if (e.seleccion?.tipo === 'item') return { tipo: 'item', grupo: 'contenido-portal', itemId: e.seleccion.id };
  return { tipo: 'pantalla', id: e.pagina };
}

interface FilaRail {
  id: IdPantalla;
  label: string;
  desplegable: boolean;
  /** Se pinta a la derecha: dice qué se puede hacer aquí sin tener que probar. */
  nota?: string;
}

/**
 * El rail, agrupado por A QUÉ PERTENECE cada cosa.
 *
 * Antes era una lista plana bajo un solo rótulo, "Pantallas", donde convivían
 * tres productos distintos: el portal de la socia, el panel del equipo y el
 * contenido del estudio. Nada decía cuál era cuál, así que "Inicio" e "Inicio
 * del panel" parecían variantes de lo mismo y no lo son: uno lo ve la clienta
 * en su móvil y el otro lo ve la recepcionista en el mostrador.
 *
 * Los grupos son la respuesta a "¿esto de quién es?", que es la pregunta que
 * uno se hace al abrir el editor y no tenía dónde leerse.
 */
const GRUPOS_RAIL: { titulo: string; ayuda: string; filas: FilaRail[] }[] = [
  {
    titulo: 'Portal de la socia',
    ayuda: 'Lo que ve tu clienta en su móvil.',
    filas: [
      { id: 'home', label: PANTALLA_LABEL.home, desplegable: true },
      { id: 'clases', label: PANTALLA_LABEL.clases, desplegable: true },
      { id: 'bonos', label: PANTALLA_LABEL.bonos, desplegable: true },
      // Sin constructor de bloques: clicarlas solo mueve el preview. La nota lo
      // dice en vez de dejar a la propietaria buscando un desplegable que no
      // existe. Ver PANTALLAS_SOLO_NAVEGABLES en home-preview.tsx.
      ...PANTALLAS_SOLO_NAVEGABLES.map((p) => ({
        id: p.id as IdPantalla, label: p.etiqueta, desplegable: false, nota: 'solo ver',
      })),
    ],
  },
  {
    // ⚠️ NO se llama "Contenido del estudio": así se llama ya el BLOQUE de
    // Inicio que hace de hueco donde esto se pinta. Dos cosas distintas con la
    // misma etiqueta en la misma pantalla es exactamente la confusión que este
    // reagrupado viene a quitar. Aquí se ESCRIBEN; allí se decide dónde caen.
    titulo: 'Avisos y banners',
    ayuda: 'Lo que anuncias a tus clientas. Se ve dentro del portal, pero no es una pantalla. Cada campo se guarda solo al escribirlo.',
    filas: [{ id: 'contenido-portal', label: 'Mensaje y banners', desplegable: true }],
  },
  {
    titulo: 'Panel del equipo',
    ayuda: 'Lo que ves tú y tu equipo al entrar. No lo ve ninguna clienta. Sus secciones se reordenan y se ocultan; no tienen ajustes propios.',
    filas: [{ id: 'dashboard-inicio', label: 'Inicio del panel', desplegable: true }],
  },
];

// Lo que ofrece el selector de página de la barra superior. Solo las que el
// preview sabe enseñar: las demás llevarían a una caja gris (ver el
// comentario de SelectorPagina).
const OPCIONES_SELECTOR: OpcionPagina[] = [
  { id: 'home', etiqueta: PANTALLA_LABEL.home, conSecciones: true, grupo: 'Portal de la socia' },
  { id: 'clases', etiqueta: PANTALLA_LABEL.clases, conSecciones: true, grupo: 'Portal de la socia' },
  { id: 'bonos', etiqueta: PANTALLA_LABEL.bonos, conSecciones: true, grupo: 'Portal de la socia' },
  ...PANTALLAS_SOLO_NAVEGABLES.map((p) => ({
    id: p.id, etiqueta: p.etiqueta, conSecciones: false, grupo: 'Solo se pueden ver',
  })),
];

export function ThemeEditorFullscreen() {
  const { rol } = usePermisos();
  const { dataLoaded } = useStudio();
  // UN estado, no tres. Las reglas de qué arrastra a qué viven en
  // lib/theme/editor-navegacion.ts —funciones puras con tests— en vez de en
  // un ternario dentro de `seleccionar`, que es donde estaban y donde ya
  // había un comentario admitiendo que duplicaban ese módulo.
  //
  // ⚠️ La regla que hay que conservar: **el preview NO sigue siempre al
  // rail**. Elegir "Inicio del panel" o "Contenido del portal" cambia lo que
  // se edita y deja el iframe donde estaba, porque esas dos no son pantallas
  // del portal y no tienen vista que enseñar.
  const [estado, setEstado] = useState<EstadoEditor>(ESTADO_INICIAL);
  // `Nodo` pasa a ser una VISTA derivada, no estado: el rail y el JSX siguen
  // hablando su vocabulario (tema/pantalla/item) sin tener que reescribir sus
  // treinta y tantos usos, pero ya no hay dos fuentes de verdad que puedan
  // separarse.
  const nodo: Nodo = nodoDeEstado(estado);
  // ¿Hay algo que inspeccionar? Una categoría del tema o un bloque/banner
  // seleccionado. Una PANTALLA sin selección no tiene ajustes propios: lo
  // único que cabía escribir ahí era una frase, y una frase no vale 344 px.
  const hayInspector = nodo.tipo === 'tema' || nodo.tipo === 'item';
  const pantallaActiva = pantallaOperativa(estado);
  const pantallaMirada: VistaId = estado.vista;
  const [expandidos, setExpandidos] = useState<Set<IdPantalla>>(new Set(['home']));
  // Qué mitad del rail se ve. La fija `seleccionar()`, no un click suelto —
  // ver el comentario del rail.
  const [pestana, setPestana] = useState<'secciones' | 'ajustes'>('secciones');
  const [zoom, setZoom] = useState(1);
  const [dispositivo, setDispositivo] = useState<DispositivoId>('movil');
  // Qué hace un click DENTRO del preview. Antes esto era un ojo que solo
  // encendía/apagaba el contorno de selección; ahora que los módulos fijos
  // (`sistema`) también son seleccionables, un click se come la navegación
  // del portal — así que el control tiene que decir la verdad sobre lo que
  // hace, con dos palabras, en vez de un icono que sugiere "ver".
  const [modoPreview, setModoPreview] = useState<ModoPreview>('editar');
  // Dónde insertar la sección que se está eligiendo, cuando se llegó por el
  // "+" de la vista previa. `null` = no hay ninguna elección en curso.
  const [insercionEn, setInsercionEn] = useState<number | null>(null);
  const [comandoVista, setComandoVista] = useState<{ vista: VistaId; nonce: number } | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [confirmarDescartar, setConfirmarDescartar] = useState(false);
  // Un reloj lento solo para que "Guardado hace 20 s" envejezca a la vista.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  const [publicandoTodo, setPublicandoTodo] = useState(false);
  const [avisoPublicar, setAvisoPublicar] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  // Tema PUBLICADO (no el borrador) — solo para el badge "N sin publicar" y
  // el resumen de "Antes de publicar". Se declara aquí, junto al resto de
  // useState, y no tras el `return` de abajo por rol: las reglas de hooks
  // exigen que se llamen siempre en el mismo orden.
  const [temaPublicado, setTemaPublicado] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    let vivo = true;
    fetchThemePublicado().then((t) => { if (vivo) setTemaPublicado(t); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Los hooks se llaman siempre, sin condicionar por `nodo` (reglas de
  // hooks) — montar un hook no publica ni guarda nada por sí solo.
  //
  // UNA sola instancia de useBloquesEditor, que ya trae las tres pantallas.
  // Antes había una por pantalla porque se creía que hacía falta para tenerlas
  // las tres desplegadas a la vez en el rail; pero cada instancia cargaba las
  // tres igualmente, así que eran nueve peticiones para los datos de tres.
  const ajustesHook = useThemeEditor();
  const bloquesHook = useBloquesEditor();
  const homeHook = useHomeSeccionesEditor();
  const contenidoHook = useContenidoPortalEditor();

  // Autoguardado del borrador. Va AQUÍ, antes del `return` por rol de abajo:
  // los hooks tienen que llamarse en el mismo orden en todos los renders, y
  // ponerlo después haría que apareciera y desapareciera. Es exactamente el
  // fallo que #707 arregló en /primeros-pasos.
  //
  // El tercer argumento es la guarda que impide guardar antes de que llegue
  // el borrador del servidor — sin ella se subirían los bloques de fábrica.
  const { estado: estadoGuardado } = useAutoguardado(
    bloquesHook.bloquesPorPantalla,
    guardarBloquesBorradorApi,
    bloquesHook.estado === 'listo',
  );

  // ⚠️ Solo se niega el acceso cuando el rol se CONOCE.
  //
  // `useRol()` sale de `instructores`/`studio` del contexto, y hasta que
  // cargan devuelve 'INSTRUCTOR' por defecto. Con la comprobación a secas, la
  // propietaria leía "Solo la propietaria..." durante los primeros segundos —y
  // peor: este `return` es anterior a la vista previa, así que el iframe no se
  // montaba ni pedía su token hasta entonces. Medido en producción: el token
  // salía a los 3752 ms y el iframe a los 5108 ms; el `load` de la página es a
  // 1305 ms.
  //
  // Esto NO afloja ningún permiso: la UI nunca es el límite de seguridad en
  // este repo. Guardar y publicar los comprueba el servidor
  // (`/api/theme`, `/api/portal-bloques`), y el token de la vista previa exige
  // sesión de staff desde antes de este cambio.
  if (dataLoaded && rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
    return <p className="p-6 text-sm text-muted-foreground">Solo la propietaria o la gerencia del estudio pueden editar la apariencia.</p>;
  }

  function seleccionar(n: Nodo) {
    // La pestaña sigue a lo seleccionado, en el mismo sitio donde se decide
    // la selección. Si viviera en un `useEffect` sobre `nodo`, habría un
    // render intermedio con la pestaña equivocada.
    setPestana(n.tipo === 'tema' ? 'ajustes' : 'secciones');
    setEstado((e) => {
      if (n.tipo === 'tema') return elegirCategoria(e, n.categoria);
      if (n.tipo === 'pantalla') return elegirPagina(e, n.id);
      return n.grupo === 'contenido-portal'
        ? elegirItemContenido(e, n.itemId)
        : elegirBloque(e, n.grupo, n.itemId);
    });
  }

  function alternarExpandido(id: IdPantalla) {
    setExpandidos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function irAVista(v: VistaId) {
    if (v === 'home' || v === 'clases' || v === 'bonos') {
      seleccionar({ tipo: 'pantalla', id: v });
    } else {
      seleccionar({ tipo: 'pantalla', id: v });
      setComandoVista({ vista: v, nonce: (comandoVista?.nonce ?? 0) + 1 });
    }
  }

  async function publicarTodo() {
    setPublicandoTodo(true);
    setAvisoPublicar(null);
    try {
      await guardarThemeBorrador(ajustesHook.draft);
      await Promise.all(PANTALLA_IDS.map((p) => guardarBloquesBorradorApi(p, bloquesHook.bloquesDe(p))));
      const rTema = await publicarThemeApi();
      if (!rTema.ok) {
        setAvisoPublicar({ tipo: 'error', texto: rTema.errores.join(' ') });
        return;
      }
      await Promise.all(PANTALLA_IDS.map((p) => publicarBloquesApi(p)));
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
      setAvisoPublicar({ tipo: 'ok', texto: '¡Publicado! Ya lo ven tus clientas.' });
      setDialogoAbierto(false);
      fetchThemePublicado().then(setTemaPublicado).catch(() => {});
    } catch (e) {
      setAvisoPublicar({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setPublicandoTodo(false);
    }
  }

  // Dos hooks, dos historiales, UN par de botones. La propietaria no sabe (ni
  // tiene por qué) que los bloques y los ajustes viven en sitios distintos:
  // pulsa deshacer y espera que se deshaga lo último que hizo, sea lo que sea.
  // El desempate por instante vive en `pilaADeshacer`, con sus tests.
  const PILAS = [
    { id: 'bloques', puedeDeshacer: bloquesHook.puedeDeshacer, puedeRehacer: bloquesHook.puedeRehacer, instante: bloquesHook.instanteUltimo },
    { id: 'ajustes', puedeDeshacer: ajustesHook.puedeDeshacer, puedeRehacer: ajustesHook.puedeRehacer, instante: ajustesHook.instanteUltimo },
  ];
  const aDeshacer = pilaADeshacer(PILAS);
  const aRehacer = pilaARehacer(PILAS);
  const deshacerLoUltimo = () => (aDeshacer?.id === 'ajustes' ? ajustesHook.deshacer() : bloquesHook.deshacer());
  const rehacerLoUltimo = () => (aRehacer?.id === 'ajustes' ? ajustesHook.rehacer() : bloquesHook.rehacer());

  const cambiosTema = temaPublicado ? contarCambios(ajustesHook.draft, temaPublicado) : 0;
  const bloquesIncompletos = PANTALLA_IDS.flatMap((p) =>
    bloquesHook.bloquesDe(p)
      .filter((b): b is Exclude<BloqueHome, { kind: 'sistema' }> => b.kind !== 'sistema')
      .filter((b) => !bloqueEstaCompleto(b))
      .map((b) => ({ pantalla: p, bloque: b })),
  );
  const puedePublicar = ajustesHook.contraste.ok && bloquesIncompletos.length === 0;

  // ⚠️ Esto NO es "deshacer": relee del servidor y tira TODAS las ediciones
  // locales de esta sección. Antes se llamaba "Deshacer" y no preguntaba —
  // quien llevaba veinte minutos ajustando una pantalla lo pulsaba esperando
  // quitar lo último y lo perdía todo. Ahora se llama por su nombre y pide
  // confirmación; deshacer de verdad son las flechas de al lado.
  function descartarSeccionActiva() {
    if (nodo.tipo === 'tema') { ajustesHook.recargar(); return; }
    if (nodo.tipo === 'pantalla' && nodo.id === 'dashboard-inicio') { homeHook.recargar(); return; }
    const p = nodo.tipo === 'item' && nodo.grupo !== 'contenido-portal' ? nodo.grupo : nodo.tipo === 'pantalla' && PANTALLA_IDS.includes(nodo.id as PantallaId) ? (nodo.id as PantallaId) : null;
    if (p) bloquesHook.descartarCambios(p);
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border flex-none">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={RUTA_BIBLIOTECA} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Volver a Apariencia">
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-foreground truncate">
              {ajustesHook.draft.themeCustomized ? 'Personalizado' : 'Tu tema'}
            </p>
            {cambiosTema > 0 && (
              <p className="text-[11px] text-muted-foreground">{cambiosTema} sin publicar</p>
            )}
          </div>
        </div>

        {/* Qué página se está mirando. En el centro y no en el rail porque es
            la pregunta que se hace la propietaria más veces por sesión, y en
            el rail quedaba enterrada entre las categorías del tema. */}
        <div className="flex-1 min-w-0 flex justify-center">
          {/* `as VistaId`: el selector es genérico y habla en `string`, pero
              sus opciones salen de OPCIONES_SELECTOR, que solo lleva vistas
              que el preview sabe enseñar. */}
          <SelectorPagina opciones={OPCIONES_SELECTOR} activa={pantallaMirada} onElegir={(id) => irAVista(id as VistaId)} />
        </div>

        <div className="flex items-center gap-1.5 flex-none">
          {/* Lo único que le dice a la propietaria si su trabajo está a salvo.
              En rojo cuando falla, porque un aviso gris de "no se ha podido
              guardar" se lee como decoración. */}
          <span
            className={`text-[11.5px] mr-1 tabular-nums ${estadoGuardado.tipo === 'error' || estadoGuardado.tipo === 'sesion' ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
            role="status"
            aria-live="polite"
            data-estado-guardado
          >
            {textoEstado(estadoGuardado, ahora)}
          </span>
          {/* Con la sesión caducada, el aviso sin salida no basta: hay que
              poder volver a entrar desde aquí.
              ⚠️ SIN parámetro de destino, y no es un olvido: `/login` solo
              acepta rutas `/interno` a propósito —«aceptar cualquier destino
              convertiría el login en un redirector abierto que se puede usar
              para phishing con nuestro propio dominio»—, así que un
              `?volver=` aquí sería un enlace que promete algo que el login
              descarta. Se abre en otra pestaña para no tirar lo editado, que
              sigue en pantalla: al volver y refrescar la sesión, el
              autoguardado lo sube. */}
          {estadoGuardado.tipo === 'sesion' && (
            <a
              href="/login"
              target="_blank"
              rel="noopener"
              className="text-[11.5px] font-semibold text-destructive underline mr-1.5"
            >
              Volver a entrar
            </a>
          )}
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-1 mr-1.5" role="group" aria-label="Dispositivo">
            {DISPOSITIVO_IDS.map((id) => {
              const Icono = ICONO_DISPOSITIVO[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDispositivo(id)}
                  aria-pressed={dispositivo === id}
                  title={DISPOSITIVOS[id].etiqueta}
                  aria-label={DISPOSITIVOS[id].etiqueta}
                  className={`p-1.5 rounded-md ${dispositivo === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Icono size={15} />
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-1 mr-1.5">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.75, z - 0.1))} aria-label="Alejar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40" disabled={zoom <= 0.75}>
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-semibold text-muted-foreground w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(1.25, z + 0.1))} aria-label="Acercar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40" disabled={zoom >= 1.25}>
              <ZoomIn size={14} />
            </button>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-1 mr-1.5" role="group" aria-label="Qué hace un clic en la vista previa">
            {([
              { id: 'editar', etiqueta: 'Editar', Icono: MousePointerClick, ayuda: 'Clicar una sección la selecciona para editarla' },
              { id: 'navegar', etiqueta: 'Navegar', Icono: Hand, ayuda: 'Clicar funciona como en el portal de la socia' },
            ] as const).map(({ id, etiqueta, Icono, ayuda }) => (
              <button
                key={id}
                type="button"
                onClick={() => setModoPreview(id)}
                aria-pressed={modoPreview === id}
                title={ayuda}
                className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[11.5px] font-medium ${modoPreview === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icono size={13} />
                {etiqueta}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button" onClick={deshacerLoUltimo} disabled={!aDeshacer}
              title="Deshacer"
              aria-label="Deshacer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button" onClick={rehacerLoUltimo} disabled={!aRehacer}
              title="Rehacer" aria-label="Rehacer"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Redo2 size={16} />
            </button>
          </div>
          <button
            type="button" onClick={() => setConfirmarDescartar(true)}
            className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <RotateCcw size={14} /> Descartar cambios
          </button>
          {nodo.tipo === 'pantalla' && nodo.id === 'dashboard-inicio' && (
            <button onClick={homeHook.guardar} disabled={homeHook.guardando} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-border disabled:opacity-50">
              {homeHook.guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
          <button
            type="button" onClick={() => setDialogoAbierto(true)}
            className="text-[13px] font-bold px-4 py-1.5 rounded-lg bg-brand text-brand-foreground"
          >
            Publicar
          </button>
        </div>
      </div>

      {/* El inspector NO reserva sitio cuando no hay nada que inspeccionar.
          ─────────────────────────────────────────────────────────────────
          Antes eran tres columnas fijas y la tercera se pasaba la mayor
          parte del tiempo enseñando «Selecciona un bloque de la izquierda»:
          344 px permanentes —el 18 % de una pantalla de 1920— para una
          frase. Y el hueco que se le quitaba era justo el de la vista
          previa, que es a lo que se viene.

          Comprobado en el editor de Shopify (2026-08-09, tema Horizon): son
          DOS columnas, rail y lienzo, y el inspector aparece al seleccionar.
          No reserva ancho en reposo. */}
      <div className={`flex-1 min-h-0 grid ${hayInspector ? 'grid-cols-[272px_minmax(0,1fr)_344px]' : 'grid-cols-[272px_minmax(0,1fr)]'}`}>
        {/* Rail izquierdo */}
        <div className="border-r border-border flex flex-col min-h-0">
          {/* Dos pestañas, no dos bloques apilados en el mismo scroll.
              ────────────────────────────────────────────────────────────
              Antes convivían en una sola columna las diez categorías del
              tema y el árbol de pantallas: para llegar a un bloque de Inicio
              había que pasar por delante de "Tipografía" y "Redes sociales",
              que no se tocan casi nunca. Son dos trabajos distintos —cómo se
              ve TODO el portal, y qué hay en ESTA pantalla— y ahora cada uno
              tiene su sitio.

              La pestaña no es un estado suelto: la fija `seleccionar()` según
              lo elegido, así que llegar a una categoría del tema desde
              cualquier otro sitio (el preview, un atajo) trae su pestaña
              delante en vez de dejar la selección escondida detrás. */}
          <div className="flex-none flex border-b border-border" role="tablist" aria-label="Qué editar">
            {([
              { id: 'secciones', label: 'Secciones' },
              { id: 'ajustes', label: 'Ajustes del tema' },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={pestana === t.id}
                onClick={() => setPestana(t.id)}
                className={`flex-1 px-3 py-2.5 text-[13px] font-semibold border-b-2 -mb-px ${
                  pestana === t.id
                    ? 'border-brand text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          {pestana === 'ajustes' && (
            <div className="space-y-0.5">
              {AJUSTES_CATEGORIAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => seleccionar({ tipo: 'tema', categoria: c.id })}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-[13px] font-medium ${nodo.tipo === 'tema' && nodo.categoria === c.id ? 'bg-brand/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {pestana === 'secciones' && GRUPOS_RAIL.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="px-2 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{grupo.titulo}</p>
            <p className="px-2 pb-1.5 pt-0.5 text-[11px] text-muted-foreground/80 leading-snug">{grupo.ayuda}</p>
            <div className="space-y-0.5">
              {grupo.filas.map((p) => {
                const activa = (nodo.tipo === 'pantalla' && nodo.id === p.id) || (nodo.tipo === 'item' && ((p.id === nodo.grupo) || (p.id === 'contenido-portal' && nodo.grupo === 'contenido-portal')));
                const expandido = expandidos.has(p.id);
                return (
                  <div key={p.id}>
                    <div className={`flex items-center rounded-lg ${activa ? 'bg-brand/10' : ''}`}>
                      {p.desplegable ? (
                        <button type="button" onClick={() => alternarExpandido(p.id)} aria-label={expandido ? `Contraer ${p.label}` : `Desplegar ${p.label}`} className="p-2 text-muted-foreground hover:text-foreground">
                          {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ) : <span className="w-[30px]" />}
                      <button
                        type="button"
                        onClick={() => (p.id === 'reservas' || p.id === 'perfil' ? irAVista(p.id) : seleccionar({ tipo: 'pantalla', id: p.id }))}
                        className={`flex-1 text-left py-2 pr-2.5 text-[13px] font-medium ${activa ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {p.label}
                        {p.nota && (
                          <span className="ml-1.5 text-[10.5px] font-normal text-muted-foreground/70">{p.nota}</span>
                        )}
                      </button>
                    </div>
                    {p.desplegable && expandido && (
                      <div className="pl-[30px] pr-1 pt-1 pb-2">
                        {p.id === 'home' || p.id === 'clases' || p.id === 'bonos' ? (
                          // La estrechez de `p.id` a PantallaId (verificada arriba) no
                          // sobrevive dentro del closure de `onSeleccionar` — TS no
                          // puede probar que `p` no cambia antes de que se dispare el
                          // callback. `pantallaFila` es un binding nuevo, sí la conserva.
                          (() => { const pantallaFila = p.id; return (
                            <BloquesSeccionesList
                              hook={bloquesHook} pantalla={pantallaFila}
                              seleccionId={nodo.tipo === 'item' && nodo.grupo === pantallaFila ? nodo.itemId : null}
                              onSeleccionar={(id) => seleccionar({ tipo: 'item', grupo: pantallaFila, itemId: id })}
                            />
                          ); })()
                        ) : p.id === 'dashboard-inicio' ? (
                          <HomeSeccionesList hook={homeHook} />
                        ) : (
                          <ContenidoPortalList
                            hook={contenidoHook}
                            seleccionId={nodo.tipo === 'item' && nodo.grupo === 'contenido-portal' ? nodo.itemId : null}
                            onSeleccionar={(id) => seleccionar({ tipo: 'item', grupo: 'contenido-portal', itemId: id })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          ))}
          </div>
        </div>

        {/* Preview central.
            `data-preview-hueco`: esta columna es la que decide cuánto sitio
            hay. MarcoDispositivo la busca con `closest` para encogerse
            también a lo alto — ver el comentario de ese fichero. */}
        <div data-preview-hueco className="overflow-auto p-6 flex items-center justify-center bg-muted/30">
          {/* Ya NO se escala aquí: el zoom viaja al marco, que lo combina con
              el encogido automático del dispositivo. Escalar dos veces (aquí y
              dentro) multiplicaba los factores sin que nadie lo dijera. */}
          <div className="w-full">
            {nodo.tipo === 'tema' && !AJUSTES_EN_EL_PORTAL.has(nodo.categoria) ? (
              <ThemePreview config={ajustesHook.draft} slug={ajustesHook.studio?.slug} dispositivo={dispositivo} zoom={zoom} />
            ) : nodo.tipo === 'pantalla' && nodo.id === 'dashboard-inicio' ? (
              <div className="w-[320px] aspect-[9/16] rounded-2xl border border-dashed border-border bg-background flex items-center justify-center text-center px-6">
                <p className="text-[12px] text-muted-foreground">Este panel es interno, no tiene vista previa.</p>
              </div>
            ) : (nodo.tipo === 'pantalla' && nodo.id === 'contenido-portal') || (nodo.tipo === 'item' && nodo.grupo === 'contenido-portal') ? (
              <div className="w-[320px] aspect-[9/16] rounded-2xl border border-dashed border-border bg-background flex items-center justify-center text-center px-6">
                <p className="text-[12px] text-muted-foreground">Los banners se ven en Inicio del portal — sin vista previa en directo todavía.</p>
              </div>
            ) : (
              <HomePreview
                bloquesPorPantalla={bloquesHook.bloquesPorPantalla}
                pantalla={pantallaActiva}
                onPantallaChange={(p) => seleccionar({ tipo: 'pantalla', id: p })}
                slug={ajustesHook.studio?.slug}
                seleccionId={modoPreview === 'editar' && nodo.tipo === 'item' ? nodo.itemId : null}
                modo={modoPreview}
                onInsertar={modoPreview === 'editar' ? setInsercionEn : undefined}
                onBloqueSeleccionado={(id) => seleccionar({ tipo: 'item', grupo: pantallaActiva, itemId: id })}
                temaBorrador={ajustesHook.draft}
                irA={comandoVista}
                dispositivo={dispositivo}
                zoom={zoom}
              />
            )}
          </div>
        </div>

        {/* Panel derecho: inspector de lo seleccionado. Solo cuando hay algo
            que inspeccionar — ver el comentario del grid. */}
        {hayInspector && (
          <div className="border-l border-border overflow-y-auto p-4">
            {nodo.tipo === 'tema' ? (
              <AjustesCategoriaPanel hook={ajustesHook} categoriaId={nodo.categoria} />
            ) : nodo.grupo === 'contenido-portal' ? (
              <ContenidoPortalPanel hook={contenidoHook} seleccionId={nodo.itemId} />
            ) : (
              <BloquesConfigPanel
                hook={bloquesHook}
                pantalla={nodo.grupo as PantallaId}
                seleccionId={nodo.itemId}
              />
            )}
          </div>
        )}
      </div>

      {/* Antes de publicar */}
      <Dialog open={confirmarDescartar} onOpenChange={setConfirmarDescartar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Descartar los cambios de esta sección?</DialogTitle>
            <DialogDescription>
              Se pierde todo lo que has editado aquí desde la última vez que guardaste, no solo lo último.
              Para deshacer un paso, usa la flecha de la barra.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmarDescartar(false)}>Seguir editando</Button>
            <Button
              onClick={() => { descartarSeccionActiva(); setConfirmarDescartar(false); }}
              className="bg-destructive text-destructive-foreground hover:brightness-95"
            >
              Descartar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* El catálogo, abierto desde el "+" de la vista previa. Es el MISMO
          componente que usa el botón del rail: dos copias se separarían en
          cuanto se añadiera un bloque nuevo. */}
      {insercionEn !== null && (
        <CatalogoBloques
          onCerrar={() => setInsercionEn(null)}
          ancla={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
          onElegir={(kind, config) => {
            const id = bloquesHook.anadir(pantallaActiva, kind, insercionEn, config);
            setInsercionEn(null);
            if (id) seleccionar({ tipo: 'item', grupo: pantallaActiva, itemId: id });
          }}
        />
      )}

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Antes de publicar</DialogTitle>
            <DialogDescription>Esto es lo que van a ver tus clientas al publicar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-[13px] text-foreground">
            <p>{cambiosTema > 0 ? `Tema: ${cambiosTema} cambio${cambiosTema === 1 ? '' : 's'} sin publicar.` : 'Tema: sin cambios.'}</p>
            {PANTALLA_IDS.map((p) => {
              const n = bloquesHook.bloquesDe(p).filter((b) => b.kind !== 'sistema').length;
              return <p key={p}>{PANTALLA_LABEL[p]}: {n} bloque{n === 1 ? '' : 's'} del catálogo.</p>;
            })}
            <p className="text-muted-foreground">El contenido del portal (mensaje destacado y banners) se guarda solo — no forma parte de esta publicación.</p>
          </div>
          {!puedePublicar && (
            <div className="rounded-lg bg-destructive/10 p-3 space-y-1">
              {!ajustesHook.contraste.ok && ajustesHook.contraste.errores.map((e) => (
                <p key={e} className="flex items-start gap-1.5 text-[12.5px] text-destructive"><AlertTriangle size={14} className="flex-none mt-0.5" />{e}</p>
              ))}
              {bloquesIncompletos.map(({ pantalla, bloque }) => (
                <p key={bloque.id} className="flex items-start gap-1.5 text-[12.5px] text-destructive">
                  <AlertTriangle size={14} className="flex-none mt-0.5" />
                  El bloque «{labelDe(bloque)}» en {PANTALLA_LABEL[pantalla]} está incompleto.
                </p>
              ))}
            </div>
          )}
          {avisoPublicar && (
            <p className={`text-[12.5px] font-medium ${avisoPublicar.tipo === 'ok' ? 'text-success' : 'text-destructive'}`}>{avisoPublicar.texto}</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={publicarTodo} disabled={!puedePublicar || publicandoTodo}>
              {publicandoTodo ? 'Publicando…' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
