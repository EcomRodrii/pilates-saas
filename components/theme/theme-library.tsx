'use client';

// Biblioteca de temas — la pantalla de llegada de "Apariencia".
//
// Sustituye a la categoría "Tema" que vivía dentro del editor (una rejilla de
// botones con solo el nombre y una frase): un tema se elige mirándolo, no
// leyéndolo, así que aquí cada uno se ve pintado (ThemeThumb) antes de
// instalarlo. El afinado campo a campo sigue viviendo en el editor
// (/configuracion/apariencia/editor), al que se llega con "Personalizar".
//
// Instalar un tema NO publica: vuelca sus `defaults` en el BORRADOR (mismo
// `elegirTema` del hook que ya usaba el editor) y deja que la propietaria lo
// mire y decida. Publicar sigue siendo un acto aparte y explícito.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { useThemeEditor } from './theme-editor';
import { ThemeThumb } from './theme-thumb';
import { THEME_DEFINITIONS, getThemeDefinition, type ThemeDefinition } from '@/lib/theme-definitions';
import { fetchThemePublicado, guardarThemeBorrador } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import {
  DEFAULT_THEME, FUENTES, ESTILOS_TITULAR_PORTAL, type ThemeConfig,
} from '@/lib/theme-schema';

const RUTA_EDITOR = '/configuracion/apariencia/editor';

/** Los campos del tema que de verdad cambian lo que ve una socia. */
const CAMPOS_VISIBLES = [
  'primary', 'secondary', 'accent', 'background', 'text',
  'fontId', 'portalHeadingFontId', 'radius', 'buttonStyle', 'cardStyle',
  'tabBarStyle', 'barraOscura', 'faviconUrl',
] as const satisfies readonly (keyof ThemeConfig)[];

/**
 * Cuántos de esos campos difieren entre el borrador y lo publicado. Se compara
 * campo a campo y no con un igual profundo del objeto entero para poder decir
 * "3 cambios sin publicar" en vez de un "hay cambios" sin cuerpo — y porque
 * metadatos como `themeCustomized` cambian sin que la socia note nada.
 */
export function contarCambios(borrador: ThemeConfig, publicado: ThemeConfig | null): number {
  if (!publicado) return 0;
  return CAMPOS_VISIBLES.filter((k) => borrador[k] !== publicado[k]).length;
}

function nombreFuente(id: ThemeConfig['fontId']): string {
  return FUENTES.find((f) => f.id === id)?.label ?? id;
}
function nombreTitular(id: ThemeConfig['portalHeadingFontId']): string {
  return ESTILOS_TITULAR_PORTAL.find((f) => f.id === id)?.label ?? id;
}

/** La fila de los cinco colores del tema. */
function Colores({ config }: { config: ThemeConfig }) {
  const colores: [string, string][] = [
    ['Marca', config.primary], ['Secundario', config.secondary], ['Acento', config.accent],
    ['Fondo', config.background], ['Texto', config.text],
  ];
  return (
    <div className="flex items-center gap-1.5">
      {colores.map(([nombre, hex]) => (
        <span
          key={nombre}
          title={`${nombre} · ${hex}`}
          className="size-5 rounded-full border border-border"
          style={{ background: hex }}
        />
      ))}
    </div>
  );
}

