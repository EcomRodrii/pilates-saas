'use client';

// Editor de código real (HTML/CSS) para un tema ZIP importado — pantalla
// completa, `/configuracion/apariencia/editor-zip/[id]`.
//
// Edita el texto FUENTE de un fichero (nunca el HTML ya reescrito/enlazado
// que sirve el iframe de vista previa normal — ver el comentario de
// `contenidoFuenteDeFichero` en `lib/theme-import/servir.ts` sobre por qué).
// Guardar sube a R2 bajo `editado/<ruta>` (`PUT`) y NUNCA toca el original.
//
// La vista previa de la derecha es EN VIVO (debounce corto, ~150 ms — solo
// para no lanzar una petición por cada tecla) pero no persiste nada — ver
// `lib/theme-import/preview-en-vivo.ts` para el alcance exacto (HTML se
// renderiza tal cual escribes; CSS se añade como capa sobre el HTML de
// entrada ya guardado, por cascada, no por sustitución exacta). El marco
// (móvil/tablet/ancho completo + zoom) es el MISMO `MarcoDispositivo` que ya
// usa el editor de temas normal — mismo comportamiento, mismo componente, no
// una segunda implementación del mismo encogido/escalado.
//
// Solo HTML/CSS: el usuario pidió explícitamente "editor de código real
// (HTML/CSS)", no un editor de JS/imágenes/config del tema — mismo límite
// que ya aplica el backend (`PUT`, `preview-en-vivo`).

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Save, AlertTriangle, CheckCircle2, FileCode, Loader2,
  Smartphone, Tablet, Monitor, ZoomIn, ZoomOut, type LucideIcon,
} from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { Button } from '@/components/ui/button';
import { MarcoDispositivo } from './marco-dispositivo';
import { DISPOSITIVOS, DISPOSITIVO_IDS, type DispositivoId } from '@/lib/theme/dispositivos';
import { authHeader, fetchHomePreviewToken } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { ImportedThemeManifest } from '@/lib/theme-import/manifest';

interface TemaImportado {
  id: string;
  nombre: string;
  manifest: ImportedThemeManifest;
  estado: 'procesando' | 'listo' | 'incompatible' | 'error';
}

const RUTA_APARIENCIA = '/configuracion/apariencia';
// Corto a propósito: sigue siendo un debounce (una petición al servidor por
// pulsación sería ruido de red inútil), pero por debajo del umbral en el que
// un humano percibe retraso — se pidió explícitamente que se sintiera "en
// vivo" como el editor de temas normal, cuyo preview es un re-render local
// sin red de por medio.
const RETRASO_PREVIEW_MS = 150;

const ICONO_DISPOSITIVO: Record<DispositivoId, LucideIcon> = {
  movil: Smartphone, tablet: Tablet, completo: Monitor,
};

