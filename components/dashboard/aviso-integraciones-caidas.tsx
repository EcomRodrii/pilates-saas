'use client';

import Link from 'next/link';
import { PlugZap } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { integracionesCaidas, cuando } from '@/lib/integraciones/salud';
import type { TipoIntegracion } from '@/lib/types';

// Una integración caída, dicha donde la propietaria entra de verdad.
//
// La tarjeta de Configuración → Integraciones ya dice la verdad desde que
// existe `lib/integraciones/salud.ts`, pero solo si vas a mirarla — y nadie
// abre Configuración a diario. Sin esto, un estudio al que Meta le revoque el
// token sigue enterándose semanas después, que era el problema entero.
//
// Deliberadamente NO va por el Action Center: ese agrupa recomendaciones del
// Decision OS y todas llevan score e impacto en €. Meter aquí una integración
// caída obligaría a inventarle los dos, y un número inventado en esta pantalla
// es peor que no tener el aviso.
//
// Y deliberadamente NO es una sección de `HOME_SECCIONES`: no es contenido que
// tenga sentido reordenar ni ocultar, es un aviso de estado que aparece y se va
// solo — misma categoría que el Header, que también vive fuera de esa lista. De
// paso se esquiva el gotcha de `aplicarLayout`, que mete los ids nuevos al
// final del orden guardado y lo habría enterrado en los estudios que ya
// personalizaron su inicio.

const NOMBRE: Partial<Record<TipoIntegracion, string>> = {
  WHATSAPP: 'WhatsApp Business',
  KISI: 'Kisi',
  RESEND: 'Email (Resend)',
};

export function AvisoIntegracionesCaidas() {
  const { integraciones } = useStudio();

  // Sin guardia de rol a propósito: la RLS de `integraciones`
  // (`owner_integraciones`) solo devuelve filas a la PROPIETARIA del estudio,
  // así que para el resto del personal la lista llega vacía y esto no pinta
  // nada. El límite real es la cerradura, no un `if` en el cliente.
  // La selección es pura y está probada aparte (`integracionesCaidas`), incluido
  // el caso de que el dato llegue con otra forma: esta pantalla es la principal
  // del negocio y un `.map` sobre algo inesperado no rompe este aviso, la rompe
  // entera.
  const caidas = integracionesCaidas(integraciones);

  if (caidas.length === 0) return null;

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
          <PlugZap size={18} className="text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-destructive">
            {caidas.length === 1
              ? `${NOMBRE[caidas[0].integracion.tipo] ?? caidas[0].integracion.tipo} ha dejado de funcionar`
              : `${caidas.length} integraciones han dejado de funcionar`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {caidas.map(({ integracion, desde, error }) => (
              <li key={integracion.tipo} className="text-[12px] text-muted-foreground leading-snug">
                {/* El motivo del servicio, no un «revisa la configuración»: es
                    lo único que distingue un token caducado de un número mal
                    puesto, y decide si esto se arregla en un minuto o no. */}
                <span className="font-medium text-foreground">{NOMBRE[integracion.tipo] ?? integracion.tipo}</span>
                {' · desde el '}{cuando(desde)}{' · '}{error}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted-foreground mt-2 leading-snug">
            Mientras tanto, lo que se mandaba por ahí no está llegando a tus clientas.
          </p>
          <Link
            href="/configuracion?tab=integraciones"
            className="inline-flex items-center mt-2.5 text-[12px] font-semibold text-destructive hover:underline"
          >
            Arreglarlo en Integraciones →
          </Link>
        </div>
      </div>
    </div>
  );
}
