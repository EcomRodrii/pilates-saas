'use client';

import { useState } from 'react';
import { Monitor, Smartphone, RotateCcw } from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import type { PantallaId } from '@/lib/portal-home-bloques';
import { useHomeSeccionesEditor, HomeSeccionesList } from './home-editor';
import {
  useContenidoPortalEditor, ContenidoPortalList, ContenidoPortalPanel,
} from './contenido-portal-editor';
import { useBloquesEditor, BloquesSeccionesList, BloquesConfigPanel } from './portal-bloques-editor';
import { useThemeEditor, AjustesCategoriaPanel, AJUSTES_CATEGORIAS, type AjustesCategoriaId } from './theme-editor';
import { HomePreview } from './home-preview';
import { ThemePreview } from './theme-preview';

// Layout único de "Apariencia" estilo Shopify Theme Editor: selector de
// página arriba, columna de Secciones/Ajustes a la izquierda, vista previa
// centrada, panel de configuración de lo seleccionado a la derecha.
//
// Fusiona las 4 pestañas planas que había antes (Marca y colores / Inicio /
// Contenido del portal / Bloques del portal) — cada una sigue guardando
// EXACTAMENTE como antes (son 3 mecanismos de persistencia distintos,
// unificarlos es un refactor de backend aparte que no hacía falta para el
// resultado visual pedido): esto solo reorganiza DÓNDE se pinta cada cosa.

type Pagina = 'dashboard-inicio' | 'portal-home' | 'portal-clases' | 'portal-bonos' | 'contenido-portal';
type PanelIzq = 'secciones' | 'ajustes';

const PAGINAS: { id: Pagina; label: string }[] = [
  { id: 'portal-home', label: 'Portal — Inicio' },
  { id: 'portal-clases', label: 'Portal — Clases' },
  { id: 'portal-bonos', label: 'Portal — Bonos' },
  { id: 'contenido-portal', label: 'Contenido del portal' },
  { id: 'dashboard-inicio', label: 'Inicio del panel' },
];

const PANTALLA_DE: Partial<Record<Pagina, PantallaId>> = {
  'portal-home': 'home', 'portal-clases': 'clases', 'portal-bonos': 'bonos',
};

