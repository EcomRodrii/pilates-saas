'use client';

import { useState, useCallback, useEffect, useId } from 'react';
import Link from 'next/link';
import { Palette, ChevronRight, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { nifValido } from '@/lib/nif';
import { CANALES, hrefCanal } from '@/lib/canales-estudio';
import { CampoImagen } from '@/components/ui/campo-imagen';
import {
  subirLogoEstudio, eliminarLogoEstudio,
  subirFaviconEstudio, eliminarFaviconEstudio,
} from '@/lib/portal-storage';
import { fetchThemeBorrador, fetchThemePublicado, guardarThemeBorrador } from '@/lib/api-client';
import type { Studio } from '@/lib/types';
import { inputCls, labelCls, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

// Quién es el estudio (identidad + fiscal) + los dos ajustes de una sola
// línea (IVA, recargar datos) que no merecen sub-pestaña propia. Todo lo
// demás de la antigua "Estudio" (sedes, política de reservas, SEPA, enlaces,
// legal) vive ahora en su propia sub-pestaña — ver tab-estudio.tsx.
//
// ─── Cómo está agrupado, y por qué ───────────────────────────────────────────
//
// Antes había UNA tarjeta, "Información del estudio", con trece campos en una
// rejilla: el nombre comercial, el NIF, la dirección, el texto con el que el
// estudio se presenta al público y sus normas internas, todos con el mismo
// peso. Son cuatro trabajos distintos y encima con audiencias distintas —el
// NIF lo lee Hacienda, las normas las leen las alumnas— así que buscar dónde
// se cambia algo era leer la rejilla entera.
//
// Ahora una tarjeta por AUDIENCIA, que es lo que de verdad separa estos
// campos: tu marca · a dónde te escriben · lo que leen tus alumnas · lo que
// va en las facturas. Y "Facturación e impuestos" desaparece como tarjeta
// suelta: el IVA es un dato fiscal más y vive junto al NIF y la razón social,
// no en un bloque aparte al final.
//
// ⚠️ Un solo GUARDAR para todos los campos de texto, en una barra que solo
// aparece cuando hay algo sin guardar. Con cuatro tarjetas, cuatro botones
// "Guardar" habrían sido peor que el problema que se venía a resolver: cuatro
// oportunidades de escribir en una tarjeta, guardar en otra y perder lo
// escrito. Logo, favicon e IVA quedan FUERA de esa barra a propósito — se
// guardan solos en cuanto se tocan, y mezclarlos obligaría a pulsar Guardar
// después de subir una imagen que ya está subida.

type StudioForm = {
  nombre: string; razonSocial: string; nif: string;
  direccion: string; ciudad: string; codigoPostal: string;
  telefono: string; email: string; sitioWeb: string;
  descripcion: string; anioFundacion: string; normasTexto: string;
};

function studioToForm(s: Studio | null): StudioForm {
  return {
    nombre: s?.nombre ?? '',
    razonSocial: s?.razonSocial ?? '',
    nif: s?.nif ?? '',
    direccion: s?.direccion ?? '',
    ciudad: s?.ciudad ?? '',
    codigoPostal: s?.codigoPostal ?? '',
    telefono: s?.telefono ?? '',
    email: s?.email ?? '',
    sitioWeb: s?.sitioWeb ?? '',
    descripcion: s?.descripcion ?? '',
    anioFundacion: s?.anioFundacion ? String(s.anioFundacion) : '',
    normasTexto: s?.normasTexto ?? '',
  };
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Tarjeta({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground">{titulo}</h3>
      {ayuda && <p className="mt-1 mb-4 text-[12px] leading-relaxed text-muted-foreground">{ayuda}</p>}
      <div className={ayuda ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}

/**
 * Campo de texto con etiqueta ASOCIADA de verdad.
 *
 * Antes solo "Web" tenía `<label htmlFor>`; los otros doce usaban un `<p>`, o
 * sea que un lector de pantalla anunciaba "cuadro de edición" a secas doce
 * veces seguidas. El comentario de entonces decía que arreglarlos era una
 * pasada aparte — al rehacer la pantalla entera, esa pasada es esta.
 */
function Campo({
  label,
  ayuda,
  error,
  className,
  children,
}: {
  label: string;
  ayuda?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label className={labelCls} htmlFor={id}>{label}</label>
      {children(id)}
      {error
        ? <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">{error}</p>
        : ayuda && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

// ─── La pantalla ─────────────────────────────────────────────────────────────

export function TabEstudioGeneral({ showToast }: { showToast: (m: string) => void }) {
  const { resetDatosPilates, studio, updateStudio } = useStudio();
  const rol = useRol();
  const [form, setForm] = useState<StudioForm>(() => studioToForm(studio));
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<'logo' | 'favicon' | null>(null);

  // El favicon NO es una columna de `studios`: vive dentro del tema
  // (`studio_theme.config_draft.faviconUrl`) y solo se aplica al publicar. Se
  // lee aparte porque `useStudio` no lo trae.
  const [faviconBorrador, setFaviconBorrador] = useState<string | null | undefined>(undefined);
  const [faviconPendiente, setFaviconPendiente] = useState(false);

  const nifInvalido = form.nif.trim() !== '' && !nifValido(form.nif);
  // Aviso, no bloqueo: se guarda igual (mismo criterio que el resto de
  // canales). Solo evita el silencio de guardar algo que después no se pinta.
  const webNoResuelve = form.sitioWeb.trim() !== '' && !hrefCanal('web', form.sitioWeb);
  const anioInvalido = form.anioFundacion.trim() !== '' && !/^\d{4}$/.test(form.anioFundacion.trim());

  // Editar la marca es de PROPIETARIO y de plan Estudio en adelante — lo exige
  // `guardarThemeAction` en el servidor. Se comprueba también aquí para no
  // ofrecer un botón que va a devolver 403: la RLS y la acción siguen siendo
  // el límite real, esto es solo no mentir en pantalla.
  const puedeEditarFavicon = rol === 'PROPIETARIO' && !!studio && tieneFeature(studio, 'marca');

  // Se leen los DOS —borrador y publicado— y no solo el borrador: si la
  // propietaria subió un favicon otro día y nunca publicó, al volver aquí
  // vería su imagen puesta y daría por hecho que está en su pestaña. El aviso
  // de "pendiente" tiene que salir de comparar, no de haberlo subido en esta
  // misma sesión.
  useEffect(() => {
    // Sin `setState` en el cuerpo del efecto (react-hooks/set-state-in-effect):
    // cuando no se puede editar, el bloque del favicon ni se pinta, así que no
    // hay nada que poner a null — basta con no pedir el tema.
    if (!puedeEditarFavicon) return;
    let vivo = true;
    Promise.all([fetchThemeBorrador(), fetchThemePublicado()])
      .then(([borrador, publicado]) => {
        if (!vivo) return;
        setFaviconBorrador(borrador.faviconUrl ?? null);
        setFaviconPendiente((borrador.faviconUrl ?? null) !== (publicado.faviconUrl ?? null));
      })
      // Sin favicon que enseñar es mejor que una pantalla rota: el resto de
      // esta pestaña no depende del tema para nada.
      .catch(() => { if (vivo) setFaviconBorrador(null); });
    return () => { vivo = false; };
  }, [puedeEditarFavicon]);

  // Reajusta el formulario cuando `studio` cambia de referencia (llega de la
  // BD, o se cambia de sede) — ajuste de estado durante el render, no un
  // efecto: así no hay un primer pintado con el valor viejo.
  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    setForm(studioToForm(studio));
  }

  const guardado = studioToForm(studio);
  const hayCambios = (Object.keys(form) as (keyof StudioForm)[]).some(k => form[k] !== guardado[k]);

  const handleReset = useCallback(() => {
    resetDatosPilates();
    showToast('Datos recargados');
  }, [resetDatosPilates, showToast]);

  async function guardarEstudio() {
    if (nifInvalido) { showToast('El NIF/CIF no es válido: revisa la letra o el dígito de control.'); return; }
    if (anioInvalido) { showToast('El año de apertura tiene que ser de cuatro cifras.'); return; }
    const { anioFundacion, descripcion, normasTexto, sitioWeb, ...resto } = form;
    setGuardando(true);
    const res = await updateStudio({
      ...resto,
      // Igual que `normasTexto`: en blanco se guarda como NULL, no como cadena
      // vacía — «no la ha puesto» y «la ha puesto vacía» tienen que ser lo
      // mismo para quien decide si pintar el enlace.
      sitioWeb: sitioWeb.trim() || null,
      descripcion: descripcion.trim() || null,
      anioFundacion: anioFundacion.trim() ? Number(anioFundacion.trim()) : null,
      // Vacío se guarda como NULL, no como cadena vacía: el portal distingue
      // «no las ha escrito» (no pinta la sección) de «las ha escrito y están
      // en blanco», que no significaría nada.
      normasTexto: normasTexto.trim() || null,
    });
    setGuardando(false);
    showToast(res.ok ? 'Datos del estudio guardados' : res.error);
  }

  async function guardarIva(tipo: number) {
    const res = await updateStudio({ ivaPorDefecto: tipo });
    showToast(res.ok ? `IVA general fijado en ${tipo}%` : res.error);
  }

  // ── Logo: columna de `studios`, se guarda al momento ──
  // Sube y guarda van separados porque `CampoImagen` ofrece dos vías —archivo
  // o enlace pegado— y solo la primera pasa por Storage. Las primitivas son
  // las MISMAS que usa Apariencia (lib/portal-storage.ts): aquí no se
  // reimplementa la subida, que fue justo el bug que hizo quitar este campo de
  // esta pantalla en su día —dos subidas distintas escribiendo el mismo
  // `studio.logoUrl`— y por eso lo que se comparte es la primitiva, no un
  // copia-pega.
  async function subirLogo(file: File) {
    if (!studio) return { error: 'Todavía no se ha cargado el estudio.' };
    setSubiendo('logo');
    const r = await subirLogoEstudio(studio.id, file);
    setSubiendo(null);
    return r;
  }

  async function guardarLogo(url: string | null) {
    if (!studio) return;
    // Quitar el logo borra TAMBIÉN el archivo del bucket. Si lo que había era
    // un enlace pegado, `eliminarLogoEstudio` no encuentra nada y no pasa nada.
    if (url === null) {
      setSubiendo('logo');
      await eliminarLogoEstudio(studio.id);
      setSubiendo(null);
    }
    const res = await updateStudio({ logoUrl: url });
    showToast(res.ok ? (url ? 'Logo actualizado' : 'Logo quitado') : res.error);
  }

  // ── Favicon: vive en el tema, y se aplica al PUBLICAR ──
  // `subirFaviconEstudio` escribe en el path de BORRADOR
  // (`favicon-borrador-<studioId>`) a propósito: sin eso, cambiarlo aquí ya lo
  // cambiaría en producción saltándose "Publicar" (hallazgo I-6). Por eso esta
  // pantalla no puede prometer que el cambio es inmediato, y no lo promete.
  async function subirFavicon(file: File) {
    if (!studio) return { error: 'Todavía no se ha cargado el estudio.' };
    setSubiendo('favicon');
    const r = await subirFaviconEstudio(studio.id, file);
    setSubiendo(null);
    return r;
  }

  async function guardarFavicon(url: string | null) {
    if (!studio) return;
    if (url === null) {
      setSubiendo('favicon');
      await eliminarFaviconEstudio(studio.id);
      setSubiendo(null);
    }
    try {
      await guardarThemeBorrador({ faviconUrl: url });
      setFaviconBorrador(url);
      setFaviconPendiente(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se ha podido guardar el favicon.');
    }
  }

  return (
    <div className="max-w-2xl space-y-5 pb-24">
      {/* ─── Tu marca ─── */}
      <Tarjeta
        titulo="Tu marca"
        ayuda="El nombre y las imágenes con las que te reconocen tus alumnas: en su app, en tu página de reservas y en el icono de las notificaciones que les llegan."
      >
        <div className="space-y-5">
          <Campo label="Nombre del estudio" ayuda="El nombre comercial, el que usa todo el mundo. La razón social va en los datos fiscales.">
            {id => (
              <input id={id} className={inputCls} value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            )}
          </Campo>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className={labelCls}>Logo</p>
              {/* Sin `respaldo`: el logo es la marca del estudio y no tiene
                  imagen por defecto que valga — una genérica sería la marca de
                  otro. Sin logo, la miniatura dice «Sin imagen», que aquí es
                  la verdad. */}
              <CampoImagen
                etiqueta="logo"
                valor={studio?.logoUrl}
                onSubir={subirLogo}
                onCambiar={guardarLogo}
                ocupado={subiendo === 'logo'}
                ajuste="contain"
                clasePreview="w-12 h-12"
                textoSubir="Subir logo"
                textoCambiar="Cambiar logo"
                ayuda={
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Sale en la app de tus alumnas y en el icono de sus notificaciones.
                    Recomendado: 512×512 px, cuadrado y sin márgenes de sobra.
                  </p>
                }
              />
            </div>

            <div className="space-y-1.5">
              <p className={labelCls}>Favicon</p>
              {puedeEditarFavicon ? (
                <>
                  {/* Tampoco lleva `respaldo`, por el mismo motivo que el logo:
                      sin favicon la pestaña enseña el de Tentare, y poner ahí
                      una imagen genérica de Pilates sería peor, no mejor. */}
                  <CampoImagen
                    etiqueta="favicon"
                    valor={faviconBorrador ?? null}
                    onSubir={subirFavicon}
                    onCambiar={guardarFavicon}
                    ocupado={subiendo === 'favicon' || faviconBorrador === undefined}
                    ajuste="contain"
                    clasePreview="w-12 h-12"
                    textoSubir="Subir favicon"
                    textoCambiar="Cambiar favicon"
                    ayuda={
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        El icono de la pestaña del navegador. Cuadrado y pequeño: 64×64 px basta.
                      </p>
                    }
                  />
                  {/* Decirlo o no decirlo no cambia el comportamiento, pero sí
                      cambia si la propietaria se entera: el favicon se guarda
                      en el borrador del tema y no se ve fuera hasta publicar. */}
                  {faviconPendiente && (
                    <p className="rounded-lg bg-warning/10 px-3 py-2 text-[11.5px] leading-relaxed text-warning-foreground">
                      Guardado, pero todavía no se ve fuera: el favicon se aplica al{' '}
                      <Link href="/configuracion/apariencia" className="font-semibold underline">
                        publicar en Apariencia
                      </Link>.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {rol === 'PROPIETARIO'
                    ? 'El favicon forma parte de la app con tu marca, incluida a partir del plan Estudio.'
                    : 'Solo la propietaria puede cambiar el favicon.'}
                </p>
              )}
            </div>
          </div>

          <Link
            href="/configuracion/apariencia"
            className="flex items-center justify-between rounded-xl border border-border px-3.5 py-3 transition-colors hover:bg-muted"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
                <Palette size={15} className="shrink-0 text-muted-foreground" />
                Colores, tipografía y portada
              </span>
              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                Se editan en Apariencia, donde puedes verlos aplicados antes de publicar.
              </span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
          </Link>
        </div>
      </Tarjeta>

      {/* ─── Contacto ─── */}
      <Tarjeta
        titulo="Contacto y dirección"
        ayuda="Por dónde te encuentran y te escriben. Sale en tu página de reservas y en el pie de tus correos."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Campo label="Teléfono">
            {id => (
              <input id={id} className={inputCls} type="tel" value={form.telefono}
                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            )}
          </Campo>
          <Campo label="Email de contacto">
            {id => (
              <input id={id} className={inputCls} type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            )}
          </Campo>
          {/* La web va aquí y no en «Marca y colores» junto a las redes: no es
              una red social, es un dato de contacto —hermano del teléfono y el
              email— y la usan sitios que no cargan el tema, empezando por el
              pie de tus correos. Ver lib/canales-estudio.ts. */}
          <Campo
            label="Web"
            className="sm:col-span-2"
            ayuda={webNoResuelve
              ? 'No parece una dirección web: no se verá en tu página ni en tus correos.'
              : undefined}
          >
            {id => (
              <input
                id={id}
                className={inputCls}
                value={form.sitioWeb}
                placeholder={CANALES.web.placeholder}
                onChange={e => setForm(f => ({ ...f, sitioWeb: e.target.value }))}
              />
            )}
          </Campo>
          <Campo label="Dirección" className="sm:col-span-2">
            {id => (
              <input id={id} className={inputCls} value={form.direccion}
                onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
            )}
          </Campo>
          <Campo label="Ciudad">
            {id => (
              <input id={id} className={inputCls} value={form.ciudad}
                onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
            )}
          </Campo>
          <Campo label="Código postal">
            {id => (
              <input id={id} className={inputCls} inputMode="numeric" value={form.codigoPostal}
                onChange={e => setForm(f => ({ ...f, codigoPostal: e.target.value }))} />
            )}
          </Campo>
        </div>
      </Tarjeta>

      {/* ─── Copy público ─── */}
      <Tarjeta
        titulo="Lo que leen tus alumnas"
        ayuda="Textos tuyos, no ajustes. Cada uno tiene su sitio, y si lo dejas vacío ese bloque no se pinta."
      >
        <div className="space-y-5">
          <Campo
            label="Cómo te presentas"
            ayuda="Sale en tu página de reservas, debajo del nombre del estudio."
          >
            {id => (
              <textarea
                id={id}
                className={cn(inputCls, 'min-h-[76px] resize-y')}
                value={form.descripcion}
                maxLength={400}
                placeholder="Estudio boutique especializado en pilates reformer. Grupos de ocho para que nadie pase desapercibida."
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              />
            )}
          </Campo>
          <Campo
            label="Normas del centro"
            ayuda="Una norma por línea. Las ven tus alumnas en la app, en «Mi centro»."
          >
            {id => (
              <textarea
                id={id}
                className={cn(inputCls, 'min-h-[96px] resize-y')}
                value={form.normasTexto}
                maxLength={800}
                placeholder={'Llega 5 minutos antes: las clases empiezan puntuales.\nCalcetines antideslizantes obligatorios en todas las salas.\nCancela con 6 h de antelación para recuperar tu clase.'}
                onChange={e => setForm(f => ({ ...f, normasTexto: e.target.value }))}
              />
            )}
          </Campo>
          <Campo
            label="Año de apertura"
            ayuda={anioInvalido ? undefined : 'Para el «desde 2016» de tu página. Déjalo vacío si prefieres no decirlo.'}
            error={anioInvalido ? 'Tienen que ser cuatro cifras.' : null}
          >
            {id => (
              <input
                id={id}
                className={cn(inputCls, 'w-32', anioInvalido && 'border-destructive')}
                value={form.anioFundacion}
                inputMode="numeric"
                maxLength={4}
                placeholder="2016"
                aria-invalid={anioInvalido}
                onChange={e => setForm(f => ({ ...f, anioFundacion: e.target.value.replace(/\D/g, '') }))}
              />
            )}
          </Campo>
        </div>
      </Tarjeta>

      {/* ─── Fiscal ─── */}
      <Tarjeta
        titulo="Datos fiscales"
        ayuda={<>Lo que sale impreso en tus facturas. Los precios se tratan como <span className="font-medium text-foreground">IVA incluido</span>: el tipo solo cambia el desglose base/cuota, nunca el total que cobras.</>}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Campo label="Razón social" ayuda="El nombre legal, si no coincide con el comercial.">
            {id => (
              <input id={id} className={inputCls} value={form.razonSocial}
                onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))} />
            )}
          </Campo>
          <Campo
            label="NIF / CIF"
            error={nifInvalido ? 'Revisa el NIF/CIF: la letra o el dígito de control no cuadran.' : null}
          >
            {id => (
              <input
                id={id}
                className={cn(inputCls, nifInvalido && 'border-destructive')}
                value={form.nif}
                aria-invalid={nifInvalido}
                onChange={e => setForm(f => ({ ...f, nif: e.target.value }))}
              />
            )}
          </Campo>
          {/* El IVA se guarda solo al elegirlo, así que va fuera de la barra de
              Guardar de abajo — y por eso se dice aquí, para que no parezca que
              se ha quedado sin guardar. */}
          <Campo
            label="IVA general"
            className="sm:col-span-2"
            ayuda="Se guarda al elegirlo y se aplica a las próximas facturas. Las ya emitidas y selladas (Veri*Factu) no cambian."
          >
            {id => (
              <select
                id={id}
                className={cn(inputCls, 'max-w-xs cursor-pointer')}
                value={studio?.ivaPorDefecto ?? 21}
                onChange={e => guardarIva(Number(e.target.value))}
              >
                <option value={21}>21 % — General</option>
                <option value={10}>10 % — Reducido</option>
                <option value={4}>4 % — Superreducido</option>
                <option value={0}>0 % — Exento</option>
              </select>
            )}
          </Campo>
        </div>
      </Tarjeta>

      {/* Recargar datos: NO borra nada, solo vuelve a leer del servidor. Antes se
          llamaba "Restablecer datos de demo" y avisaba de una pérdida irreversible
          que nunca ocurría — el pánico lo causaba el texto, no la acción. */}
      <Tarjeta
        titulo="Recargar datos"
        ayuda="Vuelve a leer socias, sesiones y pagos desde el servidor. No borra ni cambia nada."
      >
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Sincronizar con el servidor</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Útil si algo no se ha actualizado en pantalla.</p>
          </div>
          <button onClick={handleReset} className={cn(btnSecondary, 'ml-4 flex shrink-0 items-center gap-1.5')}>
            <RotateCcw size={12} />
            Recargar
          </button>
        </div>
      </Tarjeta>

      {/* ─── Barra de guardado ───
          Solo aparece con cambios sin guardar. `sticky bottom-0` y no `fixed`:
          se queda dentro de la columna del panel, sin taparle nada al sidebar
          ni pelearse con la barra inferior del móvil. */}
      {hayCambios && (
        <div className="sticky bottom-0 -mx-1 px-1 pb-1">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
            <p className="min-w-0 text-[12.5px] text-muted-foreground">
              Tienes cambios sin guardar.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setForm(studioToForm(studio))}
                disabled={guardando}
                className={cn(btnSecondary, 'text-[12px]')}
              >
                Descartar
              </button>
              <button
                onClick={guardarEstudio}
                disabled={guardando}
                className="rounded-lg bg-brand px-4 py-2 text-[12px] font-medium text-brand-foreground transition-colors hover:brightness-95 disabled:opacity-40"
              >
                {guardando ? 'Guardando…' : 'Guardar datos del estudio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
