'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { catalogo } from '@/lib/student/catalogo';
import { euros } from '@/lib/student/formato';
import { precioPorSesion } from '@/lib/student/precio-por-clase';
import { nombrePeriodo } from '@/lib/bono-logic';
import { AVISO_PRODUCTOS, catalogoTienda, coberturaDeTipos, coberturaProducto, resumenProducto, TITULO_FAMILIA, type FamiliaProducto, type ProductoTienda } from '@/lib/student/tienda';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Button } from '@/components/student/ui/Button';
import { HojaCompra } from '@/components/student/domain/HojaCompra';
import { useSesionStudent } from '@/lib/student/sesion';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { useRouter } from 'next/navigation';
import type { PlanTarifa } from '@/lib/types';
import { configLegalDe } from '@/lib/legal-textos';
import { Foto } from '@/components/student/ui/Foto';

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
      productos: catalogoTienda(d?.planesTarifa ?? [], d?.citasServicios ?? [], d?.productosFisicos ?? []),
      planes: d?.planesTarifa ?? [],
      stripeAccountId: d?.studio?.stripeAccountId ?? null,
      // La CASILLA (checkout-embebido.tsx) es opt-in a propósito: solo exige
      // marcar algo cuando el estudio ha reescrito de verdad alguna condición
      // — casi ninguno lo ha hecho, y forzar una casilla contra el texto por
      // defecto de todos los estudios no aporta nada. `textosLegales` sigue
      // acotado por los campos CRUDOS del estudio (null = no reescribió
      // nada = sin casilla), no por `configLegalDe` a secas: esa función
      // SIEMPRE compone un documento (con los valores por defecto si hace
      // falta), así que usarla también para decidir si HAY casilla la
      // habría dejado apareciendo en todos los checkouts, siempre.
      //
      // Lo que SÍ hay que arreglar con `configLegalDe` es el CONTENIDO que se
      // enseña cuando la casilla sí aparece: el caso mixto (solo reescribió
      // uno de los dos documentos) pasaba el otro campo crudo — `''` — y
      // abría un diálogo en blanco en vez de caer al texto por defecto de
      // ESE documento. Es el MISMO efectivo que sella `lib/legal-sellado.ts`,
      // así que lo que se firma y lo que se lee vuelven a coincidir.
      textosLegales: (() => {
        const s2 = d?.studio as { politicaPrivacidad?: string | null; terminosServicio?: string | null } | undefined;
        return s2?.politicaPrivacidad || s2?.terminosServicio ? configLegalDe(d?.studio, d?.studio) : null;
      })(),
      // Para poder decir A QUÉ está acotado un bono hace falta el nombre del
      // tipo, no su id. Los dos datos ya viajan en el mismo payload.
      nombresTipo: new Map((d?.tiposClase ?? []).map((t) => [t.id, t.nombre])),
    };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar);

  const productos = data?.productos ?? [];
  const nombresTipo = data?.nombresTipo ?? new Map<string, string>();
  const familias = (['suscripcion', 'bono', 'suelta', 'servicio', 'producto'] as FamiliaProducto[])
    .map((f) => ({ familia: f, items: productos.filter((p) => p.familia === f) }))
    .filter((g) => g.items.length > 0);

  return (
    <StudentShell>
      <PageHeader titulo="Comprar" back />

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
            ilustracion="tienda"
            titulo="Todavía no hay nada a la venta"
            cuerpo={`${estudio.nombre} aún no ha publicado bonos ni suscripciones. Escríbeles y te lo cuentan.`}
            accion="Ver contacto"
            href={href('/ayuda')}
          />
        ) : null}

        {data && productos.length > 0 && familias.map(({ familia, items }, gi) => (
          <section key={familia} style={{ marginTop: gi === 0 ? 0 : 6 }}>
            <h2 className="t-label" style={{ marginBottom: 9 }}>{TITULO_FAMILIA[familia]}</h2>
            {/* El aviso va DENTRO de la sección y antes de las tarjetas, no en
                un pie: tiene que leerse antes de que a nadie le apetezca buscar
                el botón de pagar, porque no hay ninguno. Estos artículos no
                tienen checkout —no hay nada detrás que aparte la unidad ni que
                sepa que se entrega en mano— y cobrar sin eso es justo lo que
                este repo lleva meses quitando. */}
            {familia === 'producto' && (
              <p data-testid="aviso-productos" className="t-meta" style={{ margin: '-2px 0 9px', lineHeight: 1.5 }}>
                {AVISO_PRODUCTOS}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {items.map((p, i) => (
                <TarjetaProducto
                  key={p.id}
                  p={p}
                  cobertura={coberturaProducto(p, nombresTipo)}
                  nombresTipo={nombresTipo}
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
        // `key`, no un efecto dentro de HojaCompra: cambiar de plan tiene que
        // reiniciar su estado de cero (ver el comentario largo ahí sobre el
        // bug real de precio arrastrado entre planes distintos).
        key={comprando?.id}
        plan={comprando}
        cobertura={coberturaDeTipos(comprando?.tiposClaseIds, nombresTipo)}
        studioId={estudio.id}
        socioId={socia?.socioId ?? null}
        socioEmail={socia?.email ?? null}
        stripeAccountId={data?.stripeAccountId ?? null}
        textosLegales={data?.textosLegales ?? null}
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

function TarjetaProducto({ p, cobertura, nombresTipo, delay, onComprar }: {
  p: ProductoTienda; cobertura: string | null;
  // Hacen falta para poder nombrar los topes por actividad («2 de Máquina y 1
  // de Gyrotonic por semana»): sin ellos el resumen no los escribe.
  nombresTipo: ReadonlyMap<string, string>;
  delay: number; onComprar: () => void;
}) {
  const resumen = resumenProducto(p, nombresTipo);
  const porClase = precioPorSesion(p.precio, p.familia === 'suscripcion' ? null : p.sesiones);
  return (
    <article className="card a-up" style={{ padding: '14px 15px', animationDelay: `${delay}ms` }}>
      {/* La foto solo si la hay, y sin reservarle hueco cuando no: hoy NINGÚN
          producto de producción tiene imagen, así que un marco vacío sería lo
          que vería todo el mundo. Mismo criterio que el catálogo del TPV. */}
      {p.imagenUrl && (
        <Foto
          src={p.imagenUrl}
          ancho={540}
          alto={132}
          sizes="(min-width:1024px) 500px, 100vw"
          style={{ width: '100%', height: 132, objectFit: 'cover', borderRadius: 'var(--radius-md)', marginBottom: 10, display: 'block' }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: '-.01em' }}>{p.nombre}</h3>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 800 }}>
            {euros(p.precio)}
            {p.familia === 'suscripcion' && (
              <span className="t-meta">/{nombrePeriodo({ periodicidadMeses: p.periodicidadMeses })}</span>
            )}
          </p>
          {/* El número que de verdad decide, y que la pantalla le estaba
              dejando calcular a ella: con cinco productos a la vez, elegir
              entre «56 €» y «96 €» es dividir de cabeza. No es una oferta ni
              un descuento inventado — es el mismo precio, escrito por clase.
              `precioPorSesion` devuelve `null` en todo lo que no se puede
              dividir (un mensual ilimitado, una clase suelta), y entonces
              aquí no se escribe nada. */}
          {porClase !== null && (
            <p className="t-meta t-num" data-testid="precio-por-clase" style={{ marginTop: 2 }}>{euros(porClase)}/clase</p>
          )}
        </div>
      </div>

      {resumen && <p className="t-meta" style={{ margin: '4px 0 0' }}>{resumen}</p>}

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
            color: 'var(--warning-foreground)', fontSize: 'var(--t-meta)', fontWeight: 800,
          }}
        >
          {cobertura}
        </p>
      )}
      {p.descripcion && (
        <p style={{ margin: '7px 0 0', fontSize: 'var(--t-small)', lineHeight: 1.5, color: 'var(--muted-foreground)' }}>{p.descripcion}</p>
      )}

      {/* Sin botón en lo físico: se compra en el estudio. Un «Comprar» que
          abriera un cobro sería mentira, y uno que no hiciera nada, peor. */}
      {p.familia !== 'producto' && (
        <Button full onClick={onComprar} style={{ marginTop: 'var(--s-3)', height: 'var(--h-control-md)' }}>
          {p.familia === 'suscripcion' ? 'Contratar' : 'Comprar'}
        </Button>
      )}
    </article>
  );
}
