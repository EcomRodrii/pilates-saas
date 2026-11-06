'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio»: la tarjeta compacta «Configuración inicial» al pie del menú lateral.
//
// Enseña SOLO lo siguiente que falta («Paso 2 de 5») con un botón que lo hace, y
// «Omitir» para pasar a la siguiente. No es una lista nueva ni cuenta nada por su
// cuenta: lee lo mismo que la tarjeta del Resumen y la píldora de la barra
// (`usePonEnMarcha` para el alta nueva, `primerosPasos` para el resto), así que
// las tres dicen siempre lo mismo y se marcan solas con los datos del estudio.
//
//   · Menú normal o grande: la tarjeta compacta (altura fija). Si la pantalla es baja
//     (< 900 px) se recoge en una fila, para no empujar «Configuración» bajo el
//     pliegue del menú (OPEN DECISION 18 de nav-config).
//   · Menú pequeño: solo un anillo de progreso, con el paso en su título.
//   · No sale con la visita guiada en marcha, ni con la lista oculta o terminada.
//
// ⚠️ Vive dentro de la píldora oscura del menú, que es SIEMPRE oscura (también en
// modo claro): nada de tokens que se inviertan en oscuro. Los colores van en
// blanco con alfa, como el resto del menú. Sin imágenes ni degradados.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useStudio } from '@/lib/studio-context';
import { useTour } from '@/lib/tour-context';
import { usePermisos } from '@/lib/permisos';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { calcularOnboarding, datosOnboardingDelEstudio } from '@/lib/onboarding';
import { primerosPasos } from '@/lib/guia/primeros-pasos';
import { avisoAlCompartir } from '@/lib/alta/estado';
import { TarjetaVista, type Vista } from './tarjeta-pasos-menu-vista';
import { omitirTarea, useAltaNuevaPropia, useOmitidas, usePonEnMarcha } from './use-pon-en-marcha';

// El diálogo de compartir trae el cartel del QR: solo cuando se abre.
const CompartirEnlace = dynamic(() => import('./compartir-enlace').then(m => m.CompartirEnlace), { ssr: false });

export function TarjetaPasosMenu({ colapsado }: { colapsado: boolean }) {
  const alta = useAltaNuevaPropia();
  // Mientras se pregunta si el estudio va con el alta nueva, ninguna (como la píldora).
  if (alta.activo === null) return null;
  return alta.activo ? <TarjetaAlta colapsado={colapsado} /> : <TarjetaDeSiempre colapsado={colapsado} />;
}

function TarjetaAlta({ colapsado }: { colapsado: boolean }) {
  const { studio } = useStudio();
  const { pasos, ocultada, omitir, estado } = usePonEnMarcha();
  const { activo: visitaEnMarcha } = useTour();
  const [compartir, setCompartir] = useState(false);

  if (visitaEnMarcha || !studio || !pasos || ocultada || pasos.terminada || !pasos.ahora) return null;
  const t = pasos.ahora;
  const vista: Vista = {
    paso: pasos.hechas + 1, total: pasos.total, id: t.id, titulo: t.titulo, para: t.para, minutos: t.minutos,
    accion: t.accion, puedeOmitir: !!t.accion,
  };
  return (
    <>
      <TarjetaVista vista={vista} colapsado={colapsado} onOmitir={() => omitir(t.id)} onCompartir={() => setCompartir(true)} />
      {compartir && studio.slug && (
        <CompartirEnlace
          abierto
          onCerrar={() => setCompartir(false)}
          slug={studio.slug}
          nombreEstudio={studio.nombre ?? 'tu estudio'}
          esPropietaria
          avisoSinClase={avisoAlCompartir(estado)}
        />
      )}
    </>
  );
}

function TarjetaDeSiempre({ colapsado }: { colapsado: boolean }) {
  const {
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, bannersPortal, dataLoaded, datosIncompletos,
  } = useStudio();
  const panelNuevo = usePanelNuevo();
  const { puedeVer } = usePermisos();
  const { activo: visitaEnMarcha } = useTour();
  const omitidas = useOmitidas(studio?.id ?? null);

  if (!panelNuevo || !puedeVer('/primeros-pasos')) return null;
  // Con la carga a medias, una lista vacía no quiere decir «no lo tiene».
  if (visitaEnMarcha || !studio || !dataLoaded || datosIncompletos.length > 0 || studio.onboardingDescartadoEn) return null;

  const datos = datosOnboardingDelEstudio({
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, bannersPortal,
  });
  const p = primerosPasos(calcularOnboarding(datos).categorias);
  // Omitir no la da por hecha: solo deja de ofrecerse y pasa a la siguiente.
  const t = p.tareas.find(x => !x.hecha && !omitidas.includes(x.id)) ?? null;
  if (!t) return null;
  const vista: Vista = {
    paso: p.hechas + 1, total: p.total, id: t.id, titulo: t.titulo, para: t.para,
    accion: { label: 'Hacerlo ahora', href: t.href }, puedeOmitir: true,
  };
  return (
    <TarjetaVista
      vista={vista}
      colapsado={colapsado}
      onOmitir={() => omitirTarea(studio.id, t.id)}
      onCompartir={() => {}}
    />
  );
}
