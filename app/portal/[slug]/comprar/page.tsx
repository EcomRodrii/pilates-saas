'use client';

import { Suspense, useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { catalogo } from '@/lib/student/catalogo';
import { precioPorSesion } from '@/lib/student/precio-por-clase';
import { precioEnEuros } from '@/lib/reservar/tarjeta-plan';
import {
  AVISO_PRODUCTOS, ahorroFrenteASuelta, catalogoTienda, coberturaDeTipos, paraQueClases, precioDeTienda, renovacionDeCuota,
  resumenProducto, textoBotonCompra, TITULO_FAMILIA, vigenciaDeCompra, type FamiliaProducto, type ProductoTienda,
} from '@/lib/student/tienda';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Button } from '@/components/student/ui/Button';
import { HojaCompra } from '@/components/student/domain/HojaCompra';
import { useSesionStudent } from '@/lib/student/sesion';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { useRouter, useSearchParams } from 'next/navigation';
import { proyectarClases } from '@/lib/student/mapeo';
import { opcionesDeClase } from '@/lib/reservar/opciones-de-clase';
import { etiquetaDia } from '@/lib/student/formato';
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
function Comprar() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  // `?para=<clase>` (P01): se llega desde una clase que no tiene con qué pagar. La tienda enseña solo lo que la cubre
  // y, cuando el servidor confirma la compra, ofrece volver a reservarla. «Ver todo el catálogo» quita el filtro sin
  // tocar la URL (cambiar solo la query de la misma ruta con el router deja la vieja pegada en producción).
  const para = useSearchParams().get('para');
  const [verTodo, setVerTodo] = useState(false);

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
      // La referencia del «ahorras un N %»: las clases sueltas que vende el
      // estudio, leídas igual que las cobra el checkout. Cada bono se compara
      // con la que sirve para SUS clases (`ahorroFrenteASuelta`).
      planesTarifa: d?.planesTarifa ?? [],
      // «Si lo compras hoy, hasta el…»: el «hoy» se fija al cargar, no en cada
      // render (un render tiene que ser puro, y la fecha no cambia mirando).
      ahora: new Date(),
      // La clase para la que compra (`?para=`), y qué la cubre: la MISMA regla que la ficha y el cobro.
      clase: (() => {
        if (!para || !d) return null;
        const c = proyectarClases(d).find((x) => x.id === para);
        if (!c) return null;
        const r = opcionesDeClase({ planes: d.planesTarifa ?? [], tipoClaseId: c.tipoClaseId, precioPuntualSesion: c.precioPuntual });
        return {
          id: c.id, nombre: c.nombre, cuando: `${etiquetaDia(c.fecha)} · ${c.hora}`,
          planIds: new Set(r.opciones.filter((o) => !o.noPagable).map((o) => o.planId)),
        };
      })(),
    };
  }, [estudio.slug, para]);

  const { data, estado, reintentar } = useAsync(cargar);

  const claseDestino = data?.clase ?? null;
  const filtrando = !!claseDestino && !verTodo;
  const productos = (data?.productos ?? []).filter((p) => !filtrando || claseDestino!.planIds.has(p.id));
  const nombresTipo = data?.nombresTipo ?? new Map<string, string>();
  const familias = (['suscripcion', 'bono', 'suelta', 'servicio', 'producto'] as FamiliaProducto[])
    .map((f) => ({ familia: f, items: productos.filter((p) => p.familia === f) }))
    .filter((g) => g.items.length > 0);

  return (
    <StudentShell>
      <PageHeader titulo="Comprar" back />

      {claseDestino && (
        <div className="px" style={{ marginTop: 10 }}>
          <div className="card card--pad" data-testid="comprar-para-clase" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="t-label" style={{ margin: 0 }}>Para tu clase</p>
              <p style={{ margin: '2px 0 0', fontWeight: 800 }}>{claseDestino.nombre} · {claseDestino.cuando}</p>
            </div>
            {!verTodo && (
              <button type="button" className="tap no-shrink" onClick={() => setVerTodo(true)} style={{ border: 'none', background: 'none', padding: 0, fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', cursor: 'pointer' }}>
                Ver todo el catálogo
              </button>
            )}
          </div>
        </div>
      )}

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '20px', marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={96} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && (
          <OfflineState cuerpo="Los productos se mostrarán cuando vuelva la conexión." />
        )}
        {filtrando && data && productos.length === 0 ? (
          <EmptyState
            ilustracion="tienda"
            titulo="Para esta clase no se vende nada aquí"
            cuerpo="Pídelo en recepción, o mira el resto del catálogo."
            accion="Ver todo el catálogo"
            onAccion={() => setVerTodo(true)}
          />
        ) : estado === 'empty' || (data && productos.length === 0) ? (
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

        {/* Aquí irá «Tu primera clase» (P07), ANTES de las familias y solo para
            quien el servidor diga que puede estrenarla. No se pinta todavía: va
            atada a reservar una clase concreta y entra con el diseño de pagar y
            reservar en la misma hoja (P06), que pasa por revisión de pagos. */}

        {data && productos.length > 0 && familias.map(({ familia, items }) => (
          <section key={familia}>
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
                  nombresTipo={nombresTipo}
                  planesTarifa={data.planesTarifa}
                  ahora={data.ahora}
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
          // El servidor ya ha confirmado el bono (la hoja no llega aquí antes):
          // el catálogo cacheado ya no vale. `?compra=ok&plan=` hace que Bonos
          // vuelva a comprobarlo al cargar, en vez de fiarse de esta pantalla.
          invalidarCatalogo(estudio.slug);
          const planId = comprando?.id;
          setComprando(null);
          router.push(planId ? `${href('/bonos')}?compra=ok&plan=${encodeURIComponent(planId)}` : href('/bonos'));
        }}
        onSesionCaducada={() => router.push(href('/acceso/login'))}
        onSegundoPaso={() => router.push(`${href('/acceso/dos-pasos')}?next=${encodeURIComponent(href('/bonos'))}`)}
        enlaceEstudio={href('/mensajes')}
        // Comprado PARA una clase y solo si lo que compra la cubre: tras confirmarlo el servidor, volver a reservarla.
        paraClase={claseDestino && comprando && claseDestino.planIds.has(comprando.id) ? {
          nombre: claseDestino.nombre,
          onReservar: () => {
            invalidarCatalogo(estudio.slug);
            router.push(`${href(`/reservar/${encodeURIComponent(claseDestino.id)}`)}?reservar=1`);
          },
        } : undefined}
      />
    </StudentShell>
  );
}

/**
 * Una tarjeta que se lee sin hacer cuentas (P09): el nombre entero, el precio en
 * grande y por clase, cuánto ahorras si es verdad, hasta QUÉ DÍA vale si lo
 * compras hoy, para qué clases sirve y el importe en el botón.
 *
 * Solo presentación: cada línea sale de `lib/student/tienda.ts`, con el mismo
 * cálculo que hace el servidor al cobrar, y la que no se sabe no se escribe.
 */
function TarjetaProducto({ p, nombresTipo, planesTarifa, ahora, delay, onComprar }: {
  p: ProductoTienda;
  // Hacen falta para poder nombrar los topes por actividad («2 de Máquina y 1
  // de Gyrotonic por semana») y para qué clases sirve: sin ellos no se escriben.
  nombresTipo: ReadonlyMap<string, string>;
  planesTarifa: readonly PlanTarifa[];
  ahora: Date;
  delay: number; onComprar: () => void;
}) {
  const resumen = resumenProducto(p, nombresTipo);
  const porClase = precioPorSesion(p.precio, p.familia === 'suscripcion' ? null : p.sesiones);
  const ahorro = ahorroFrenteASuelta(p, planesTarifa);
  const vigencia = vigenciaDeCompra(p, ahora);
  const renovacion = renovacionDeCuota(p);
  const para = paraQueClases(p, nombresTipo);
  const boton = textoBotonCompra(p);
  return (
    <article className="card a-up" style={{ padding: '15px 16px', animationDelay: `${delay}ms` }}>
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
      {/* El nombre ENTERO, en su propia línea: compartiendo fila con el precio,
          un «Bono 10 clases mañana y tarde» se partía en tres renglones. */}
      <h3 className="t-title" style={{ overflowWrap: 'anywhere' }}>{p.nombre}</h3>
      {resumen && <p className="t-meta" style={{ margin: '3px 0 0' }}>{resumen}</p>}

      <p style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, rowGap: 2, margin: '8px 0 0' }}>
        <span data-testid="precio" className="t-num" style={{ fontSize: 'calc(var(--t-h1) * var(--heading-scale))', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.02em', lineHeight: 1.1 }}>
          {precioDeTienda(p)}
        </span>
        {/* El número que de verdad decide: el mismo precio, escrito por clase.
            `precioPorSesion` devuelve `null` en lo que no se divide (una cuota,
            una suelta) y entonces no se escribe nada. El ahorro va en su propio
            trozo y sin caja de color: es un dato, no un reclamo. */}
        {porClase !== null && (
          <span className="t-meta t-num">
            <span data-testid="precio-por-clase">{precioEnEuros(porClase)}/clase</span>
            {ahorro !== null && <span data-testid="ahorro">{` · ahorras un ${ahorro} %`}</span>}
          </span>
        )}
      </p>

      {vigencia && <p data-testid="vigencia" className="t-small" style={{ marginTop: 6 }}>{vigencia}</p>}
      {renovacion && <p data-testid="renovacion" className="t-small" style={{ marginTop: 6 }}>{renovacion}</p>}
      {/* Para qué clases sirve, ANTES de pagar: un bono acotado a un tipo de
          clase se rechaza al reservar cualquier otro. */}
      {para && <p data-testid="cobertura" className="t-meta" style={{ marginTop: 3 }}>{para}</p>}
      {p.descripcion && (
        <p style={{ margin: '7px 0 0', fontSize: 'var(--t-small)', lineHeight: 1.5, color: 'var(--muted-foreground)' }}>{p.descripcion}</p>
      )}

      {/* Sin botón en lo físico: se compra en el estudio. Un «Comprar» que
          abriera un cobro sería mentira, y uno que no hiciera nada, peor. */}
      {boton && (
        <Button variant="secondary" full onClick={onComprar} style={{ marginTop: 'var(--s-3)', height: 'var(--h-control-md)' }}>
          {boton}
        </Button>
      )}
    </article>
  );
}

export default function ComprarPage() {
  // `useSearchParams` exige un límite de Suspense en el App Router.
  return (
    <Suspense fallback={null}>
      <Comprar />
    </Suspense>
  );
}
