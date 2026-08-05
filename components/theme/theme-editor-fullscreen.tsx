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
  ArrowLeft, ChevronDown, ChevronRight, ZoomIn, ZoomOut, Eye, EyeOff, RotateCcw, AlertTriangle,
} from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { PANTALLA_IDS, PANTALLA_LABEL, bloqueEstaCompleto, type PantallaId, type BloqueHome } from '@/lib/portal-home-bloques';
import { guardarThemeBorrador, publicarThemeApi, guardarBloquesBorradorApi, publicarBloquesApi, fetchThemePublicado } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import { useHomeSeccionesEditor, HomeSeccionesList } from './home-editor';
import { useContenidoPortalEditor, ContenidoPortalList, ContenidoPortalPanel } from './contenido-portal-editor';
import { useBloquesEditor, BloquesSeccionesList, BloquesConfigPanel, labelDe } from './portal-bloques-editor';
import { useThemeEditor, AjustesCategoriaPanel, AJUSTES_CATEGORIAS, type AjustesCategoriaId } from './theme-editor';
import { HomePreview, PANTALLAS_SOLO_NAVEGABLES, type VistaId } from './home-preview';
import { ThemePreview } from './theme-preview';
import { contarCambios } from './theme-library';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ThemeConfig } from '@/lib/theme-schema';

const RUTA_BIBLIOTECA = '/configuracion/apariencia';

type IdPantalla = PantallaId | 'dashboard-inicio' | 'contenido-portal' | 'reservas' | 'perfil';

type Nodo =
  | { tipo: 'tema'; categoria: AjustesCategoriaId }
  | { tipo: 'pantalla'; id: IdPantalla }
  | { tipo: 'item'; grupo: PantallaId | 'contenido-portal'; itemId: string };

const PANTALLAS_RAIL: { id: IdPantalla; label: string; desplegable: boolean }[] = [
  { id: 'home', label: PANTALLA_LABEL.home, desplegable: true },
  { id: 'clases', label: PANTALLA_LABEL.clases, desplegable: true },
  { id: 'bonos', label: PANTALLA_LABEL.bonos, desplegable: true },
  { id: 'dashboard-inicio', label: 'Inicio del panel', desplegable: true },
  { id: 'contenido-portal', label: 'Contenido del portal', desplegable: true },
  // Solo navegación (ver PANTALLAS_SOLO_NAVEGABLES en home-preview.tsx): no
  // tienen constructor de bloques, clicarlas solo mueve el preview.
  ...PANTALLAS_SOLO_NAVEGABLES.map((p) => ({ id: p.id as IdPantalla, label: p.etiqueta, desplegable: false })),
];