export function ThemeWorkspace() {
  const { rol } = usePermisos();
  const [pagina, setPagina] = useState<Pagina>('portal-home');
  const [panelIzq, setPanelIzq] = useState<PanelIzq>('secciones');
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<AjustesCategoriaId>('tema');
  const [dispositivo, setDispositivo] = useState<'desktop' | 'mobile'>('mobile');

  // Los 4 hooks se llaman siempre, sin condicionar por `pagina` (reglas de
  // hooks) — cada uno solo hace su fetch/persistencia cuando de verdad se
  // usa (montar el hook no publica nada por sí solo).
  const pantallaPortal = PANTALLA_DE[pagina] ?? 'home';
  const bloquesHook = useBloquesEditor(pantallaPortal);
  const homeHook = useHomeSeccionesEditor();
  const contenidoHook = useContenidoPortalEditor();
  const ajustesHook = useThemeEditor();

  if (rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
    return <p className="text-sm text-muted-foreground">Solo la propietaria o la gerencia del estudio pueden editar la apariencia.</p>;
  }
  if (rol !== 'PROPIETARIO' && (pagina === 'dashboard-inicio' || panelIzq === 'ajustes')) {
    // Inicio del panel y Marca y colores siempre fueron solo-propietaria; el
    // resto (Bloques/Contenido) ya admitía MANAGER. Se conserva ese límite
    // por página en vez de aflojarlo al fusionar las 4 pestañas.
    return <p className="text-sm text-muted-foreground">Solo la propietaria del estudio puede editar {panelIzq === 'ajustes' ? 'la marca y colores' : 'el inicio del panel'}.</p>;
  }

  function cambiarPagina(p: Pagina) {
    setPagina(p);
    setSeleccionId(null);
  }
  function cambiarPanelIzq(v: PanelIzq) {
    setPanelIzq(v);
    setSeleccionId(null);
  }

  const respuestaBotonTab = (activo: boolean) =>
    `px-3 py-1.5 rounded-lg text-[12.5px] font-semibold ${activo ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {panelIzq === 'secciones' ? (
          <select
            value={pagina}
            onChange={(e) => cambiarPagina(e.target.value as Pagina)}
            className="text-[13px] font-semibold px-3 py-2 rounded-xl border border-border bg-background"
            aria-label="Página a editar"
          >
            {PAGINAS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        ) : <span className="text-[13px] font-bold text-foreground">Ajustes de marca</span>}

        <div className="flex items-center gap-2">
          {panelIzq === 'ajustes' && (
            <div className="flex items-center gap-1 rounded-lg border border-border p-1">
              <button
                type="button" onClick={() => setDispositivo('desktop')} aria-label="Vista de escritorio" aria-pressed={dispositivo === 'desktop'}
                className={`p-1.5 rounded-md ${dispositivo === 'desktop' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
              >
                <Monitor size={15} />
              </button>
              <button
                type="button" onClick={() => setDispositivo('mobile')} aria-label="Vista de móvil" aria-pressed={dispositivo === 'mobile'}
                className={`p-1.5 rounded-md ${dispositivo === 'mobile' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
              >
                <Smartphone size={15} />
              </button>
            </div>
          )}
          <BarraGuardar
            panelIzq={panelIzq} pagina={pagina}
            bloquesHook={bloquesHook} homeHook={homeHook} ajustesHook={ajustesHook}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px] items-start">
        {/* Columna izquierda: Secciones/Ajustes */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
          <div className="flex gap-1 p-1 rounded-xl bg-muted" role="tablist" aria-label="Secciones o Ajustes">
            <button type="button" role="tab" aria-selected={panelIzq === 'secciones'} onClick={() => cambiarPanelIzq('secciones')} className={respuestaBotonTab(panelIzq === 'secciones')}>
              Secciones
            </button>
            <button type="button" role="tab" aria-selected={panelIzq === 'ajustes'} onClick={() => cambiarPanelIzq('ajustes')} className={respuestaBotonTab(panelIzq === 'ajustes')}>
              Ajustes
            </button>
          </div>

          {panelIzq === 'secciones' ? (
            <SeccionesDe
              pagina={pagina} pantalla={pantallaPortal} seleccionId={seleccionId} onSeleccionar={setSeleccionId}
              bloquesHook={bloquesHook} homeHook={homeHook} contenidoHook={contenidoHook}
            />
          ) : (
            <div className="space-y-1">
              {AJUSTES_CATEGORIAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoria(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium ${categoria === c.id ? 'bg-brand/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview centrado */}
        <div className="lg:sticky lg:top-4">
          <PreviewCentral
            panelIzq={panelIzq} pagina={pagina} pantalla={pantallaPortal} dispositivo={dispositivo}
            bloquesHook={bloquesHook} ajustesHook={ajustesHook}
            seleccionId={seleccionId} onSeleccionar={setSeleccionId}
          />
        </div>

        {/* Panel derecho: configuración de lo seleccionado */}
        <div className="rounded-2xl border border-border bg-card p-4">
          {panelIzq === 'secciones' ? (
            <PanelDerechoSecciones
              pagina={pagina} seleccionId={seleccionId}
              bloquesHook={bloquesHook} contenidoHook={contenidoHook}
            />
          ) : (
            <AjustesCategoriaPanel hook={ajustesHook} categoriaId={categoria} />
          )}
        </div>
      </div>
    </div>
  );
}

function SeccionesDe({
  pagina, pantalla, seleccionId, onSeleccionar, bloquesHook, homeHook, contenidoHook,
}: {
  pagina: Pagina;
  pantalla: PantallaId;
  seleccionId: string | null;
  onSeleccionar: (id: string) => void;
  bloquesHook: ReturnType<typeof useBloquesEditor>;
  homeHook: ReturnType<typeof useHomeSeccionesEditor>;
  contenidoHook: ReturnType<typeof useContenidoPortalEditor>;
}) {
  if (pagina === 'dashboard-inicio') return <HomeSeccionesList hook={homeHook} />;
  if (pagina === 'contenido-portal') return <ContenidoPortalList hook={contenidoHook} seleccionId={seleccionId} onSeleccionar={onSeleccionar} />;
  return <BloquesSeccionesList hook={bloquesHook} pantalla={pantalla} seleccionId={seleccionId} onSeleccionar={onSeleccionar} />;
}

function PanelDerechoSecciones({
  pagina, seleccionId, bloquesHook, contenidoHook,
}: {
  pagina: Pagina;
  seleccionId: string | null;
  bloquesHook: ReturnType<typeof useBloquesEditor>;
  contenidoHook: ReturnType<typeof useContenidoPortalEditor>;
}) {
  if (pagina === 'dashboard-inicio') {
    return <p className="text-[13px] text-muted-foreground">Las secciones de Inicio del panel no tienen ajustes propios — solo se pueden reordenar u ocultar.</p>;
  }
  if (pagina === 'contenido-portal') return <ContenidoPortalPanel hook={contenidoHook} seleccionId={seleccionId} />;
  return <BloquesConfigPanel hook={bloquesHook} seleccionId={seleccionId} />;
}

function PreviewCentral({
  panelIzq, pagina, pantalla, dispositivo, bloquesHook, ajustesHook, seleccionId, onSeleccionar,
}: {
  panelIzq: PanelIzq;
  pagina: Pagina;
  pantalla: PantallaId;
  dispositivo: 'desktop' | 'mobile';
  bloquesHook: ReturnType<typeof useBloquesEditor>;
  ajustesHook: ReturnType<typeof useThemeEditor>;
  seleccionId: string | null;
  onSeleccionar: (id: string) => void;
}) {
  if (panelIzq === 'ajustes') {
    return (
      <div style={{ maxWidth: dispositivo === 'desktop' ? 900 : 320 }} className="mx-auto transition-[max-width]">
        <ThemePreview config={ajustesHook.draft} slug={ajustesHook.studio?.slug} />
      </div>
    );
  }
  if (pagina === 'dashboard-inicio' || pagina === 'contenido-portal') {
    return (
      <div className="mx-auto w-full max-w-[320px] aspect-[9/16] rounded-2xl border border-dashed border-border bg-muted/40 flex items-center justify-center text-center px-6">
        <p className="text-[12px] text-muted-foreground">
          {pagina === 'dashboard-inicio' ? 'Este panel es interno, no tiene vista previa.' : 'Los banners se ven en Inicio del portal — sin vista previa en directo todavía.'}
        </p>
      </div>
    );
  }
  return (
    <HomePreview
      bloquesPorPantalla={bloquesHook.bloquesPorPantalla} pantalla={pantalla} onPantallaChange={() => {}} slug={ajustesHook.studio?.slug}
      seleccionId={seleccionId} onBloqueSeleccionado={onSeleccionar}
      temaBorrador={ajustesHook.draft}
    />
  );
}

function BarraGuardar({
  panelIzq, pagina, bloquesHook, homeHook, ajustesHook,
}: {
  panelIzq: PanelIzq;
  pagina: Pagina;
  bloquesHook: ReturnType<typeof useBloquesEditor>;
  homeHook: ReturnType<typeof useHomeSeccionesEditor>;
  ajustesHook: ReturnType<typeof useThemeEditor>;
}) {
  if (panelIzq === 'ajustes') {
    return (
      <div className="flex items-center gap-2">
        <button onClick={ajustesHook.restaurar} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-muted-foreground">
          <RotateCcw size={14} /> Restaurar
        </button>
        <button onClick={ajustesHook.handleGuardar} disabled={ajustesHook.guardando} className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-border">
          {ajustesHook.guardando ? 'Guardando…' : 'Guardar borrador'}
        </button>
        <button
          onClick={ajustesHook.handlePublicar}
          disabled={ajustesHook.publicando || !ajustesHook.contraste.ok}
          title={!ajustesHook.contraste.ok ? 'Corrige el contraste antes de publicar' : undefined}
          className="text-[13px] font-bold px-4 py-2 rounded-xl bg-brand text-brand-foreground disabled:opacity-50"
        >
          {ajustesHook.publicando ? 'Publicando…' : 'Publicar'}
        </button>
      </div>
    );
  }
  if (pagina === 'dashboard-inicio') {
    return (
      <div className="flex items-center gap-2">
        <button onClick={homeHook.restaurar} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-muted-foreground">
          <RotateCcw size={14} /> Restaurar
        </button>
        <button onClick={homeHook.guardar} disabled={homeHook.guardando} className="text-[13px] font-bold px-4 py-2 rounded-xl bg-brand text-brand-foreground disabled:opacity-50">
          {homeHook.guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    );
  }
  if (pagina === 'contenido-portal') {
    return <p className="text-[12px] text-muted-foreground">Cada campo se guarda solo, al escribirlo.</p>;
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={bloquesHook.restaurar} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-muted-foreground">
        <RotateCcw size={14} /> Restaurar
      </button>
      <button onClick={bloquesHook.guardar} disabled={bloquesHook.guardando} className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-border disabled:opacity-50">
        {bloquesHook.guardando ? 'Guardando…' : 'Guardar borrador'}
      </button>
      <button onClick={bloquesHook.publicar} disabled={bloquesHook.publicando} className="text-[13px] font-bold px-4 py-2 rounded-xl bg-brand text-brand-foreground disabled:opacity-50">
        {bloquesHook.publicando ? 'Publicando…' : 'Publicar'}
      </button>
    </div>
  );
}
