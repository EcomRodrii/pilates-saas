'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Palette, ChevronRight } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { CampoImagen } from '@/components/ui/campo-imagen';
import {
  subirLogoEstudio, eliminarLogoEstudio,
  subirFaviconEstudio, eliminarFaviconEstudio,
} from '@/lib/portal-storage';
import { fetchThemeBorrador, fetchThemePublicado, guardarThemeBorrador } from '@/lib/api-client';
import { labelCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// «Marca», en Mi app y mi web. Logo y favicon se guardan SOLOS al subirlos, sin
// ninguna barra de Guardar, y el color se cambia en Apariencia: nada de esta
// tarjeta espera a un botón. Por eso ningún campo de texto vive aquí (mezclar
// los dos modelos en una tarjeta es la trampa de #1971).
//
// ⚠️ Guardar el logo es un `updateStudio({ logoUrl })` y cambia `studio` de
// referencia: los formularios de al lado («Textos de tu app») no pierden lo que
// se está escribiendo porque solo se ponen al día los campos sin tocar
// (components/configuracion/formulario-estudio.tsx).

export function TabMarca({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio } = useStudio();
  const rol = useRol();
  const [subiendo, setSubiendo] = useState<'logo' | 'favicon' | null>(null);

  // El favicon NO es una columna de `studios`: vive dentro del tema
  // (`studio_theme.config_draft.faviconUrl`) y solo se aplica al publicar. Se
  // lee aparte porque `useStudio` no lo trae.
  const [faviconBorrador, setFaviconBorrador] = useState<string | null | undefined>(undefined);
  const [faviconPendiente, setFaviconPendiente] = useState(false);

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
      // Sin favicon que enseñar es mejor que una tarjeta rota: el logo no
      // depende del tema para nada.
      .catch(() => { if (vivo) setFaviconBorrador(null); });
    return () => { vivo = false; };
  }, [puedeEditarFavicon]);

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
    <TarjetaAjuste id="marca">
      <div className="space-y-5">
        <Link
          href="/configuracion/apariencia/panel"
          className="flex items-center justify-between rounded-xl border border-border px-3.5 py-3 transition-colors hover:bg-muted"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
              <Palette size={15} className="shrink-0 text-muted-foreground" />
              El color de tu marca
            </span>
            {/* Prometía «tipografía y portada», que están en mantenimiento
                (Apariencia, 7-sep). El color sí: es el que ve el portal. */}
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
              Lo ven tus alumnas en tu página de reservas y en su app. Lo pruebas antes de guardarlo.
            </span>
          </span>
          <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
        </Link>

        <div className="grid grid-cols-1 gap-5 @md/config:grid-cols-2">
          <div className="space-y-1.5">
            <h4 className={labelCls}>Logo</h4>
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
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Sale en la app de tus alumnas y en el icono de sus notificaciones.
                  Recomendado: 512×512 px, cuadrado y sin márgenes de sobra.
                </p>
              }
            />
          </div>

          <div className="space-y-1.5">
            <h4 className={labelCls}>Favicon</h4>
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
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
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
      </div>
    </TarjetaAjuste>
  );
}