export function ThemeEditorFullscreen() {
  const { rol } = usePermisos();
  const [nodo, setNodo] = useState<Nodo>({ tipo: 'pantalla', id: 'home' });
  const [pantallaActiva, setPantallaActiva] = useState<PantallaId>('home');
  const [expandidos, setExpandidos] = useState<Set<IdPantalla>>(new Set(['home']));
  const [zoom, setZoom] = useState(1);
  const [previewVivo, setPreviewVivo] = useState(true);
  const [comandoVista, setComandoVista] = useState<{ vista: VistaId; nonce: number } | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
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

  if (rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
    return <p className="p-6 text-sm text-muted-foreground">Solo la propietaria o la gerencia del estudio pueden editar la apariencia.</p>;
  }

  function seleccionar(n: Nodo) {
    setNodo(n);
    const p = n.tipo === 'tema' ? null : n.tipo === 'item' && n.grupo !== 'contenido-portal' ? n.grupo : n.tipo === 'pantalla' && PANTALLA_IDS.includes(n.id as PantallaId) ? (n.id as PantallaId) : null;
    if (p) setPantallaActiva(p);
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

  const cambiosTema = temaPublicado ? contarCambios(ajustesHook.draft, temaPublicado) : 0;
  const bloquesIncompletos = PANTALLA_IDS.flatMap((p) =>
    bloquesHook.bloquesDe(p)
      .filter((b): b is Exclude<BloqueHome, { kind: 'sistema' }> => b.kind !== 'sistema')
      .filter((b) => !bloqueEstaCompleto(b))
      .map((b) => ({ pantalla: p, bloque: b })),
  );
  const puedePublicar = ajustesHook.contraste.ok && bloquesIncompletos.length === 0;

  function deshacerActivo() {
    if (nodo.tipo === 'tema') { ajustesHook.recargar(); return; }
    if (nodo.tipo === 'pantalla' && nodo.id === 'dashboard-inicio') { homeHook.recargar(); return; }
    const p = nodo.tipo === 'item' && nodo.grupo !== 'contenido-portal' ? nodo.grupo : nodo.tipo === 'pantalla' && PANTALLA_IDS.includes(nodo.id as PantallaId) ? (nodo.id as PantallaId) : null;
    if (p) bloquesHook.recargar(p);
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

        <div className="flex items-center gap-1.5 flex-none">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-1 mr-1.5">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.75, z - 0.1))} aria-label="Alejar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40" disabled={zoom <= 0.75}>
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] font-semibold text-muted-foreground w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(1.25, z + 0.1))} aria-label="Acercar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40" disabled={zoom >= 1.25}>
              <ZoomIn size={14} />
            </button>
          </div>
          <button
            type="button" onClick={() => setPreviewVivo((v) => !v)} aria-pressed={previewVivo}
            title={previewVivo ? 'Ocultar el contorno de selección' : 'Mostrar el contorno de selección'}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {previewVivo ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button type="button" onClick={deshacerActivo} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
            <RotateCcw size={14} /> Deshacer
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

      <div className="flex-1 min-h-0 grid grid-cols-[272px_minmax(0,1fr)_344px]">
        {/* Rail izquierdo */}
        <div className="border-r border-border overflow-y-auto p-3 space-y-4">
          <div>
            <p className="px-2 pb-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Tema</p>
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
          </div>

          <div>
            <p className="px-2 pb-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Pantallas</p>
            <div className="space-y-0.5">
              {PANTALLAS_RAIL.map((p) => {
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
        </div>

        {/* Preview central */}
        <div className="overflow-auto p-6 flex items-start justify-center bg-muted/30">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            {nodo.tipo === 'tema' ? (
              <ThemePreview config={ajustesHook.draft} slug={ajustesHook.studio?.slug} />
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
                seleccionId={previewVivo && nodo.tipo === 'item' ? nodo.itemId : null}
                onBloqueSeleccionado={(id) => seleccionar({ tipo: 'item', grupo: pantallaActiva, itemId: id })}
                temaBorrador={ajustesHook.draft}
                irA={comandoVista}
              />
            )}
          </div>
        </div>

        {/* Panel derecho: inspector de lo seleccionado */}
        <div className="border-l border-border overflow-y-auto p-4">
          {nodo.tipo === 'tema' ? (
            <AjustesCategoriaPanel hook={ajustesHook} categoriaId={nodo.categoria} />
          ) : nodo.tipo === 'pantalla' && nodo.id === 'dashboard-inicio' ? (
            <p className="text-[13px] text-muted-foreground">Las secciones de Inicio del panel no tienen ajustes propios — solo se pueden reordenar u ocultar.</p>
          ) : nodo.tipo === 'pantalla' && (nodo.id === 'reservas' || nodo.id === 'perfil') ? (
            <p className="text-[13px] text-muted-foreground">Esta pantalla no tiene bloques editables — navégala en el preview.</p>
          ) : nodo.tipo === 'item' && nodo.grupo === 'contenido-portal' ? (
            <ContenidoPortalPanel hook={contenidoHook} seleccionId={nodo.itemId} />
          ) : nodo.tipo === 'pantalla' && nodo.id === 'contenido-portal' ? (
            <p className="text-[13px] text-muted-foreground">Cada campo se guarda solo, al escribirlo. Selecciona un banner de la izquierda para editarlo.</p>
          ) : (
            <BloquesConfigPanel
              hook={bloquesHook}
              pantalla={nodo.tipo === 'item' ? nodo.grupo as PantallaId : pantallaActiva}
              seleccionId={nodo.tipo === 'item' ? nodo.itemId : null}
            />
          )}
        </div>
      </div>

      {/* Antes de publicar */}
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
