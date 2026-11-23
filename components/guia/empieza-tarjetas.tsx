'use client';

// «Pon en marcha tu estudio» en el Inicio, como «Empieza a crear la tienda» del admin de Shopify (22-nov-2026): sin
// marco alrededor, sin X, directamente bajo el compositor y con las tarjetas de siempre (`TarjetasDeArranque`). Mismas
// tareas, mismos datos y mismo «hecho» (`usePonEnMarcha`): solo cambia que ya no se esconde por haberla cerrado una vez.
// Desaparece cuando de verdad no queda nada (las cinco tareas y los opcionales hechos), no antes.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useStudio } from '@/lib/studio-context';
import { avisoAlCompartir } from '@/lib/alta/estado';
import { useOnboardingNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { TarjetasDeArranque } from './tarjetas-de-arranque';
import { usePonEnMarcha } from './use-pon-en-marcha';
import { useGuiaActiva } from './use-guia-paso-a-paso';
import { PonEnMarchaTarjeta } from './pon-en-marcha';
import { TarjetaGuiaResumen } from './tarjeta-guia-resumen';

const CompartirEnlace = dynamic(() => import('./compartir-enlace').then(m => m.CompartirEnlace), { ssr: false });

export function EmpiezaTarjetas() {
  const guia = useGuiaActiva();
  const tarjetas = useOnboardingNuevo();
  // La guía paso a paso (12 pasos) va siempre visible en el Inicio nuevo, aunque se hubiera cerrado; la lista de siempre (sin
  // `ONBOARDING_NUEVO`) sigue siendo lo que era.
  if (guia.activo === true) return <TarjetaGuiaResumen siempre />;
  if (!tarjetas) return <PonEnMarchaTarjeta />;
  return <EmpiezaTarjetasVista />;
}

function EmpiezaTarjetasVista() {
  const { studio } = useStudio();
  const { pasos, omitir, estado } = usePonEnMarcha();
  const [compartirAbierto, setCompartirAbierto] = useState(false);
  if (!studio || !pasos) return null;
  const queda = pasos.tareas.some(t => t.id !== 'cuenta' && t.estado !== 'hecha') || pasos.opcionales.some(o => !o.hecha);
  if (!queda) return null;
  return (
    <section aria-labelledby="empieza-titulo" data-testid="empieza-tarjetas">
      <h2 id="empieza-titulo" className="mb-3 px-0.5 text-[13px] font-medium text-foreground">Pon en marcha tu estudio</h2>
      <TarjetasDeArranque pasos={pasos} onCompartir={() => setCompartirAbierto(true)} onOmitir={omitir} />
      {compartirAbierto && studio.slug && (
        <CompartirEnlace
          abierto
          onCerrar={() => setCompartirAbierto(false)}
          slug={studio.slug}
          nombreEstudio={studio.nombre ?? 'tu estudio'}
          esPropietaria
          avisoSinClase={avisoAlCompartir(estado)}
        />
      )}
    </section>
  );
}
