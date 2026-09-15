'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { saludIntegracion } from '@/lib/integraciones/salud';
import { hrefDeSeccion } from '@/lib/configuracion/destino';
import { resumenStripe, type ResumenFila } from '@/lib/configuracion/resumenes';
import { seccionDeTarjeta, tarjetaPorId } from '@/lib/configuracion/secciones';
import { StripeIcon } from '@/components/icons/brand-icons';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { btnPrimary, btnSecondary } from '@/components/configuracion/estilos';
import { FILA } from '@/components/configuracion/shell/fila-herramienta';
import { TituloFila, ValorFila } from '@/components/configuracion/shell/fila-ajuste';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';

// ─────────────────────────────────────────────────────────────────────────────
// «Cobro con tarjeta (Stripe)», en Cobros y facturas: una fila con UN estado.
//
// Era una tarjeta de integraciones que decía «No conectado» en la pastilla y
// «Todavía no disponible» debajo: ¿lo conecto yo o no puedo? Ahora el estado
// (lib/configuracion/resumenes.ts, `resumenStripe`) decide también la acción:
//   · sin conectar → «Conectar» en la misma fila (OAuth de Stripe Connect);
//   · conectado → la fila abre su cajón: Bizum, abrir Stripe y desconectar;
//   · no disponible todavía → nada que tocar: no le toca hacer nada.
//
// Solo es la pantalla: conectar, desconectar y el estado de Bizum van por las
// mismas rutas de servidor que antes, sin tocar nada del cobro.
// ─────────────────────────────────────────────────────────────────────────────

type EstadoBizum = 'active' | 'pending' | 'inactive';

export interface CobroConTarjeta {
  conectado: boolean;
  disponible: boolean;
  bizum: EstadoBizum | null;
  /** `null` = sin cargar el estudio. */
  resumen: ResumenFila | null;
  conectando: boolean;
  conectar: () => void;
  /** `null` = desconectado de verdad; un texto = no, y por qué. */
  desconectar: () => Promise<string | null>;
}

export function useCobroConTarjeta(showToast: (m: string) => void): CobroConTarjeta {
  const { studio, integraciones, reflejarStudioGuardado } = useStudio();
  const conectado = !!studio?.stripeAccountId;
  const clientId = process.env.NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID;
  // Sin la clave OAuth en el servidor no hay nada que conectar.
  const disponible = !!clientId;
  const [conectando, setConectando] = useState(false);
  const enVuelo = useRef(false);

  // La vuelta del OAuth: el aviso viaja en la URL y se consume aquí. La URL se
  // queda en la sección de la tarjeta (si cambia de sección, la vuelta la sigue).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const seccion = hrefDeSeccion(seccionDeTarjeta('integracion-stripe'));
    if (params.get('stripe_connected')) {
      showToast('Stripe conectado — ya puedes cobrar en tu propia cuenta');
      window.history.replaceState({}, '', seccion);
    } else if (params.get('stripe_connect_error')) {
      showToast(`Error al conectar Stripe: ${params.get('stripe_connect_error')}`);
      window.history.replaceState({}, '', seccion);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bizum en un cargo directo exige la capacidad `bizum_payments` `active` en
  // ESTA cuenta conectada, no solo pedida (#1874, #1883).
  const [bizum, setBizum] = useState<EstadoBizum | null>(null);
  useEffect(() => {
    if (!conectado) return;
    let cancelado = false;
    (async () => {
      const res = await fetch('/api/integrations/stripe/bizum-estado', { headers: await authHeader() });
      if (!res.ok || cancelado) return;
      const data = await res.json() as { estado?: EstadoBizum };
      if (!cancelado) setBizum(data.estado ?? 'inactive');
    })().catch(() => {});
    return () => { cancelado = true; };
  }, [conectado]);

  // La salud solo existe si hay fila en `integraciones`; con OAuth, normalmente no.
  const intg = integraciones.find(i => i.tipo === 'STRIPE');
  const fallando = saludIntegracion(intg && {
    activo: intg.activo, ultimoOkEn: intg.ultimoOkEn, ultimoError: intg.ultimoError, ultimoErrorEn: intg.ultimoErrorEn,
  }).estado === 'FALLANDO';

  const bizumVisto = conectado ? bizum : null;

  // C-8: el `state` lo emite firmado una ruta de servidor autenticada y el
  // callback lo verifica. El botón lo pide y redirige.
  async function conectar() {
    if (!clientId || enVuelo.current) return;
    enVuelo.current = true;
    setConectando(true);
    const fallo = (texto: string) => { enVuelo.current = false; setConectando(false); showToast(texto); };
    try {
      const res = await fetch('/api/integrations/oauth-state', {
        method: 'POST',
        // H-1: same-origin (el valor por defecto, explícito para que no se cambie): esta respuesta fija la cookie HttpOnly del flujo.
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ provider: 'stripe' }),
      });
      if (!res.ok) { fallo('No se pudo iniciar la conexión con Stripe'); return; }
      const { state } = await res.json() as { state: string };
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const redirect = encodeURIComponent(`${appUrl}/api/stripe/connect/callback`);
      window.location.href = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
    } catch {
      fallo('No se pudo iniciar la conexión con Stripe. Revisa tu conexión.');
    }
  }

  // La cuenta de cobro no la escribe el navegador: la ruta comprueba que quien
  // desconecta es la dueña, guarda la cuenta anterior para los webhooks que
  // lleguen tarde y deja constancia en Actividad.
  async function desconectar(): Promise<string | null> {
    try {
      const res = await fetch('/api/integrations/stripe/desconectar', { method: 'POST', headers: await authHeader() });
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) return data?.error ?? 'No se ha podido desconectar Stripe';
      reflejarStudioGuardado({ stripeAccountId: null });
      return null;
    } catch {
      return 'No se ha podido desconectar Stripe. Revisa tu conexión.';
    }
  }

  return {
    conectado,
    disponible,
    bizum: bizumVisto,
    resumen: studio ? resumenStripe({ conectado, disponible, fallando, bizum: bizumVisto }) : null,
    conectando,
    conectar: () => { void conectar(); },
    desconectar,
  };
}

