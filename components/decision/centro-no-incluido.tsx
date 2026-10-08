'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import { useAsistente, usePuertaAsistente } from '@/lib/asistente-context';

// Lo que ve quien abre el Centro de Control sin que su plan (o su prueba) lo
// incluya. Antes salía «No hemos podido cargar el Centro de Control» con un
// «Reintentar» que nunca iba a funcionar: se leía como un fallo de Tentare, y
// los estudios decían que «no les dejaba entrar». No es un error: es una
// puerta con un motivo y una salida.
//
// El asistente sí va en todos los planes (feature `asistente`): se ofrece aquí
// como lo que SÍ pueden usar hoy.
export function CentroNoIncluido({ pruebaVencida }: { pruebaVencida: boolean }) {
  const puertaAsistente = usePuertaAsistente();
  const { abrir } = useAsistente();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-16 text-center" data-testid="centro-no-incluido">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock size={20} aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground">
          {pruebaVencida ? 'Tu prueba gratuita ha terminado' : `El Centro de Control es del plan ${PLAN_INFO.ESTUDIO.nombre}`}
        </h1>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground text-pretty">
          {pruebaVencida
            ? 'Elige un plan para volver a entrar. Tus datos siguen guardados tal como los dejaste.'
            : 'Cada día te dice lo único que merece tu atención —un impago, una clase que no se llena, una alumna que se te va— y, si quieres, hace solo lo que ya has aprobado muchas veces.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/suscripcion" className={buttonVariants()}>{pruebaVencida ? 'Elegir mi plan' : 'Ver planes y precios'}</Link>
        {puertaAsistente && (
          <Button variant="outline" onClick={() => abrir()}>Pregúntale a Tentare</Button>
        )}
      </div>
    </div>
  );
}
