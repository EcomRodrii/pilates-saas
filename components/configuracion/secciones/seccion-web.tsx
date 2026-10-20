'use client';

import { useEffect, useState } from 'react';
import { EyeOff, Globe } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { resumenDireccion, resumenHerramienta, resumenPaginaPublica } from '@/lib/configuracion/resumenes';
import { hrefDeHerramienta } from '@/lib/configuracion/destino';
import type { TarjetaId } from '@/lib/configuracion/secciones';
import type { EstadoPaginaPublica } from '@/lib/configuracion/pagina-publica';
import { leerPaginaPublica } from '@/lib/pagina-publica-cliente';
import { DetalleDireccionYEnlaces, FilaDireccionYEnlaces, useOrigen } from '@/components/configuracion/tab-estudio-enlaces';
import { DetalleDescripcionWeb } from '@/components/configuracion/detalle-descripcion-web';
import { MiWebGuiada } from '@/components/configuracion/secciones/mi-web-guiada';
import { DetallePaginaPublica } from '@/components/configuracion/pagina-publica';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaInterruptor, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import { FilaHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import { useMiWebNueva } from '@/lib/estudio/panel-nuevo-cliente';

// Mi app y mi web: cómo se ve tu estudio por fuera. El logo, el color y los
// textos de tu app están en «Marca» (seccion-marca.tsx).
//
// Filas con su valor de hoy (15-sep, v2): la dirección de tu página con
// «Copiar» y su cajón, ocultar tu página (16-sep: su única pantalla estaba en el
// editor de apariencia, en mantenimiento), Tentare Network como un sí/no que se
// guarda al tocarlo (sin dinero ni nada en cadena, y vuelve atrás si falla), y
// el contenido de tu app y los widgets, que tienen su propia pantalla (#2061).
// «Cómo le va a tu página» sigue dentro de los widgets.
//
// Con MI_WEB_NUEVA, «Mi web» guiada (maqueta aprobada el 21-oct-2026, mi-web-guiada.tsx): los mismos
// cajones y la misma herramienta, presentados como cinco pasos, más «Cómo te presentas» (la
// descripción, que sale en tu página de reservas y no en la app).

const CAJONES = ['direccion-y-enlaces', 'pagina-publica', 'presentacion-web'] as const satisfies readonly TarjetaId[];

export function SeccionWeb({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, updateStudio, bannersPortal } = useStudio();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);
  // «Mi web» (MI_WEB_NUEVA): solo lo de la web, en el orden del fundador (dirección, widgets, ocultar la
  // página) y Network aparte. «Contenido de tu app» se pinta en «Mi app» (seccion-marca.tsx).
  const miWebNueva = useMiWebNueva();
  const origen = useOrigen();

  // Qué tarjetas siguen publicadas depende de la hora: se lee una vez al montar,
  // no en cada render (sería impuro).
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- La hora del reloj no se puede derivar en render; es justo lo que prohíbe la regla de pureza.
    setAhoraMs(Date.now());
  }, []);

  // La visibilidad no viaja con el estudio del panel (la clave es un hash que
  // solo toca el servidor): se pide a su ruta. Sin respuesta, la fila no dice
  // «Visible» —vuelve a su descripción— y el cajón no enseña un formulario.
  const [paginaPublica, setPaginaPublica] = useState<EstadoPaginaPublica | null>(null);
  const [cargandoPagina, setCargandoPagina] = useState(true);
  const [intentoPagina, setIntentoPagina] = useState(0);
  useEffect(() => {
    let vivo = true;
    void leerPaginaPublica().then(e => {
      if (!vivo) return;
      setPaginaPublica(e);
      setCargandoPagina(false);
    });
    return () => { vivo = false; };
  }, [intentoPagina]);

  function paginaGuardada(nuevo: EstadoPaginaPublica, texto: string) {
    setPaginaPublica(nuevo);
    cerrar();
    showToast(texto);
  }

  // Pone al estudio delante de gente que aún no lo conoce: apagado por defecto y
  // se da por bueno solo con la fila guardada (updateStudio cuenta filas).
  async function cambiarNetwork(v: boolean): Promise<string | null> {
    const res = await updateStudio({ visibleEnNetwork: v });
    if (!res.ok) return res.error;
    showToast(v ? 'Tu estudio ya aparece en Tentare Network' : 'Tu estudio ya no aparece en Tentare Network');
    return null;
  }

  const herramientas = [
    {
      id: 'contenido-de-tu-app' as const,
      valor: resumenHerramienta('contenido-de-tu-app', {
        contenido: dataLoaded && ahoraMs > 0
          ? { tarjetas: bannersPortal, ahoraMs }
          : null,
      }),
    },
    { id: 'widgets' as const, valor: resumenHerramienta('widgets', { widgetDominios: studio?.widgetDominiosAutorizados ?? null }) },
  ];

  return (
    <>
      {miWebNueva ? (
        // «Mi web» guiada (maqueta aprobada el 21-oct-2026): cinco pasos con lo que hace falta, dónde
        // lo ve quien llega y cuándo le llega el cambio. Los cajones y la herramienta son los de siempre.
        dataLoaded && studio ? (
          <MiWebGuiada
            showToast={showToast}
            datos={{
              direccion: resumenDireccion({ slug: studio.slug, origen }),
              descripcion: !!studio.descripcion?.trim(),
              pagina: paginaPublica ? { oculta: paginaPublica.oculta, tieneClave: paginaPublica.tieneClave } : null,
              network: studio.visibleEnNetwork,
            }}
            acciones={{
              direccion: { tipo: 'cajon', abrir: () => abrir('direccion-y-enlaces'), texto: studio.slug ? 'Cambiar' : 'Ponerle dirección' },
              presentacion: { tipo: 'cajon', abrir: () => abrir('presentacion-web'), texto: studio.descripcion?.trim() ? 'Cambiar' : 'Escribir' },
              widgets: { tipo: 'enlace', href: hrefDeHerramienta('widgets'), texto: 'Abrir tus widgets' },
              'quien-la-ve': { tipo: 'cajon', abrir: () => abrir('pagina-publica'), texto: 'Cambiar' },
            }}
            network={{ on: studio.visibleEnNetwork, onCambiar: cambiarNetwork }}
          />
        ) : (
          <div aria-busy className="h-64 animate-pulse rounded-2xl bg-muted" />
        )
      ) : (<>
      <GrupoFilas titulo="Tu página y tu app">
        <FilaDireccionYEnlaces onAbrir={() => abrir('direccion-y-enlaces')} showToast={showToast} />
        <FilaAjuste id="pagina-publica" icono={EyeOff} valor={resumenPaginaPublica(paginaPublica)} onAbrir={abrir} />
        <FilaInterruptor id="network" icono={Globe} on={dataLoaded && studio ? studio.visibleEnNetwork : null} onCambiar={cambiarNetwork} />
      </GrupoFilas>

      <GrupoFilas titulo="Lo que ven en tu app y en tu web">
        {herramientas.map(f => <FilaHerramienta key={f.id} {...f} />)}
      </GrupoFilas>
      </>)}

      <CajonAjuste id="direccion-y-enlaces" abierto={cajon === 'direccion-y-enlaces'} onCerrar={cerrar}>
        <DetalleDireccionYEnlaces showToast={showToast} />
      </CajonAjuste>
      <CajonAjuste
        id="pagina-publica" abierto={cajon === 'pagina-publica'} onCerrar={cerrar}
        // Decisión 6 de «Mi web» guiada: se llama por lo que pregunta.
        titulo={miWebNueva ? 'Quién ve tu página' : undefined}
      >
        <DetallePaginaPublica
          estado={paginaPublica}
          cargando={cargandoPagina}
          onReintentar={() => { setCargandoPagina(true); setIntentoPagina(n => n + 1); }}
          onGuardado={paginaGuardada}
        />
      </CajonAjuste>
      {miWebNueva && (
        <CajonAjuste id="presentacion-web" abierto={cajon === 'presentacion-web'} onCerrar={cerrar}>
          <DetalleDescripcionWeb showToast={showToast} onGuardado={t => { cerrar(); showToast(t); }} />
        </CajonAjuste>
      )}
    </>
  );
}
