'use client';

// Importar un tema desde un ZIP (Claude Design u otra herramienta).
//
// ⚠️ Modo ESTÁTICO solo: HTML/CSS/assets/fuentes, servidos TAL CUAL dentro de
// un iframe en sandbox — nunca "reconstruidos" como componentes de Tentare.
// Un ZIP con .tsx/.jsx sin compilar, o que dependa de Next/Vite, se marca
// INCOMPATIBLE con el motivo exacto — nunca una aproximación silenciosa.
//
// ⚠️ DOS "publicar" que NO tienen nada que ver entre sí, y por eso este
// componente nunca usa la palabra pelada "Publicar" para el de aquí abajo:
// - El de esta tarjeta (`accionarPublicacion`) marca cuál ZIP es "el
//   elegido" y lo hace visible en `imports.tentare.app/<slug>` — un origen
//   APARTE de `tentare.app` (ver el comentario de seguridad en
//   `app/tema-publicado/[slug]/[[...ruta]]/route.ts`). NUNCA toca
//   `studio_theme` ni el portal real.
// - El que hace que el portal real (`tentare.app/portal/<slug>`,
//   `/reservar/<slug>`) muestre el tema vive DENTRO del editor nativo
//   (`/configuracion/apariencia/editor`, tras "Extraer a tema nativo"), y
//   escribe en `studio_theme.config_published` — sistema totalmente
//   distinto, sin relación con `theme_imports`.
// Confundir estos dos fue un bug real reportado por el fundador: extraía un
// ZIP, pulsaba el "Publicar" de esta tarjeta (el de arriba) y el portal
// real seguía sin cambiar — porque ese botón nunca tocaba `studio_theme`.
// El fix no cambia qué hace cada botón (ambos son legítimos y necesarios),
// solo que ya no puedan confundirse: ver `extraer()` y las etiquetas de
// abajo.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, AlertTriangle, CheckCircle2, Eye, EyeOff, ExternalLink, Trash2, Pencil, Wand2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { ImportedThemeManifest } from '@/lib/theme-import/manifest';

interface TemaImportado {
  id: string;
  nombre: string;
  manifest: ImportedThemeManifest;
  estado: 'procesando' | 'listo' | 'incompatible' | 'error';
  detalle: string | null;
  publicado: boolean;
  publicado_en: string | null;
  creado_en: string;
}

/** El host público de temas importados (`imports.tentare.app`), o `null` si
 *  no está configurado en este entorno — sin él no hay enlace que ofrecer,
 *  aunque el tema esté publicado (Vercel/DNS es un paso manual, ver el PR). */
const HOST_PUBLICADO = process.env.NEXT_PUBLIC_IMPORTS_HOST || null;

