'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { catalogo } from '@/lib/student/catalogo';
import { euros } from '@/lib/student/formato';
import { catalogoTienda, coberturaDeTipos, coberturaProducto, resumenProducto, TITULO_FAMILIA, type FamiliaProducto, type ProductoTienda } from '@/lib/student/tienda';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Button } from '@/components/student/ui/Button';
import { HojaCompra } from '@/components/student/domain/HojaCompra';
import { useSesionStudent } from '@/lib/student/sesion';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { useRouter } from 'next/navigation';
import type { PlanTarifa } from '@/lib/types';

// Comprar (P0-5). Hasta ahora la alumna solo podía RESERVAR: no había ningún
// sitio donde ver qué vende el estudio, así que un bono o una suscripción solo
// se descubrían por accidente al toparse con el precio de una clase.
//
// ⚠️ NO es un catálogo nuevo. Todo sale de `planes_tarifa` y `citas_servicios`,
// que ya viajaban en el payload público, y los precios son los MISMOS que cobra
// `app/api/public/checkout-embebido` — que los lee en servidor. Aquí no se
// calcula ni un importe: `lib/student/tienda.ts` solo filtra y ordena lo que el
// estudio ya configuró.
//
// ⚠️ Elegibilidad: un plan `activo: false` y un servicio sin `auto_reservable`
// NO aparecen. Enseñarlos llevaría a un checkout que los rechaza.
export default function ComprarPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();

  const router = useRouter();
  const { socia } = useSesionStudent(estudio.slug);
  // El plan COMPLETO que se está comprando: `CheckoutEmbebido` lo necesita
  // entero, y el catálogo de la tienda es una proyección reducida.
  const [comprando, setComprando] = useState<PlanTarifa | null>(null);

  const cargar = useCallback(async () => {
    const d = await catalogo(estudio.slug);
    return {
      productos: catalogoTienda(d?.planesTarifa ?? [], d?.citasServicios ?? []),
      planes: d?.planesTarifa ?? [],
      stripeAccountId: d?.studio?.stripeAccountId ?? null,
      // Para poder decir A QUÉ está acotado un bono hace falta el nombre del
      // tipo, no su id. Los dos datos ya viajan en el mismo payload.
      nombresTipo: new Map((d?.tiposClase ?? []).map((t) => [t.id, t.nombre])),
    };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar);

  const productos = data?.productos ?? [];
  const nombresTipo = data?.nombresTipo ?? new Map<string, string>();
  const familias = (['suscripcion', 'bono', 'suelta', 'servicio'] as FamiliaProducto[])
    .map((f) => ({ familia: f, items: productos.filter((p) => p.familia === f) }))
    .filter((g) => g.items.length > 0);

  return (
    <StudentShell>
      <PageHeader titulo="Comprar" sub={`Lo que ofrece ${estudio.nombre}`} back />

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '14px', marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={96} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && (
          <OfflineState cuerpo="Los productos se mostrarán cuando vuelva la conexión." />
        )}
        {estado === 'empty' || (data && productos.length === 0) ? (
          // Estado vacío DISEÑADO, no una lista en blanco: un estudio puede no
          // vender nada online y eso no es un error.
          <EmptyState
            icono="🛍"
            titulo="Todavía no hay nada a la venta"
            cuerpo={`${estudio.nombre} aún no ha publicado bonos ni suscripciones. Escríbeles y te lo cuentan.`}
            accion="Ver contacto"
            href={href('/ayuda')}
          />
        ) : null}

        {data && productos.length > 0 && familias.map(({ familia, items }, gi) => (
          <section key={familia} style={{ marginTop: gi === 0 ? 0 : 6 }}>
            <h2 className="t-label" style={{ marginBottom: 9 }}>{TITULO_FAMILIA[familia]}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {items.map((p, i) => (
                <TarjetaProducto
                  key={p.id}
                  p={p}
                  cobertura={coberturaProducto(p, nombresTipo)}
                  delay={i * 55}
                  // Los PLANES se cobran aquí dentro, con el mismo
                  // `CheckoutEmbebido` que usa `/reservar`. Los SERVICIOS de
                  // cita no son planes —la ruta de checkout solo acepta
                  // `planId`— así que esos siguen saliendo al flujo existente
                  // en vez de fingir un cobro que este endpoint no sabe hacer.
                  onComprar={() => {
                    if (p.familia === 'servicio') {
                      // A la pestaña que SÍ contiene servicios de cita. El ancla
                      // `#bonos-membresias` solo pinta planes de tarifa y no
                      // existe si el estudio no vende ninguno: la alumna salía
                      // de la app y no encontraba lo que acababa de tocar.
                      // Nueva pestaña: `/reservar` está fuera del scope del
                      // manifest, así que navegar ahí abandona la PWA.
                      window.open(`/reservar/${encodeURIComponent(estudio.slug)}?tab=citas`, '_blank', 'noopener');
                      return;
                    }
                    // Sin socia resuelta el servidor cobraría como invitada
                    // anónima y el bono no quedaría ligado a nadie: primero se
                    // resuelve la identidad.
                    if (!socia?.socioId) { router.push(href('/acceso/verificar')); return; }
                    const plan = (data?.planes ?? []).find((x) => x.id === p.id) ?? null;
                    setComprando(plan);
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <HojaCompra
        plan={comprando}
        cobertura={coberturaDeTipos(comprando?.tiposClaseIds, nombresTipo)}
        studioId={estudio.id}
        socioId={socia?.socioId ?? null}
        stripeAccountId={data?.stripeAccountId ?? null}
        onCerrar={() => setComprando(null)}
        onComprado={() => {
          // El bono ya está en su cuenta: el catálogo cacheado ya no vale.
          invalidarCatalogo(estudio.slug);
          setComprando(null);
          router.push(href('/bonos'));
        }}
        onSesionCaducada={() => router.push(href('/acceso/login'))}
      />
    </StudentShell>
  );
}

function TarjetaProducto({ p, cobertura, delay, onComprar }: {
  p: ProductoTienda; cobertura: string | null; delay: number; onComprar: () => void;
}) {
  const resumen = resumenProducto(p);
  return (
    <article className="card a-up" style={{ padding: '14px 15px', animationDelay: `${delay}ms` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, letterSpacing: '-.01em' }}>{p.nombre}</h3>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
          {euros(p.precio)}
          {p.familia === 'suscripcion' && <span className="t-meta" style={{ fontSize: 11 }}>/mes</span>}
        </p>
      </div>

      {resumen && <p className="t-meta" style={{ margin: '4px 0 0', fontSize: 12 }}>{resumen}</p>}

      {/* La restricción va ANTES del precio de decidir, no después de pagar:
          un bono acotado a un tipo de clase se rechaza al reservar cualquier
          otro. Se pinta como aviso, no como un dato más de la lista de arriba,
          porque cambia lo que la alumna puede hacer con lo que compra. */}
      {cobertura && (
        <p
          data-testid="cobertura"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, margin: '7px 0 0',
            padding: '3px 9px', borderRadius: 999, background: 'var(--warning-soft)',
            color: 'var(--warning-foreground)', fontSize: 11.5, fontWeight: 800,
          }}
        >
          {cobertura}
        </p>
      )}
      {p.descripcion && (
        <p style={{ margin: '7px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted-foreground)' }}>{p.descripcion}</p>
      )}

      <Button full onClick={onComprar} style={{ marginTop: 'var(--s-3)', height: 'var(--h-control-md)' }}>
        {p.familia === 'suscripcion' ? 'Contratar' : 'Comprar'}
      </Button>
    </article>
  );
}
