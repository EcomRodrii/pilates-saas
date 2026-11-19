'use client';

// «Tu suscripción» en Mi perfil: qué plan tiene el estudio y adónde ir a subir o bajar.
// Solo la propietaria (el `esPropietaria` de /api/billing/status). Todo el cambio de plan
// vive en /suscripcion: aquí solo se ve y se enlaza, nunca se cobra.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { estadoBilling, type EstadoBilling } from '@/lib/api-client';
import { PLAN_INFO, type Plan } from '@/lib/billing/entitlements';
import { cardCls } from '@/components/configuracion/estilos';

const ORDEN: Plan[] = ['BASE', 'ESTUDIO', 'CADENA'];

const fechaLarga = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }) : null;

export function BloqueSuscripcion() {
  const [b, setB] = useState<EstadoBilling | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void estadoBilling().then(r => { if (vivo) setB(r); });
    return () => { vivo = false; };
  }, []);

  if (!b || !b.esPropietaria) return null;

  const plan = (ORDEN as string[]).includes(b.plan) ? (b.plan as Plan) : 'BASE';
  const info = PLAN_INFO[plan];
  const i = ORDEN.indexOf(plan);
  const gratis = !!b.gratis;
  const paga = !gratis && !b.enPrueba && b.subscriptionStatus === 'active';
  const estado = gratis ? 'Gratis' : b.enPrueba ? 'En prueba' : paga ? 'Activa' : 'Sin suscripción de pago';
  const proximo = fechaLarga(b.enPrueba ? b.pruebaTermina : b.periodoTermina);

  return (
    <div className={`${cardCls} p-5`} data-testid="bloque-suscripcion">
      <h3 className="text-[15px] font-semibold">Tu suscripción</h3>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[22px] font-semibold">{gratis ? `${info.nombre} gratis` : info.nombre}</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium text-muted-foreground">{estado}</span>
        {!gratis && <span className="text-[13px] text-muted-foreground">{info.precioMes} €/mes</span>}
      </div>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{info.resumen}</p>
      {proximo && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{b.enPrueba ? 'La prueba termina el' : 'Próximo cobro el'} {proximo}.</p>}
      <div className="mt-4 flex flex-wrap gap-2.5">
        {i < ORDEN.length - 1 && (
          <Link href="/suscripcion" className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-brand-foreground">
            {gratis || !paga ? 'Elegir plan' : `Subir a ${PLAN_INFO[ORDEN[i + 1]].nombre}`}
          </Link>
        )}
        {paga && i > 0 && (
          <Link href="/suscripcion" className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[13px] font-semibold hover:bg-muted">
            Bajar a {PLAN_INFO[ORDEN[i - 1]].nombre}
          </Link>
        )}
        <Link href="/suscripcion" className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
          Ver todos los planes y facturas
        </Link>
      </div>
    </div>
  );
}
