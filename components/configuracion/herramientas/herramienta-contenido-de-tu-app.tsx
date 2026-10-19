'use client';

import dynamic from 'next/dynamic';
import { TabDescubre } from '@/components/configuracion/tab-descubre';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { useMiWebNueva } from '@/lib/estudio/panel-nuevo-cliente';

// La v2 (decisiones 10–13 de «Mi app y mi web», tras `MI_WEB_NUEVA`) en su propio
// trozo: quien no la tiene no la descarga.
const ContenidoDeTuApp = dynamic(
  () => import('@/components/configuracion/contenido-app/contenido-de-tu-app').then(m => m.ContenidoDeTuApp),
  { loading: () => <p className="text-[13px] text-muted-foreground">Cargando…</p> },
);

// Las tarjetas de «Descubre» y el mensaje destacado (y, en la de antes, el tablón).
export function HerramientaContenidoDeTuApp(_props: { showToast: (m: string) => void }) {
  const nueva = useMiWebNueva();
  return (
    <TarjetaAjuste id="contenido-de-tu-app" marco={false}>
      {nueva ? <ContenidoDeTuApp /> : <TabDescubre />}
    </TarjetaAjuste>
  );
}
