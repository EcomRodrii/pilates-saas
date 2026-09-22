'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, MessageSquareQuote, Palette, Type } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { fetchThemePublicado } from '@/lib/api-client';
import type { ThemeConfig } from '@/lib/theme-schema';
import {
  resumenLogoYFavicon, resumenPresentacion, resumenTextosBienvenida,
} from '@/lib/configuracion/resumenes';
import { estiloPorId, resolverApariencia, tipografiaPorId } from '@/lib/student/apariencia';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import type { TarjetaId } from '@/lib/configuracion/secciones';
import { DetalleLogoYFavicon } from '@/components/configuracion/tab-marca';
import { DetallePresentacion, DetalleTextosBienvenida } from '@/components/configuracion/tab-textos-app';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaExterna, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';

// Marca: cómo te reconocen tus alumnas. El logo estaba en «Mi app y mi web» y el
// color en otra pantalla (/configuracion/apariencia/panel); ahora van juntos.
//
// Filas con su valor de hoy (16-sep, v2). Aquí convivían TRES formas de guardar
// —el logo al soltar la imagen, «Guardar colores» en línea y una barra de
// sección abajo—, que es la queja del fundador. Ahora cada fila declara la suya
// con su forma: el color y los dos bloques de texto se cambian en su cajón y se
// guardan con «Guardar»; el logo y el favicon siguen guardándose al elegir el
// archivo porque el archivo ya se ha subido a ese instante y ningún «Descartar»
// lo devolvería (ver tab-marca.tsx), y su cajón lo dice con la pastilla «Se
// guarda al momento».
//
// 22-sep-2026: el color y la FOTO de la portada salen de aquí a «Apariencia de
// tu app» (/configuracion/apariencia), que los enseña en un móvil con la app de
// verdad junto al estilo y la tipografía. La fila lleva allí y dice qué hay puesto.
//
// El tema PUBLICADO se lee UNA vez para toda la sección: lo comparten la fila del
// favicon y la de la apariencia, que antes lo pedían cada una por su cuenta.

const CAJONES = ['logo-y-favicon', 'textos-de-tu-app', 'textos-de-bienvenida'] as const satisfies readonly TarjetaId[];

/** «Arena · Serena · #666DCC»: lo que tiene puesto, sin abrir la pantalla. */
function resumenApariencia(tema: ThemeConfig | null): string | null {
  if (!tema) return null;
  const a = resolverApariencia(tema.appAlumna);
  return `${estiloPorId(a.estilo).nombre} · ${tipografiaPorId(a.tipografia).nombre} · ${tema.primary.toUpperCase()}`;
}

export function SeccionMarca({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded } = useStudio();
  const rol = useRol();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);

  // Editar la marca es de PROPIETARIO y de plan Estudio en adelante — lo exige
  // `guardarThemeAction` en el servidor. Se comprueba también aquí para no
  // ofrecer un botón que va a devolver 403: la RLS y la acción siguen siendo
  // el límite real, esto es solo no mentir en pantalla.
  const soyPropietaria = rol === 'PROPIETARIO';
  const puedeEditarFavicon = soyPropietaria && !!studio && tieneFeature(studio, 'marca');

  // El favicon y el color viven en el tema (`studio_theme.config_published`), que
  // no viaja con el panel. Se enseña el PUBLICADO, que es el que ven de verdad
  // tus alumnas: uno que se quedara en el borrador no se ve fuera y aquí tampoco
  // se cuenta como puesto.
  const [tema, setTema] = useState<ThemeConfig | null>(null);
  const [cargandoTema, setCargandoTema] = useState(true);
  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (vivo) setTema(t); })
      // Sin tema que enseñar, las dos filas vuelven a su descripción y el cajón
      // del color ofrece reintentarlo: el logo no depende del tema para nada.
      .catch(() => {})
      .finally(() => { if (vivo) setCargandoTema(false); });
    return () => { vivo = false; };
  }, []);

  const cargado = dataLoaded ? studio : null;
  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  return (
    <>
      <GrupoFilas titulo="Tu marca">
        <FilaAjuste
          id="logo-y-favicon"
          icono={ImageIcon}
          valor={resumenLogoYFavicon({
            logo: cargado ? cargado.logoUrl : undefined,
            // Sin permiso para tocarlo no se cuenta: «sin favicon» sería
            // señalar algo que esta persona no puede arreglar.
            favicon: puedeEditarFavicon && tema ? tema.faviconUrl ?? null : undefined,
          })}
          onAbrir={abrir}
        />
        <FilaExterna
          id="color-de-marca"
          icono={Palette}
          titulo={tarjetaPorId('color-de-marca').titulo}
          valor={resumenApariencia(tema)}
          descripcion={tarjetaPorId('color-de-marca').frase}
          href="/configuracion/apariencia"
        />
      </GrupoFilas>

      <GrupoFilas titulo="Lo que leen tus alumnas">
        <FilaAjuste id="textos-de-tu-app" icono={Type} valor={resumenPresentacion(cargado ?? {})} onAbrir={abrir} />
        <FilaAjuste id="textos-de-bienvenida" icono={MessageSquareQuote} valor={resumenTextosBienvenida(cargado ?? {})} onAbrir={abrir} />
      </GrupoFilas>

      <CajonAjuste id="logo-y-favicon" abierto={cajon === 'logo-y-favicon'} onCerrar={cerrar}>
        <DetalleLogoYFavicon
          favicon={puedeEditarFavicon ? (cargandoTema ? undefined : tema?.faviconUrl ?? null) : undefined}
          puedeEditarFavicon={puedeEditarFavicon}
          soyPropietaria={soyPropietaria}
          showToast={showToast}
          onFavicon={url => setTema(t => (t ? { ...t, faviconUrl: url } : t))}
        />
      </CajonAjuste>
      <CajonAjuste id="textos-de-tu-app" abierto={cajon === 'textos-de-tu-app'} onCerrar={cerrar}>
        <DetallePresentacion showToast={showToast} onGuardado={guardado} />
      </CajonAjuste>
      <CajonAjuste id="textos-de-bienvenida" abierto={cajon === 'textos-de-bienvenida'} onCerrar={cerrar}>
        <DetalleTextosBienvenida showToast={showToast} onGuardado={guardado} />
      </CajonAjuste>
    </>
  );
}
