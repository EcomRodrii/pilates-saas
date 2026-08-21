'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { fetchFichaEstudio, type FichaEstudio } from '@/lib/interno/client';
import { AccionesEstudio } from './acciones';

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[12.5px] text-muted-foreground shrink-0">{etiqueta}</span>
      <span className="text-[13px] font-medium text-foreground text-right break-words min-w-0">{children}</span>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{titulo}</h2>
      {children}
    </section>
  );
}

export default function FichaEstudioInterno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [f, setF] = useState<FichaEstudio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setF(await fetchFichaEstudio(id)); } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!f) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/interno/estudios" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft size={14} /> Estudios
      </Link>

      {f.suspension.suspendido && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/5 px-4 py-3">
          <p className="text-[13px] font-bold text-red-700">Acceso suspendido</p>
          <p className="text-[12.5px] text-red-700/90">{f.suspension.motivo ?? 'Sin motivo registrado.'}</p>
        </div>
      )}

      <header>
        <h1 className="text-[22px] font-bold text-foreground leading-tight">{f.estudio.nombre}</h1>
        <p className="text-[13px] text-muted-foreground">/{f.estudio.slug} · plan {f.estudio.plan} · alta el {fecha(f.estudio.creadoEn)}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Bloque titulo="Contacto">
          <Dato etiqueta="Email del estudio">{f.estudio.email ?? '—'}</Dato>
          <Dato etiqueta="Teléfono">{f.estudio.telefono ?? '—'}</Dato>
          <Dato etiqueta="Dirección">{f.estudio.direccion ?? '—'}</Dato>
          <Dato etiqueta="Email de la dueña">{f.duena?.email ?? '—'}</Dato>
          <Dato etiqueta="Último acceso">{fecha(f.duena?.ultimoAcceso ?? null)}</Dato>
        </Bloque>

        <Bloque titulo="Uso (últimos 30 días)">
          <Dato etiqueta="Socias">{f.uso.socias}</Dato>
          <Dato etiqueta="Clases creadas">{f.uso.clases}</Dato>
          <Dato etiqueta="Reservas">{f.uso.reservas30d}</Dato>
          <Dato etiqueta="Su facturación">{f.uso.facturacionPropia30d.toLocaleString('es-ES')} €</Dato>
        </Bloque>

        <Bloque titulo="Pagos">
          <Dato etiqueta="Cliente en Stripe">{f.pagos.tieneClienteStripe ? 'Sí' : 'No'}</Dato>
          <Dato etiqueta="Cobra a sus socias (Connect)">{f.pagos.cobraConStripeConnect ? 'Sí' : 'No'}</Dato>
          {/* No se finge saber si está al día: eso lo sabe Stripe y solo Stripe. */}
          <p className="mt-2 text-[12px] text-muted-foreground leading-snug">
            El estado de la suscripción (al día, impagada, cancelada) y la próxima renovación no se guardan aquí.
            {f.pagos.clienteStripeId && (
              <>
                {' '}
                <a href={`https://dashboard.stripe.com/customers/${f.pagos.clienteStripeId}`}
                   target="_blank" rel="noopener noreferrer"
                   className="font-semibold text-brand-medio inline-flex items-center gap-1">
                  Ver en Stripe <ExternalLink size={11} />
                </a>
              </>
            )}
          </p>
        </Bloque>

        <Bloque titulo={`Equipo (${f.equipo.length})`}>
          {f.equipo.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Sin equipo dado de alta.</p>
          ) : f.equipo.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
              <span className="text-[13px] text-foreground min-w-0 truncate">
                {p.nombre} <span className="text-muted-foreground">· {p.rol.toLowerCase()}</span>
              </span>
              <span className="flex gap-1.5 shrink-0">
                {!p.activo && <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">de baja</span>}
                {/* Sin cuenta no recibe ni campana ni push: es la explicación
                    de la mitad de los "no me llega nada" del soporte. */}
                {!p.tieneCuenta && <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-warning">sin cuenta</span>}
              </span>
            </div>
          ))}
        </Bloque>
        <AccionesEstudio
          id={f.estudio.id} plan={f.estudio.plan}
          suspendido={f.suspension.suspendido} motivo={f.suspension.motivo}
          reviewBoost={f.reviewBoost}
        />
      </div>

      <p className="text-[12px] text-muted-foreground">
        Esta ficha no muestra los datos personales de las socias del estudio (nombres, contacto ni fichas de salud).
        Abrirla queda registrada en la auditoría.
      </p>
    </div>
  );
}
