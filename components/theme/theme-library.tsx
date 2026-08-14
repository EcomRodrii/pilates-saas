'use client';

// Biblioteca de temas — la pantalla de llegada de "Apariencia".
//
// Sustituye a la categoría "Tema" que vivía dentro del editor (una rejilla de
// botones con solo el nombre y una frase): un tema se elige mirándolo, no
// leyéndolo, así que aquí cada uno se ve pintado (ThemeThumbVivo: el portal de
// verdad en pequeño, no un dibujo) antes de instalarlo. El afinado campo a campo sigue viviendo en el editor
// (/configuracion/apariencia/editor), al que se llega con "Personalizar".
//
// Instalar un tema NO publica: vuelca sus `defaults` en el BORRADOR (mismo
// `elegirTema` del hook que ya usaba el editor) y deja que la propietaria lo
// mire y decida. Publicar sigue siendo un acto aparte y explícito.

import { sembrarBloquesHome } from '@/lib/portal-home-bloques';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { useThemeEditor } from './theme-editor';
import { useStudio } from '@/lib/studio-context';
import { ThemeThumbVivo } from './theme-thumb-vivo';
import { ImportarTemaZip } from './importar-tema-zip';
import { THEME_DEFINITIONS, getThemeDefinition, type ThemeDefinition } from '@/lib/theme-definitions';
import { fetchThemePublicado, guardarThemeBorrador, fetchBloquesBorrador, fetchBloquesPublicado, guardarBloquesBorradorApi, fetchHomePreviewToken } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { BloqueHome } from '@/lib/portal-home-bloques';
import {
  DEFAULT_THEME, FUENTES, ESTILOS_TITULAR_PORTAL, instalarTema, type ThemeConfig,
} from '@/lib/theme-schema';

const RUTA_EDITOR = '/configuracion/apariencia/editor';

