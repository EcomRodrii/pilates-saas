'use client';

import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, MessageSquareQuote, Palette, Smartphone, Type } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { fetchThemeBorrador, fetchThemePublicado } from '@/lib/api-client';
import { DEFAULT_THEME, type ThemeConfig } from '@/lib/theme-schema';
import { hrefDeHerramienta, hrefDeTarjeta } from '@/lib/configuracion/destino';
import { pasosMiApp, type IdPasoMiApp } from '@/lib/configuracion/mi-app-pasos';
import { MiAppGuiada, useDatosMiApp, type AccionPaso } from '@/components/configuracion/secciones/mi-app-guiada';
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
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';
import { useMiWebNueva } from '@/lib/estudio/panel-nuevo-cliente';
import { useInterruptor } from '@/lib/estudio/interruptores-cliente';

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

function pasoHecho(d: Parameters<typeof pasosMiApp>[0], id: IdPasoMiApp): boolean {
  return pasosMiApp(d).find(p => p.id === id)?.hecho ?? false;
}

/** «Arena · Serena · #666DCC»: lo que tiene puesto, sin abrir la pantalla. */
function resumenApariencia(tema: ThemeConfig | null): string | null {
  if (!tema) return null;
  const a = resolverApariencia(tema.appAlumna);
  return `${estiloPorId(a.estilo).nombre} · ${tipografiaPorId(a.tipografia).nombre} · ${tema.primary.toUpperCase()}`;
}