export function ImportarTemaZip({ slug }: { slug: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [temas, setTemas] = useState<TemaImportado[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<TemaImportado | null>(null);
  const [extraido, setExtraido] = useState<string | null>(null);

  useEffect(() => { void cargarTemas(); }, []);

  async function cargarTemas() {
    const res = await fetch('/api/theme/importado', { headers: await authHeader() });
    if (!res.ok) return;
    const body = (await res.json()) as { temas: TemaImportado[] };
    setTemas(body.temas);
  }

  async function subir(fichero: File) {
    setSubiendo(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('zip', fichero);
      const res = await fetch('/api/theme/importar-zip', {
        method: 'POST', headers: await authHeader(), body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'No se ha podido importar el ZIP.');
        return;
      }
      await cargarTemas();
    } catch (e) {
      setError(mensajeSeguro(e, ERROR_RED));
    } finally {
      setSubiendo(false);
    }
  }

  async function alternarPreview(id: string) {
    if (previewId === id) {
      setPreviewId(null);
      setPreviewUrl(null);
      return;
    }
    // Mismo token que ya usa `/portal-preview`: firmado, corta duración,
    // acotado al estudio — no depende de cookies (ver el comentario de
    // seguridad en la ruta de servido).
    const res = await fetch('/api/theme/home-preview-token', { method: 'POST', headers: await authHeader() });
    if (!res.ok) return;
    const { token } = (await res.json()) as { token: string };
    setPreviewId(id);
    setPreviewUrl(`/api/theme/importado/${id}?t=${encodeURIComponent(token)}`);
  }

  async function accionarPublicacion(id: string, accion: 'publicar' | 'despublicar') {
    setTrabajando(id);
    setError(null);
    try {
      const res = await fetch(`/api/theme/importado/${id}`, {
        method: 'PATCH',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'No se ha podido guardar el cambio.');
        return;
      }
      await cargarTemas();
    } catch (e) {
      setError(mensajeSeguro(e, ERROR_RED));
    } finally {
      setTrabajando(null);
    }
  }

  // «Extraer a tema nativo»: lee el color de marca declarado en el diseño e
  // instala un tema NATIVO nuevo con ese color (borrador) — el camino real a
  // lo que se pidió (edición visual, publicable como "Tu tema"), sin reabrir
  // el aislamiento de origen del ZIP. Ver el comentario de la ruta PATCH.
  //
  // ⚠️ A propósito NO navega sola al editor tras extraer (antes lo hacía, con
  // un `router.push` silencioso): eso dejaba a la propietaria en el editor
  // SIN saber que todavía le faltaba un "Publicar" más — el de esta pantalla
  // ya lo había visto y, sin previo aviso de que era otro sistema, daba por
  // hecho que ya estaba hecho. Ahora se queda aquí con la confirmación
  // explícita y el enlace directo al paso que de verdad falta.
  async function extraer(id: string, nombre: string) {
    setTrabajando(id);
    setError(null);
    setExtraido(null);
    try {
      const res = await fetch(`/api/theme/importado/${id}`, {
        method: 'PATCH',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'extraer' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'No se ha podido extraer un tema de este ZIP.');
        return;
      }
      setExtraido(nombre);
    } catch (e) {
      setError(mensajeSeguro(e, ERROR_RED));
    } finally {
      setTrabajando(null);
    }
  }

  async function borrar(id: string) {
    setTrabajando(id);
    setError(null);
    try {
      const res = await fetch(`/api/theme/importado/${id}`, { method: 'DELETE', headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'No se ha podido borrar el tema.');
        return;
      }
      if (previewId === id) { setPreviewId(null); setPreviewUrl(null); }
      await cargarTemas();
    } catch (e) {
      setError(mensajeSeguro(e, ERROR_RED));
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <p className="text-[15px] font-bold text-foreground">Importar un tema desde un fichero</p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Sube un .zip con tu diseño (HTML, CSS, imágenes y tipografías). Se importa tal cual, sin
          recrearlo con los componentes de Tentare. Para que se vea en tu portal de verdad, pulsa{' '}
          <strong>«Extraer a tema nativo»</strong> y publícalo desde el editor — el «Publicar» de
          cada tema de aquí abajo es solo una vista previa aparte.
        </p>
      </div>

      <input
        ref={inputRef} type="file" accept=".zip" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ''; }}
      />
      <Button variant="outline" disabled={subiendo} onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" />
        {subiendo ? 'Subiendo…' : 'Elegir fichero .zip'}
      </Button>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {extraido ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[13px] text-emerald-900">
          <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
          <div className="space-y-1.5">
            <p>
              «{extraido}» se ha guardado como borrador de tu tema. Todavía no se ve en tu
              portal — falta publicarlo desde el editor.
            </p>
            <Link
              href="/configuracion/apariencia/editor"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Ir al editor a publicarlo
            </Link>
          </div>
        </div>
      ) : null}

      {temas && temas.length > 0 ? (
        <div className="space-y-3 pt-1">
          {temas.map((tema) => (
            <div key={tema.id} className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-semibold text-foreground truncate">{tema.nombre}</p>
                    {tema.publicado ? (
                      <span
                        className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold px-2 py-0.5"
                        title="Visible en la vista previa aparte, no en tu portal real"
                      >
                        Vista previa activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground text-[11px] font-semibold px-2 py-0.5">
                        Sin vista previa
                      </span>
                    )}
                  </div>
                  {tema.estado === 'listo' ? (
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {tema.manifest.ficheros.length} ficheros, {tema.manifest.assets.length} imagen(es)
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {tema.estado === 'listo' ? (
                    <Link
                      href={`/configuracion/apariencia/editor-zip/${tema.id}`}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <Pencil className="size-4" />
                      Editar código
                    </Link>
                  ) : null}
                  {tema.estado === 'listo' ? (
                    <Button
                      variant="ghost" size="sm" onClick={() => void alternarPreview(tema.id)}
                    >
                      {previewId === tema.id ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      {previewId === tema.id ? 'Ocultar' : 'Ver'}
                    </Button>
                  ) : null}
                  {tema.estado === 'listo' ? (
                    <Button
                      variant="outline" size="sm" disabled={trabajando === tema.id}
                      onClick={() => void extraer(tema.id, tema.nombre)}
                      title="Crea un tema nativo nuevo con el color de marca de este diseño, editable visualmente y publicable en tu portal real"
                    >
                      <Wand2 className="size-4" />
                      Extraer a tema nativo
                    </Button>
                  ) : null}
                  {tema.estado === 'listo' && !tema.publicado ? (
                    <Button
                      variant="ghost" size="sm" disabled={trabajando === tema.id}
                      onClick={() => void accionarPublicacion(tema.id, 'publicar')}
                      title={`No publica en tu portal — solo activa la vista previa aparte de${HOST_PUBLICADO ? ` ${HOST_PUBLICADO}` : ' un dominio propio'}`}
                    >
                      Publicar vista previa
                    </Button>
                  ) : null}
                  {tema.publicado && HOST_PUBLICADO && slug ? (
                    <a
                      href={`https://${HOST_PUBLICADO}/${slug}`} target="_blank" rel="noreferrer"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      <ExternalLink className="size-4" />
                      Ver vista previa
                    </a>
                  ) : null}
                  {tema.publicado ? (
                    <Button
                      variant="ghost" size="sm" disabled={trabajando === tema.id}
                      onClick={() => void accionarPublicacion(tema.id, 'despublicar')}
                    >
                      Quitar vista previa
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost" size="sm" disabled={trabajando === tema.id}
                    onClick={() => setABorrar(tema)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {tema.estado === 'incompatible' || tema.estado === 'error' ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                  <p>{tema.detalle ?? 'No se pudo importar tal cual.'}</p>
                </div>
              ) : null}

              {tema.estado === 'listo' && previewId === tema.id && previewUrl ? (
                <div className="rounded-xl border border-border overflow-hidden" style={{ height: 480 }}>
                  {/* ⚠️ SIN `allow-same-origin`: el origen queda opaco, así que el
                      código del ZIP no puede leer cookies de este dominio ni hacer
                      fetch autenticado contra el resto de la API — ver el
                      comentario de seguridad en la ruta que sirve esto. */}
                  <iframe
                    src={previewUrl} sandbox="allow-scripts" title={`Vista previa de ${tema.nombre}`}
                    style={{ width: '100%', height: '100%', border: 0 }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {temas && temas.length === 0 && !subiendo ? (
        <p className="text-[13px] text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="size-4 opacity-0" />
          Todavía no has importado ningún tema.
        </p>
      ) : null}

      <ConfirmDialog
        open={aBorrar !== null}
        onOpenChange={(v) => { if (!v) setABorrar(null); }}
        titulo={`Borrar «${aBorrar?.nombre ?? ''}»`}
        descripcion="Se borran también todos sus ficheros (HTML, CSS, imágenes). No se puede deshacer."
        textoConfirmar="Borrar"
        destructivo
        onConfirm={() => { if (aBorrar) void borrar(aBorrar.id); setABorrar(null); }}
      />
    </Card>
  );
}
