'use client';

import { useState, useEffect } from 'react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { CampoImagen } from '@/components/ui/campo-imagen';
import {
  subirLogoEstudio, eliminarLogoEstudio,
  subirFaviconEstudio, eliminarFaviconEstudio,
} from '@/lib/portal-storage';
import { fetchThemePublicado, publicarThemeApi } from '@/lib/api-client';
import { labelCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// «Logo y favicon», en la sección Marca. Se guardan SOLOS al subirlos, sin
// ninguna barra de Guardar, y el color tiene su propia tarjeta al lado
// (tab-color-marca.tsx): nada de esta tarjeta espera a un botón. Por eso ningún
// campo de texto vive aquí (mezclar los dos modelos en una tarjeta es la trampa
// de #1971).
//
// ⚠️ Guardar el logo es un `updateStudio({ logoUrl })` y cambia `studio` de
// referencia: los formularios de al lado («Textos de tu app») no pierden lo que
// se está escribiendo porque solo se ponen al día los campos sin tocar
// (components/configuracion/formulario-estudio.tsx).

export function TabMarca({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio } = useStudio();
  const rol = useRol();
  const [subiendo, setSubiendo] = useState<'logo' | 'favicon' | null>(null);

  // El favicon NO es una columna de `studios`: vive en el tema
  // (`studio_theme.config_published.faviconUrl`). Se lee aparte porque
  // `useStudio` no lo trae. `undefined` = aún no se sabe.
  const [favicon, setFavicon] = useState<string | null | undefined>(undefined);

  // Editar la marca es de PROPIETARIO y de plan Estudio en adelante — lo exige
  // `guardarThemeAction` en el servidor. Se comprueba también aquí para no
  // ofrecer un botón que va a devolver 403: la RLS y la acción siguen siendo
  // el límite real, esto es solo no mentir en pantalla.
  const puedeEditarFavicon = rol === 'PROPIETARIO' && !!studio && tieneFeature(studio, 'marca');

  // Se enseña el PUBLICADO, que es el que lleva la pestaña de tu página de
  // reservas. Uno que se quedó en el borrador antes de este cambio no se ve
  // fuera, así que tampoco se enseña aquí como si estuviera puesto.
  useEffect(() => {
    // Sin `setState` en el cuerpo del efecto (react-hooks/set-state-in-effect):
    // cuando no se puede editar, el bloque del favicon ni se pinta, así que no
    // hay nada que poner a null — basta con no pedir el tema.
    if (!puedeEditarFavicon) return;
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (vivo) setFavicon(t.faviconUrl ?? null); })
      // Sin favicon que enseñar es mejor que una tarjeta rota: el logo no
      // depende del tema para nada.
      .catch(() => { if (vivo) setFavicon(null); });
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

  // ── Favicon: vive en el tema, y se aplica publicando SOLO ese campo ──
  // `subirFaviconEstudio` sube al path de BORRADOR (`favicon-borrador-<id>`) y
  // el servidor lo copia al publicado (`publicarCamposTheme`, lib/theme-data.ts).
  // Antes solo se guardaba en el borrador, que solo publicaba el editor del
  // portal —en mantenimiento—: el favicon no llegaba nunca a la pestaña.
  async function subirFavicon(file: File) {
    if (!studio) return { error: 'Todavía no se ha cargado el estudio.' };
    setSubiendo('favicon');
    const r = await subirFaviconEstudio(studio.id, file);
    setSubiendo(null);
    return r;
  }

  // «Aplicado» solo con la respuesta del servidor; si falla, se queda el de
  // antes y se dice por qué.
  async function guardarFavicon(url: string | null) {
    if (!studio) return;
    setSubiendo('favicon');
    try {
      const res = await publicarThemeApi({ faviconUrl: url });
      if (!res.ok) {
        showToast(res.errores[0]?.mensaje ?? 'No se ha podido aplicar el favicon.');
        return;
      }
      setFavicon(res.theme.faviconUrl ?? null);
      showToast(url ? 'Favicon aplicado' : 'Favicon quitado');
      // El archivo de borrador ya no hace falta, y solo se borra DESPUÉS de
      // publicar: si publicar fallara, el de antes seguiría intacto.
      if (url === null) await eliminarFaviconEstudio(studio.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se ha podido aplicar el favicon.');
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <TarjetaAjuste id="logo-y-favicon">
      <div>
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
                  valor={favicon ?? null}
                  onSubir={subirFavicon}
                  onCambiar={guardarFavicon}
                  ocupado={subiendo === 'favicon' || favicon === undefined}
                  ajuste="contain"
                  clasePreview="w-12 h-12"
                  textoSubir="Subir favicon"
                  textoCambiar="Cambiar favicon"
                  conEnlace={false}
                  ayuda={
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      El icono de la pestaña de tu página de reservas. Se aplica al momento. Cuadrado y pequeño: 64×64 px basta.
                    </p>
                  }
                />
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