export function ThemeLibrary() {
  const hook = useThemeEditor();
  const { draft, rol, estado, elegirTema, handlePublicar, publicando, aviso, contraste } = hook;
  const [publicado, setPublicado] = useState<ThemeConfig | null>(null);
  const [instalando, setInstalando] = useState<string | null>(null);
  const [errorInstalar, setErrorInstalar] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado().then((t) => { if (vivo) setPublicado(t); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  /**
   * Instalar = volcar el tema en el borrador Y guardarlo. Se persiste el objeto
   * fusionado a mano en vez de `elegirTema` + `handleGuardar` porque el segundo
   * leería el `draft` de ANTES del setState (React no lo actualiza en el acto)
   * y guardaría el tema anterior — un fallo silencioso: la pantalla mostraría
   * el tema nuevo y el servidor conservaría el viejo.
   */
  // Tras publicar hay que releer lo publicado: si no, el contador seguiría
  // diciendo "N cambios sin publicar" sobre un tema que ya se publicó.
  async function publicar() {
    await handlePublicar();
    await fetchThemePublicado().then(setPublicado).catch(() => {});
  }

  async function instalar(def: ThemeDefinition) {
    setInstalando(def.id);
    setErrorInstalar(null);
    const nuevo: ThemeConfig = {
      ...draft, ...def.defaults,
      themeId: def.id, themeVersion: def.version, themeCustomized: false,
    };
    try {
      await guardarThemeBorrador(nuevo);
      elegirTema(def); // refleja en pantalla lo que ya está guardado
    } catch (e) {
      setErrorInstalar(mensajeSeguro((e as Error).message, ERROR_RED));
    } finally {
      setInstalando(null);
    }
  }

  if (rol !== 'PROPIETARIO') {
    return <p className="text-sm text-muted-foreground">Solo la propietaria del estudio puede cambiar la apariencia.</p>;
  }
  if (estado === 'cargando') {
    return <p className="text-sm text-muted-foreground">Cargando tu tema…</p>;
  }

  const definicion = getThemeDefinition(draft.themeId);
  const cambios = contarCambios(draft, publicado);

  // "Volver a lo publicado" descarta el borrador y deja el tema que las socias
  // ya están viendo — la vuelta atrás de quien ha probado algo y no le
  // convence. Distinto de `hook.restaurar()`, que vuelve al tema del SISTEMA
  // (y que por eso se queda en el editor, con el resto del ajuste fino).
  async function volverAPublicado() {
    if (!publicado) return;
    await instalar({
      id: publicado.themeId, version: publicado.themeVersion,
      label: '', description: '', capabilities: [], defaults: publicado,
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Tu tema ─────────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <h2 className="text-[15px] font-bold text-foreground">Tu tema</h2>
        <Card className="p-4">
          <div className="flex gap-4 items-start">
            <ThemeThumb config={draft} ancho={96} />
            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-bold text-foreground">
                  {definicion?.label ?? 'Tema propio'}
                </span>
                <Badge variant="outline">v{draft.themeVersion}</Badge>
                {cambios > 0 ? (
                  <Badge className="bg-warning/10 text-warning border-transparent">
                    {cambios} {cambios === 1 ? 'cambio' : 'cambios'} sin publicar
                  </Badge>
                ) : (
                  <Badge className="bg-success/10 text-success border-transparent">Publicado</Badge>
                )}
                {draft.themeCustomized && (
                  <span className="text-[11.5px] text-muted-foreground">personalizado</span>
                )}
              </div>

              <p className="text-[12.5px] text-muted-foreground">
                {definicion?.description ?? 'Un tema afinado a mano desde "Personalizar".'}
              </p>

              <Colores config={draft} />

              <p className="text-[11.5px] text-muted-foreground">
                {nombreTitular(draft.portalHeadingFontId)} · {nombreFuente(draft.fontId)}
              </p>

              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                <Link href={RUTA_EDITOR} className={buttonVariants()}>Personalizar</Link>
                <Button
                  variant="outline"
                  onClick={publicar}
                  disabled={publicando || cambios === 0 || !contraste.ok}
                  title={!contraste.ok ? 'Corrige el contraste antes de publicar' : undefined}
                >
                  {publicando ? 'Publicando…' : 'Publicar'}
                </Button>
                {cambios > 0 && publicado && (
                  <Button variant="ghost" onClick={volverAPublicado} disabled={instalando !== null}>
                    <RotateCcw size={14} /> Volver a lo publicado
                  </Button>
                )}
              </div>

              {errorInstalar && <p className="text-[12.5px] font-medium text-destructive">{errorInstalar}</p>}

              {!contraste.ok && (
                <ul className="text-[11.5px] text-destructive space-y-0.5">
                  {contraste.errores.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
              {aviso && (
                <p className={`text-[12.5px] font-medium ${aviso.tipo === 'ok' ? 'text-success' : 'text-destructive'}`}>
                  {aviso.texto}
                </p>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* ── Biblioteca ──────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <h2 className="text-[15px] font-bold text-foreground">Biblioteca de temas</h2>
        <Card className="p-0 overflow-hidden">
          {THEME_DEFINITIONS.map((def, i) => {
            const enUso = draft.themeId === def.id;
            // El tema tal cual lo define la galería, sin lo que el estudio haya
            // tocado encima: la miniatura tiene que enseñar lo que se va a
            // instalar, no lo que hay ahora.
            const config: ThemeConfig = { ...DEFAULT_THEME, ...def.defaults };
            return (
              <div
                key={def.id}
                // Ancla estable para las pruebas: el nombre del tema aparece
                // dos veces en la pantalla (aquí y en "Tu tema"), así que
                // localizar la fila por texto es ambiguo por construcción.
                data-tema={def.id}
                className={`flex gap-4 items-center p-4 hover:bg-muted/40 transition-colors ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <ThemeThumb config={config} ancho={96} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-bold text-foreground">{def.label}</span>
                    <Badge variant="outline">v{def.version}</Badge>
                    {enUso && (
                      <Badge className="bg-success/10 text-success border-transparent">
                        <Check size={11} strokeWidth={3} /> En uso
                      </Badge>
                    )}
                  </div>
                  <p className="text-[12.5px] text-muted-foreground mt-1 line-clamp-1">{def.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <Link href={RUTA_EDITOR} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Personalizar
                  </Link>
                  {!enUso && (
                    <Button size="sm" disabled={instalando !== null} onClick={() => instalar(def)}>
                      {instalando === def.id ? 'Instalando…' : 'Usar'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
        <p className="text-[11.5px] text-muted-foreground">
          Instalar un tema cambia la app de tus socias y tu página pública de reservas.
          Tu logo y el contenido de tus pantallas no se tocan.
        </p>
      </section>
    </div>
  );
}