/** Los campos del tema que de verdad cambian lo que ve una socia. */
const CAMPOS_VISIBLES = [
  'primary', 'secondary', 'accent', 'background', 'text',
  'fontId', 'portalHeadingFontId', 'radius', 'buttonStyle', 'cardStyle',
  'tabBarStyle', 'barraOscura', 'barraFlotante', 'destacado', 'faviconUrl',
  // `radioTema` y `variantes` (objetos) quedan fuera a propósito, mismo
  // criterio que `navPortal`/`redesSociales`: comparar por referencia daría
  // falsos positivos (el fetch siempre crea un objeto nuevo), y el contador
  // se quedaría clavado en "1 cambio sin publicar" para siempre.
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
  const router = useRouter();
  const hook = useThemeEditor();
  const { dataLoaded } = useStudio();
  const { draft, rol, estado, elegirTema, handlePublicar, publicando, aviso, contraste } = hook;
  const [publicado, setPublicado] = useState<ThemeConfig | null>(null);
  const [instalando, setInstalando] = useState<string | null>(null);
  // El token de la vista previa se pide UNA vez y lo comparten las seis
  // miniaturas: es del estudio, no del tema. Era la mitad de la objeción que
  // el dibujo a mano documentaba contra usar iframes aquí.
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  // Los bloques del Inicio que el estudio tiene AHORA — la base sobre la que
  // cada tema siembra los suyos para la miniatura.
  const [bloquesActuales, setBloquesActuales] = useState<BloqueHome[] | null>(null);
  const [errorInstalar, setErrorInstalar] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado().then((t) => { if (vivo) setPublicado(t); }).catch(() => {});
    // Un token para todas las miniaturas, y los bloques de partida. Si algo de
    // esto falla, las miniaturas se quedan en su hueco gris: la biblioteca
    // sigue siendo usable (nombre, descripción, colores, Usar/Personalizar).
    fetchHomePreviewToken().then(({ token }) => { if (vivo) setTokenPreview(token); }).catch(() => {});
    fetchBloquesBorrador('home').then((b) => { if (vivo) setBloquesActuales(b); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  /**
   * Instalar = volcar el tema en el borrador Y guardarlo (más, si el tema trae
   * `bloquesHome`, sembrar el Inicio con ese orden). Se persiste el objeto
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

  /**
   * `irAlEditor` es lo que arregla "Personalizar".
   *
   * ⚠️ Ese botón era un `Link` FIJO a la ruta del editor, sin el id del tema de
   * su fila. Daba igual en cuál pulsaras: entrabas al editor con TU tema. Por
   * eso Oliva, Bloom y Noir se veían los tres iguales — no porque los temas lo
   * fueran (declaran cabecera, accesos y bloques distintos), sino porque nunca
   * llegabas a verlos.
   *
   * Instala en el BORRADOR, que es exactamente lo que ya hacía "Usar": no
   * publica nada, y se deshace con "Volver a lo publicado".
   */
  async function instalar(def: ThemeDefinition, irAlEditor = false) {
    setInstalando(def.id);
    setErrorInstalar(null);
    // Instalar un tema SUSTITUYE el estado, no lo fusiona. Ver `instalarTema`
    // y el bug de los tres ejes de barra conviviendo que lo motivó.
    const nuevo = instalarTema(draft, def.defaults, { themeId: def.id, themeVersion: def.version });
    try {
      await guardarThemeBorrador(nuevo);
      if (def.bloquesHome && def.bloquesHome.length > 0) {
        const actuales = await fetchBloquesBorrador('home');
        await guardarBloquesBorradorApi('home', sembrarBloquesHome(actuales, def.bloquesHome));
      }
      elegirTema(def); // refleja en pantalla lo que ya está guardado
      // La base de las miniaturas acaba de cambiar: sin esto seguirían
      // sembrando sobre los bloques de antes de instalar.
      fetchBloquesBorrador('home').then(setBloquesActuales).catch(() => {});
      if (irAlEditor) router.push(RUTA_EDITOR);
    } catch (e) {
      setErrorInstalar(mensajeSeguro((e as Error).message, ERROR_RED));
    } finally {
      setInstalando(null);
    }
  }

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
  if (dataLoaded && rol !== 'PROPIETARIO') {
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
  /**
   * Deshace TODO lo que se haya probado: colores, forma y secciones.
   *
   * ⚠️ Antes solo deshacía el tema. Construía una definición sintética sin
   * `bloquesHome`, así que `instalar()` se saltaba la siembra y el borrador se
   * quedaba con las secciones del tema que estabas probando. Probar Bloom y
   * volver atrás te dejaba los colores de Noir con los retos de Bloom — un
   * generador de "el editor enseña una cosa y el portal otra". Encontrado
   * probándolo en un estudio real.
   *
   * Las secciones se restauran TAL CUAL están publicadas, no sembrando desde
   * la lista del tema: volver atrás es volver a lo que ven las socias, incluso
   * si la propietaria había reordenado a mano.
   */
  async function volverAPublicado() {
    if (!publicado) return;
    setInstalando(publicado.themeId);
    setErrorInstalar(null);
    try {
      const nuevo = instalarTema(draft, publicado, {
        themeId: publicado.themeId, themeVersion: publicado.themeVersion,
      });
      await guardarThemeBorrador(nuevo);
      const bloquesPub = await fetchBloquesPublicado('home');
      await guardarBloquesBorradorApi('home', bloquesPub);
      setBloquesActuales(bloquesPub);
      elegirTema({
        id: publicado.themeId, version: publicado.themeVersion,
        label: '', description: '', capabilities: [], defaults: publicado,
      });
    } catch (e) {
      setErrorInstalar(mensajeSeguro((e as Error).message, ERROR_RED));
    } finally {
      setInstalando(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Tu tema ─────────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <h2 className="text-[15px] font-bold text-foreground">Tu tema</h2>
        <Card className="p-4">
          <div className="flex gap-4 items-start">
            <ThemeThumbVivo
              config={draft} bloques={bloquesActuales}
              slug={hook.studio?.slug ?? null} token={tokenPreview}
              ancho={96} etiqueta={definicion?.label ?? 'tu tema'}
            />
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
                {/* Los bloques que dejaría ESTE tema al instalarse — misma
                    función que usa `instalar()`, así que la miniatura enseña
                    exactamente lo que va a pasar al pulsar "Usar". */}
                <ThemeThumbVivo
                  config={config}
                  bloques={bloquesActuales && def.bloquesHome?.length
                    ? sembrarBloquesHome(bloquesActuales, def.bloquesHome)
                    : bloquesActuales}
                  slug={hook.studio?.slug ?? null} token={tokenPreview}
                  ancho={96} etiqueta={def.label}
                />
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
                  {enUso ? (
                    <Link href={RUTA_EDITOR} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      Personalizar
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={instalando !== null}
                      onClick={() => instalar(def, true)}
                      title={`Pone ${def.label} en tu borrador y abre el editor. No publica nada.`}
                    >
                      {instalando === def.id ? 'Abriendo…' : 'Personalizar'}
                    </Button>
                  )}
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

      {/* El importador de ZIP: analiza, sube, enseña el resultado fiel, y deja
          publicar/borrar entre los ZIPs subidos — pero «publicar» ahí es un
          estado interno del panel, NO instala el tema para las socias reales:
          eso exige resolver antes el mismo origen/sandbox que protege el
          iframe de vista previa (ver el comentario de seguridad en
          `app/api/theme/importado/[id]/[[...ruta]]/route.ts`). */}
      <ImportarTemaZip />
    </div>
  );
}