export function EditorZip({ id }: { id: string }) {
  const [tema, setTema] = useState<TemaImportado | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [rutaActual, setRutaActual] = useState<string | null>(null);
  const [cargandoFichero, setCargandoFichero] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispositivo, setDispositivo] = useState<DispositivoId>('movil');
  const [zoom, setZoom] = useState(1);

  const contenedorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Último texto del editor — en un ref, no en estado: cada tecla no debe
  // re-renderizar React, solo alimentar el debounce de la vista previa.
  const contenidoRef = useRef<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [resTema, { token: t }] = await Promise.all([
          fetch('/api/theme/importado', { headers: await authHeader() }),
          fetchHomePreviewToken(),
        ]);
        const body = await resTema.json().catch(() => null);
        const encontrado = (body?.temas as TemaImportado[] | undefined)?.find((x) => x.id === id) ?? null;
        if (cancelado) return;
        if (!encontrado) { setNoEncontrado(true); return; }
        setTema(encontrado);
        setToken(t);
        const editables = encontrado.manifest.ficheros.filter((f) => f.clase === 'html' || f.clase === 'css');
        const entrada = encontrado.manifest.entryPoints?.[0];
        const primera = editables.find((f) => f.ruta === entrada) ?? editables[0];
        if (primera) setRutaActual(primera.ruta);
      } catch (e) {
        if (!cancelado) setError(mensajeSeguro(e, ERROR_RED));
      }
    })();
    return () => { cancelado = true; };
  }, [id]);

  const pedirPreviewAhora = useCallback(async () => {
    if (!rutaActual || !token) return;
    try {
      const res = await fetch(`/api/theme/importado/${id}`, {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruta: rutaActual, contenido: contenidoRef.current, token }),
      });
      // Silencioso: un fallo de vista previa no debe interrumpir la
      // escritura — el editor sigue funcionando, solo no se actualiza la
      // imagen de la derecha hasta la siguiente pausa.
      if (!res.ok) return;
      setPreviewHtml(await res.text());
    } catch {
      // idem — sin bloquear al usuario por un problema de red pasajero
    }
  }, [id, rutaActual, token]);

  const programarPreview = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void pedirPreviewAhora(); }, RETRASO_PREVIEW_MS);
  }, [pedirPreviewAhora]);

  // Carga el texto fuente del fichero elegido y monta un CodeMirror nuevo —
  // más simple y robusto que intercambiar el `Language` de una instancia
  // viva, y el coste de recrear el editor al cambiar de fichero es
  // imperceptible para HTML/CSS de este tamaño.
  useEffect(() => {
    if (!rutaActual || !token) return;
    let cancelado = false;
    (async () => {
      setCargandoFichero(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/theme/importado/${id}/${rutaActual}?t=${encodeURIComponent(token)}&crudo=1`,
        );
        const body = await res.json().catch(() => null);
        if (cancelado) return;
        if (!res.ok || !body) {
          setError(body?.error ?? 'No se ha podido cargar el fichero.');
          return;
        }
        contenidoRef.current = body.contenido as string;
        viewRef.current?.destroy();
        if (contenedorRef.current) {
          const state = EditorState.create({
            doc: body.contenido,
            extensions: [
              basicSetup,
              body.clase === 'html' ? html() : css(),
              EditorView.updateListener.of((update) => {
                if (!update.docChanged) return;
                contenidoRef.current = update.state.doc.toString();
                setGuardadoOk(false);
                programarPreview();
              }),
            ],
          });
          viewRef.current = new EditorView({ state, parent: contenedorRef.current });
        }
        void pedirPreviewAhora();
      } catch (e) {
        if (!cancelado) setError(mensajeSeguro(e, ERROR_RED));
      } finally {
        if (!cancelado) setCargandoFichero(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pedirPreviewAhora/programarPreview cambian con rutaActual/token, que ya están en las deps
  }, [rutaActual, token, id]);

  useEffect(() => () => {
    viewRef.current?.destroy();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const guardar = useCallback(async () => {
    if (!rutaActual) return;
    setGuardando(true);
    setError(null);
    setGuardadoOk(false);
    try {
      const res = await fetch(`/api/theme/importado/${id}/${rutaActual}`, {
        method: 'PUT',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido: contenidoRef.current }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'No se ha podido guardar.');
        return;
      }
      setGuardadoOk(true);
    } catch (e) {
      setError(mensajeSeguro(e, ERROR_RED));
    } finally {
      setGuardando(false);
    }
  }, [id, rutaActual]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void guardar();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guardar]);

  if (noEncontrado) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-[15px] font-semibold text-foreground">No se ha encontrado este tema importado.</p>
          <Link href={RUTA_APARIENCIA} className="text-[13px] text-brand underline">Volver a Apariencia</Link>
        </div>
      </div>
    );
  }

  if (tema && tema.estado !== 'listo') {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <AlertTriangle className="size-6 mx-auto text-amber-600" />
          <p className="text-[15px] font-semibold text-foreground">
            Este tema no se pudo importar en modo estático — no se puede editar.
          </p>
          <Link href={RUTA_APARIENCIA} className="text-[13px] text-brand underline">Volver a Apariencia</Link>
        </div>
      </div>
    );
  }

  const editables = tema?.manifest.ficheros.filter((f) => f.clase === 'html' || f.clase === 'css') ?? [];

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5 shrink-0">
        <Link href={RUTA_APARIENCIA} className="text-muted-foreground hover:text-foreground" aria-label="Volver a Apariencia">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-foreground truncate">{tema?.nombre ?? 'Editor de código'}</p>
          <p className="text-[11.5px] text-muted-foreground truncate">{rutaActual}</p>
        </div>
        <div className="flex-1" />
        {error ? (
          <div className="flex items-center gap-1.5 text-[12.5px] text-destructive">
            <AlertTriangle className="size-3.5" />{error}
          </div>
        ) : guardadoOk ? (
          <div className="flex items-center gap-1.5 text-[12.5px] text-emerald-700">
            <CheckCircle2 className="size-3.5" />Guardado
          </div>
        ) : null}

        <div className="flex items-center gap-0.5 rounded-lg border border-border p-1" role="group" aria-label="Dispositivo">
          {DISPOSITIVO_IDS.map((idDispositivo) => {
            const Icono = ICONO_DISPOSITIVO[idDispositivo];
            return (
              <button
                key={idDispositivo} type="button" onClick={() => setDispositivo(idDispositivo)}
                aria-pressed={dispositivo === idDispositivo}
                title={DISPOSITIVOS[idDispositivo].etiqueta} aria-label={DISPOSITIVOS[idDispositivo].etiqueta}
                className={`p-1.5 rounded-md ${dispositivo === idDispositivo ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icono size={15} />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button" onClick={() => setZoom((z) => Math.max(0.75, z - 0.1))} aria-label="Alejar"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
            disabled={zoom <= 0.75}
          >
            <ZoomOut size={15} />
          </button>
          <span className="text-[12px] font-semibold text-foreground w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            type="button" onClick={() => setZoom((z) => Math.min(1.25, z + 0.1))} aria-label="Acercar"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
            disabled={zoom >= 1.25}
          >
            <ZoomIn size={15} />
          </button>
        </div>

        <Button size="sm" disabled={guardando || !rutaActual} onClick={() => void guardar()}>
          {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Guardar
        </Button>
      </header>

      {/* ⚠️ `min-w-0` aquí, no solo en la columna del medio: un item flex (esta
          grid es `flex-1` dentro de la columna de arriba) por defecto no se
          encoge por debajo del ancho INTRÍNSECO de su contenido — y el HTML
          crudo de un tema Design trae líneas larguísimas sin envolver
          (`<link href="https://fonts.googleapis.com/css2?family=...">`) que
          CodeMirror no envuelve por diseño. Sin este `min-w-0` en el propio
          contenedor de la grid, ese ancho se propagaba a la PÁGINA entera —
          la vista previa de 420px seguía ahí, solo que empujada fuera de la
          pantalla, y solo se veía haciendo scroll horizontal de toda la
          página (medido: parecía "no hay vista previa"/"no se puede
          editar"). `min-w-0` en cada nivel de la cadena, no solo en el hijo
          que ya lo tenía. */}
      <div className="flex-1 min-h-0 min-w-0 grid grid-cols-[200px_1fr_420px]">
        <aside className="border-r border-border overflow-y-auto p-2 space-y-0.5">
          {editables.map((f) => (
            <button
              key={f.ruta} type="button" onClick={() => setRutaActual(f.ruta)}
              className={`w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-left truncate ${
                f.ruta === rutaActual ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60'
              }`}
            >
              <FileCode className="size-3.5 shrink-0" />
              <span className="truncate">{f.ruta}</span>
            </button>
          ))}
          {editables.length === 0 ? (
            <p className="text-[12px] text-muted-foreground p-2">Este tema no trae ningún HTML/CSS editable.</p>
          ) : null}
        </aside>

        <div className="relative min-w-0 overflow-auto">
          {cargandoFichero ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          <div ref={contenedorRef} className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[13px]" />
        </div>

        <div
          data-preview-hueco
          className="border-l border-border bg-muted/30 overflow-auto p-4 flex items-start justify-center"
        >
          {previewHtml ? (
            <MarcoDispositivo dispositivo={dispositivo} zoom={zoom}>
              <iframe
                srcDoc={previewHtml} sandbox="allow-scripts" title="Vista previa en vivo"
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            </MarcoDispositivo>
          ) : (
            <div className="h-full flex items-center justify-center text-[12.5px] text-muted-foreground">
              Vista previa
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