/** El logo, en su placa y en grises: a color era lo más saturado de Configuración. */
function LogoStripe() {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted grayscale">
      <StripeIcon size={36} />
    </span>
  );
}

export function FilaCobroConTarjeta({ c, onAbrir }: { c: CobroConTarjeta; onAbrir: () => void }) {
  const tarjeta = tarjetaPorId('integracion-stripe');
  const texto = (
    <span className="min-w-0 flex-1">
      <TituloFila titulo={tarjeta.titulo} estado={c.resumen?.estado} />
      {/* Lo que falta por nuestro lado es una variable del servidor: no es un
          mensaje para la propietaria, pero sí para quien opera la plataforma. */}
      <ValorFila
        valor={c.resumen?.valor ?? null}
        descripcion={tarjeta.frase}
        entero
        title={c.resumen && !c.conectado && !c.disponible ? 'Falta configurar NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID en el servidor' : undefined}
      />
    </span>
  );

  if (c.conectado) {
    return (
      <li>
        <button
          id="integracion-stripe"
          type="button"
          aria-haspopup="dialog"
          onClick={onAbrir}
          className={cn(FILA, 'w-full scroll-mt-32 scroll-mb-32 text-left')}
        >
          <LogoStripe />
          {texto}
          <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </li>
    );
  }

  return (
    <li id="integracion-stripe" className="flex min-h-16 scroll-mt-32 scroll-mb-32 items-center gap-3 px-4 py-3">
      <LogoStripe />
      {texto}
      {c.resumen && c.disponible && (
        <button type="button" onClick={c.conectar} disabled={c.conectando} className={cn(btnPrimary, 'shrink-0')}>
          {c.conectando ? 'Conectando…' : 'Conectar'}
        </button>
      )}
    </li>
  );
}

/** El cajón de la fila cuando está conectado: cómo pagan, abrir Stripe y desconectar. */
export function DetalleCobroConTarjeta({ c, onGuardado }: { c: CobroConTarjeta } & Pick<PropsFormularioCajon, 'onGuardado'>) {
  const [preguntando, setPreguntando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bizumPendiente = !!c.bizum && c.bizum !== 'active';

  async function desconectar() {
    setDesconectando(true);
    setError(null);
    const fallo = await c.desconectar();
    setDesconectando(false);
    if (fallo) setError(fallo);
    else onGuardado('Stripe desconectado');
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <p className="text-sm text-foreground text-pretty">
        {c.bizum === 'active' ? 'Tus alumnas pueden pagarte con tarjeta y con Bizum.' : 'Tus alumnas pueden pagarte con tarjeta.'}
      </p>
      {/* Antes la propietaria se enteraba de que Bizum no funcionaba cuando una
          alumna se quejaba de un cobro roto (#1883). */}
      {bizumPendiente && (
        <p className="rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-foreground text-pretty">
          Bizum no está activo en tu cuenta de Stripe: tus alumnas no lo ven como forma de pago.
        </p>
      )}
      <div className="flex flex-col gap-2 @sm/config:flex-row">
        <a
          href={bizumPendiente ? 'https://dashboard.stripe.com/settings/payment_methods' : 'https://dashboard.stripe.com'}
          target="_blank"
          rel="noreferrer"
          className={cn(btnSecondary, 'inline-flex items-center justify-center gap-1.5')}
        >
          {bizumPendiente ? 'Activar Bizum en Stripe' : 'Abrir tu cuenta de Stripe'}
          <ExternalLink size={14} aria-hidden />
        </a>
        <button
          type="button"
          onClick={() => setPreguntando(true)}
          disabled={desconectando}
          className={cn(btnSecondary, 'text-destructive')}
        >
          {desconectando ? 'Desconectando…' : 'Desconectar Stripe'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-destructive text-pretty">{error}</p>}
      <ConfirmDialog
        open={preguntando}
        onOpenChange={setPreguntando}
        titulo="¿Desconectar Stripe?"
        descripcion="Hasta que lo vuelvas a conectar no se cobrará nada por Stripe: ni pagos con tarjeta o Bizum, ni los cobros automáticos de cuotas y penalizaciones, ni devoluciones desde Tentare. Las remesas de tu banco siguen funcionando."
        textoConfirmar="Sí, desconectar"
        destructivo
        onConfirm={() => { void desconectar(); }}
      />
    </div>
  );
}
