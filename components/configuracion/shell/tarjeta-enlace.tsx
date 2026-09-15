'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { hrefDeSeccion } from '@/lib/configuracion/destino';
import { seccionAnfitriona, seccionPorId, tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';
import { esClicNormal, useNavegacionConfig } from './contexto';

// La fila que ocupa el sitio de una tarjeta que todavía se pinta en otra
// sección (ver `hospedadaEn` en lib/configuracion/secciones.ts).
//
// Existe para que la propietaria busque en el sitio que tiene sentido —los
// datos fiscales en «Cobros y facturas»— y llegue, aunque el formulario aún viva
// en «Mi estudio». Dice la verdad sobre dónde está, en vez de esconderlo.
export function TarjetaEnlace({ id }: { id: TarjetaId }) {
  const nav = useNavegacionConfig();
  const tarjeta = tarjetaPorId(id);
  const anfitriona = seccionAnfitriona(id);
  const href = hrefDeSeccion(anfitriona, id);

  return (
    <Link
      href={href}
      onClick={e => {
        if (!nav || !esClicNormal(e)) return;
        e.preventDefault();
        nav.irA(anfitriona, { ancla: id, modo: 'push' });
      }}
      className="flex min-h-14 max-w-2xl items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{tarjeta.titulo}</span>
        <span className="block text-sm text-muted-foreground text-pretty">
          Está en «{seccionPorId(anfitriona).titulo}» mientras terminamos de ordenarlo.
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
