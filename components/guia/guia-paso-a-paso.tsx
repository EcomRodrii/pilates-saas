'use client';

// La pantalla `/puesta-en-marcha`: la guía paso a paso (qué se ve, en guia-paso-a-paso-vista.tsx).
// Aquí solo los datos: qué paso se pide (`?paso=`), saltar y abrir «Compartir mi enlace».

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { avisoAlCompartir } from '@/lib/alta/estado';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { SOPORTE_WHATSAPP } from '@/lib/soporte';
import { pasoPedido, RUTA_GUIA } from '@/lib/guia/ruta-puesta-en-marcha';
import { useGuiaPasoAPaso } from './use-guia-paso-a-paso';
import { GuiaPasoAPasoVista } from './guia-paso-a-paso-vista';

const CompartirEnlace = dynamic(() => import('./compartir-enlace').then(m => m.CompartirEnlace), { ssr: false });

export function GuiaPasoAPaso() {
  const { studio } = useStudio();
  const router = useRouter();
  const params = useSearchParams();
  const guia = useGuiaPasoAPaso();
  const [compartir, setCompartir] = useState(false);
  const sobra = guia.activo === false;
  // Sin la guía (apagada, o no es la propietaria): al Resumen, que es donde estaba la lista.
  useEffect(() => { if (sobra) router.replace('/dashboard'); }, [sobra, router]);

  // Mientras se pregunta si es del alta nueva, o faltan datos: ni una pantalla a medias ni un «no tienes nada».
  if (guia.activo === null || (guia.activo && !guia.ruta)) {
    return <p className="py-16 text-center text-sm text-muted-foreground" role="status">Preparando tu guía…</p>;
  }
  if (!guia.activo || !guia.ruta || !studio) return null;
  const paso = pasoPedido(guia.ruta, params.get('paso'));
  if (!paso) return null;

  const ayudaHref = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${studio.nombre || 'mi estudio'} y estoy poniendo en marcha Tentare:`);

  return (
    <>
      <GuiaPasoAPasoVista
        ruta={guia.ruta}
        paso={paso}
        ayudaHref={ayudaHref}
        onCompartir={() => setCompartir(true)}
        onSaltar={id => { guia.saltar(id); router.replace(RUTA_GUIA, { scroll: false }); }}
      />
      {compartir && studio.slug && (
        <CompartirEnlace
          abierto
          onCerrar={() => setCompartir(false)}
          slug={studio.slug}
          nombreEstudio={studio.nombre ?? 'tu estudio'}
          esPropietaria
          avisoSinClase={avisoAlCompartir(guia.estado)}
        />
      )}
    </>
  );
}