export function SeccionMarca({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, bannersPortal, contenidoPortal } = useStudio();
  const rol = useRol();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);
  // «Mi app» (MI_WEB_NUEVA): primero lo de la app —cómo se ve, qué enseña y su app en la App Store—,
  // luego tu marca y tus textos. «Contenido de tu app» vive en los datos de `web` (su dirección de
  // siempre) pero se pinta aquí (lib/configuracion/mi-web-nueva.ts).
  const miWebNueva = useMiWebNueva();
  const pedirApp = useInterruptor('pedirApp', studio?.id);
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- La hora del reloj no se puede derivar en render.
    if (miWebNueva) setAhoraMs(Date.now());
  }, [miWebNueva]);

  // Editar la marca es de PROPIETARIO con suscripción activa (va en todos los
  // planes desde el 2-oct-2026) — lo exige
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

  // «Mi app» guiada: ¿hay cambios de color o estilo guardados en el borrador y sin publicar? El editor
  // de Apariencia publica sin pasar por el borrador, pero la biblioteca de temas sí lo escribe: se
  // compara lo que ven (publicado) con lo guardado. Sin poder leerlo, no se avisa de nada.
  const [sinPublicar, setSinPublicar] = useState(false);
  useEffect(() => {
    if (!miWebNueva || !tema || !soyPropietaria) return;
    let vivo = true;
    fetchThemeBorrador()
      .then(b => {
        if (!vivo) return;
        const distinto = b.primary.toLowerCase() !== tema.primary.toLowerCase()
          || b.secondary.toLowerCase() !== tema.secondary.toLowerCase()
          || JSON.stringify(b.appAlumna ?? null) !== JSON.stringify(tema.appAlumna ?? null);
        setSinPublicar(distinto);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [miWebNueva, tema, soyPropietaria]);

  const extraMiApp = useMemo(() => ({
    favicon: puedeEditarFavicon && tema ? !!tema.faviconUrl : undefined,
    apariencia: tema ? {
      resumen: resumenApariencia(tema) ?? '',
      propia: tema.primary.toLowerCase() !== DEFAULT_THEME.primary.toLowerCase() || !!tema.appAlumna,
    } : null,
    sinPublicar,
    appEnTienda: pedirApp && soyPropietaria,
  }), [puedeEditarFavicon, tema, sinPublicar, pedirApp, soyPropietaria]);
  const datosMiApp = useDatosMiApp(extraMiApp, ahoraMs);

  const cargado = dataLoaded ? studio : null;
  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  const filaApariencia = (
    <FilaExterna
      id="color-de-marca"
      icono={Palette}
      titulo={tarjetaPorId('color-de-marca').titulo}
      valor={resumenApariencia(tema)}
      descripcion={tarjetaPorId('color-de-marca').frase}
      href="/configuracion/apariencia"
    />
  );
  if (miWebNueva) {
    const apariencia = (paso: string) => `/configuracion/apariencia?paso=${paso}`;
    const acciones: Record<IdPasoMiApp, AccionPaso | null> = {
      logo: { tipo: 'cajon', abrir: () => abrir('logo-y-favicon'), texto: studio?.logoUrl ? 'Cambiar' : 'Subir' },
      estilo: { tipo: 'enlace', href: apariencia('estilo'), texto: 'Editar' },
      // La portada vive en el paso «Fotos» del editor; el titular, en «Entrada».
      entrada: { tipo: 'enlace', href: apariencia(studio?.imagenBienvenidaUrl ? 'entrada' : 'fotos'), texto: studio?.imagenBienvenidaUrl ? 'Editar' : 'Completar' },
      fotos: { tipo: 'enlace', href: apariencia('fotos'), texto: datosMiApp && !pasoHecho(datosMiApp, 'fotos') ? 'Completar' : 'Ver' },
      inicio: { tipo: 'enlace', href: hrefDeHerramienta('contenido-de-tu-app'), texto: 'Editar' },
      frase: { tipo: 'cajon', abrir: () => abrir('textos-de-bienvenida'), texto: studio?.fraseManuscrita ? 'Cambiar' : 'Escribir' },
      compartir: studio?.slug
        ? { tipo: 'enlace', href: apariencia('instalar'), texto: 'Compartir' }
        : { tipo: 'enlace', href: hrefDeTarjeta('direccion-y-enlaces'), texto: 'Ponerle dirección' },
    };
    return (
      <>
        {datosMiApp ? (
          <MiAppGuiada datos={datosMiApp} acciones={acciones} slug={studio?.slug ?? null} hrefPresentacion={hrefDeTarjeta('textos-de-tu-app')} />
        ) : (
          <div aria-busy className="h-64 animate-pulse rounded-2xl bg-muted" />
        )}

        <CajonAjuste
          id="logo-y-favicon" abierto={cajon === 'logo-y-favicon'} onCerrar={cerrar}
          titulo="Tu logo y tu icono"
          frase="Tu logo va arriba en su app y en tus correos; tu icono, en el móvil de tus alumnas y en la pestaña. Se aplican al momento."
        >
          <DetalleLogoYFavicon
            favicon={puedeEditarFavicon ? (cargandoTema ? undefined : tema?.faviconUrl ?? null) : undefined}
            puedeEditarFavicon={puedeEditarFavicon}
            soyPropietaria={soyPropietaria}
            showToast={showToast}
            onFavicon={url => setTema(t => (t ? { ...t, faviconUrl: url } : t))}
          />
          <div className="mt-6 border-t border-border pt-5">
            <DetallePresentacion showToast={showToast} onGuardado={guardado} campos="lema" />
          </div>
        </CajonAjuste>
        {/* Por enlaces de antes (`#textos-de-tu-app`): la descripción y el lema, sin normas ni año (decisión 3). */}
        <CajonAjuste id="textos-de-tu-app" abierto={cajon === 'textos-de-tu-app'} onCerrar={cerrar} frase="Tu descripción sale en tu página de reservas (Mi web); tu lema, bajo tu nombre en la app.">
          <DetallePresentacion showToast={showToast} onGuardado={guardado} campos="descripcion-y-lema" />
        </CajonAjuste>
        <CajonAjuste
          id="textos-de-bienvenida" abierto={cajon === 'textos-de-bienvenida'} onCerrar={cerrar}
          titulo="Tu frase, a mano"
          frase="Una frase tuya, con letra manuscrita, al final del inicio de su app. Vacía, no sale nada."
        >
          <DetalleTextosBienvenida showToast={showToast} onGuardado={guardado} soloFraseAMano />
        </CajonAjuste>
      </>
    );
  }

  return (
    <>
      {miWebNueva ? (
        <GrupoFilas titulo="Cómo es tu app">
          {filaApariencia}
          <FilaHerramienta
            id="contenido-de-tu-app"
            // Con el interruptor su app enseña el mensaje destacado, así que la fila también lo cuenta.
            valor={resumenHerramienta('contenido-de-tu-app', {
              contenido: dataLoaded && ahoraMs > 0 ? { tarjetas: bannersPortal, ahoraMs, mensaje: contenidoPortal?.mensajeDestacado } : null,
            })}
          />
          {pedirApp && soyPropietaria && (
            <FilaExterna
              id="app-en-la-tienda"
              icono={Smartphone}
              titulo="Tu app en la App Store"
              valor={null}
              descripcion="Tu app con tu nombre y tu icono en la App Store: pídela y mira en qué punto está."
              href="/configuracion/apariencia?paso=instalar"
            />
          )}
        </GrupoFilas>
      ) : null}
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
        {!miWebNueva && filaApariencia}
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
