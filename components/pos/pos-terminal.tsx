'use client';

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { anfitrionPortal } from '@/lib/panel-portal';
import {
  Search, Plus, Minus, X, ShoppingCart, Wallet, User, Package,
  Loader2, Tag, AlertTriangle, Ticket, Receipt,
} from 'lucide-react';
import { cn, formatEuro } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { DeudaClienta } from './deuda-clienta';
import { buscarCodigo, validarCodigoCanjeable, calcularDescuento } from '@/lib/codigos-descuento';
import { calcularTicket, estadoStock, puedeAnadir, type LineaTicket } from '@/lib/pos/ticket';
import { cargarCatalogoPOS, esError, type CatalogoPOS } from '@/lib/pos/cliente';
import { formatNumeroVenta } from '@/lib/pos/tipos';
import { registrarVenta } from '@/lib/pos/cliente';
import type { CodigoDescuento } from '@/lib/types';
import type { MetodoPago } from '@/lib/types';
import { HojaCobro } from './hoja-cobro';
import { AyudaDePantalla } from '@/components/ayuda/AyudaDePantalla';
import { HojaCaja } from './hoja-caja';
import { HojaVentas } from './hoja-ventas';

// ─────────────────────────────────────────────────────────────────────────────
// El terminal de venta.
//
// Pensado para un iPad en el mostrador: se usa de pie, con una clienta
// delante, a veces con una mano. De ahí las decisiones que más se notan:
//
//   · Objetivos táctiles de 44 px como mínimo, 56 px en lo que se pulsa
//     siempre. El TPV anterior tenía botones de +/− de 24 px.
//   · Dos toques para la venta más común: artículo → Cobrar.
//   · El total, en 34 px. Es la cifra que se dice en voz alta.
//   · Un solo buscador para artículos, bonos y clientas. Antes había que saber
//     de antemano en qué pestaña estaba cada cosa.
//
// Los importes que se pintan aquí los calcula `calcularTicket`, que aplica las
// MISMAS reglas de redondeo que la RPC del servidor (hay un test que lo fija).
// Pero lo que se cobra sale siempre del servidor: esto es una previsualización.
// ─────────────────────────────────────────────────────────────────────────────

type ItemCarrito = LineaTicket & { stock: number | null; stockMinimo: number };

type Categoria = { valor: string; label: string };

export function PosTerminal() {
  const { socios, codigosDescuento, refrescarTrasVentaPOS } = useStudio();

  const [catalogo, setCatalogo] = useState<CatalogoPOS | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string>('TODO');
  const [clienteId, setClienteId] = useState<string | null>(null);

  const [descuentoTexto, setDescuentoTexto] = useState('');
  const [descuentoTipo, setDescuentoTipo] = useState<'EUROS' | 'PORCENTAJE'>('EUROS');
  const [codigoTexto, setCodigoTexto] = useState('');
  const [codigoAplicado, setCodigoAplicado] = useState<CodigoDescuento | null>(null);
  const [codigoError, setCodigoError] = useState<string | null>(null);

  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [mostrarCaja, setMostrarCaja] = useState(false);
  const [mostrarVentas, setMostrarVentas] = useState(false);
  // Importe libre: un concepto tecleado en el mostrador (un arreglo, una
  // señal, algo que no está en catálogo). Es el ÚNICO sitio donde el precio lo
  // pone el cliente, y es correcto que así sea: no hay catálogo que releer, es
  // una decisión de quien cobra —con `puedeMoverDinero` ya comprobado— y queda
  // firmada con su nombre en la venta. El servidor lo acota igual (máx 10.000 €).
  const [libreAbierto, setLibreAbierto] = useState(false);
  const [libreNombre, setLibreNombre] = useState('');
  const [libreImporte, setLibreImporte] = useState('');
  const [vistaMovil, setVistaMovil] = useState<'catalogo' | 'ticket'>('catalogo');
  const [aviso, setAviso] = useState<string | null>(null);

  const buscadorRef = useRef<HTMLInputElement>(null);

  // ⚠️ El TPV se pinta en un PORTAL a document.body, no dentro del <main> del
  // panel. Motivo concreto: `PanelPageTransition` anima el contenido con un
  // `transform`, y la barra superior del panel va en z-30 — dentro de ese
  // árbol, el TPV quedaba detrás y con los clics interceptados por `<main>`.
  // Es el mismo motivo por el que DashboardSheet tiene su prop `portal`.
  //
  // No hace falta un flag de "ya montado" para el SSR: `cargando` empieza en
  // `true` y solo baja dentro de una callback asíncrona, así que el render del
  // servidor devuelve siempre el spinner y nunca llega al createPortal.

  // El contador fuerza una recarga cuando algo de fuera cambia (una venta, un
  // movimiento de caja). Va como dependencia del efecto en vez de llamar a una
  // función que hace setState desde el cuerpo del efecto — que es lo que la
  // regla `set-state-in-effect` prohíbe, y con razón: encadena renders.
  const [recarga, setRecarga] = useState(0);
  // Recarga el catálogo del TPV (stock, caja, resumen del día) Y el panel
  // (recibos, facturas, bonos). Son dos mundos: el catálogo lo sirve
  // /api/pos/catalogo y el panel vive en el StudioContext, que no se entera de
  // nada porque el TPV escribe en servidor con service_role. Antes solo se
  // hacía lo primero, así que se cobraba y /cobros seguía enseñando lo de
  // antes hasta recargar la página entera.
  const refrescar = useCallback(() => {
    setRecarga((n) => n + 1);
    void refrescarTrasVentaPOS();
  }, [refrescarTrasVentaPOS]);

  useEffect(() => {
    let vivo = true;
    cargarCatalogoPOS().then((r) => {
      if (!vivo) return;
      setCargando(false);
      if (esError(r)) { setErrorCarga(r.error); return; }
      setErrorCarga(null);
      setCatalogo(r);
    });
    return () => { vivo = false; };
  }, [recarga]);

  // ── Catálogo unificado: género + planes ───────────────────────────────────
  // Las dos fuentes se presentan juntas porque para quien cobra son lo mismo
  // («esto cuesta 80 €»), pero por debajo cada una sigue siendo lo que era: un
  // bono vendido aquí crea la misma suscripción que si se vendiera desde la
  // ficha de la clienta.
  const articulos = useMemo(() => {
    if (!catalogo) return [];
    const productos = catalogo.productos
      .filter((p) => p.activo)
      .map((p) => ({
        clave: `prod:${p.id}`, tipo: 'PRODUCTO' as const, referenciaId: p.id,
        nombre: p.nombre, precio: p.precio, ivaPct: p.ivaPct,
        categoria: p.categoria, stock: p.stock, stockMinimo: p.stockMinimo,
        detalle: p.descripcion, sku: p.sku, codigoBarras: p.codigoBarras,
      }));
    const planes = catalogo.planes.map((p) => ({
      clave: `plan:${p.id}`, tipo: 'PLAN' as const, referenciaId: p.id,
      nombre: p.nombre, precio: p.precio, ivaPct: p.ivaPct,
      categoria: p.tipo === 'BONO' ? 'BONOS' : p.tipo === 'MENSUAL' ? 'CUOTAS' : 'CLASES',
      stock: null as number | null, stockMinimo: 0,
      detalle: p.sesiones ? `${p.sesiones} ${p.sesiones === 1 ? 'sesión' : 'sesiones'}` : p.descripcion,
      sku: null as string | null, codigoBarras: null as string | null,
    }));
    return [...planes, ...productos];
  }, [catalogo]);

  const categorias: Categoria[] = useMemo(() => {
    const presentes = new Set(articulos.map((a) => a.categoria));
    const orden: Categoria[] = [
      { valor: 'TODO', label: 'Todo' },
      { valor: 'BONOS', label: 'Bonos' },
      { valor: 'CLASES', label: 'Clases' },
      { valor: 'CUOTAS', label: 'Cuotas' },
      { valor: 'PRODUCTO', label: 'Tienda' },
      { valor: 'SESION', label: 'Sesiones' },
      { valor: 'PACK', label: 'Packs' },
      { valor: 'OTRO', label: 'Otros' },
    ];
    return orden.filter((c) => c.valor === 'TODO' || presentes.has(c.valor));
  }, [articulos]);

  // ── Buscador único ────────────────────────────────────────────────────────
  const q = busqueda.trim().toLowerCase();
  const articulosFiltrados = useMemo(() => articulos.filter((a) => {
    const porCategoria = categoria === 'TODO' || a.categoria === categoria;
    if (!q) return porCategoria;
    // Con búsqueda activa se ignora la pestaña: buscar «calcetines» tiene que
    // encontrarlos aunque estés mirando «Bonos».
    return (
      a.nombre.toLowerCase().includes(q)
      || (a.sku ?? '').toLowerCase().includes(q)
      || (a.codigoBarras ?? '').toLowerCase() === q
    );
  }), [articulos, categoria, q]);

  const clientasEncontradas = useMemo(() => {
    if (q.length < 2) return [];
    return socios
      .filter((s) => `${s.nombre} ${s.apellidos ?? ''}`.toLowerCase().includes(q))
      .slice(0, 4);
  }, [socios, q]);

  const cliente = clienteId ? socios.find((s) => s.id === clienteId) ?? null : null;

  // ── Carrito ───────────────────────────────────────────────────────────────
  function anadir(a: (typeof articulos)[number]) {
    setAviso(null);
    setCarrito((prev) => {
      // Un plan por línea: cada bono es una suscripción independiente, con su
      // propio saldo y su propia caducidad. Dos bonos iguales son dos líneas.
      if (a.tipo === 'PLAN') {
        return [...prev, { ...a, clave: `${a.clave}:${prev.length}`, cantidad: 1 }];
      }
      const existente = prev.find((i) => i.clave === a.clave);
      if (existente) {
        if (!puedeAnadir(a.stock, existente.cantidad)) {
          setAviso(`No queda más stock de «${a.nombre}».`);
          return prev;
        }
        return prev.map((i) => (i.clave === a.clave ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      if (!puedeAnadir(a.stock, 0)) { setAviso(`«${a.nombre}» está agotado.`); return prev; }
      return [...prev, { ...a, cantidad: 1 }];
    });
  }

  function anadirLibre() {
    const nombre = libreNombre.trim();
    const precio = parseFloat(libreImporte.replace(',', '.')) || 0;
    if (!nombre || precio <= 0) return;
    setCarrito((prev) => [...prev, {
      clave: `libre:${prev.length}:${Date.now()}`,
      tipo: 'LIBRE', referenciaId: null, nombre: nombre.slice(0, 120),
      precio, cantidad: 1, ivaPct: catalogo?.ivaDefecto ?? 21,
      stock: null, stockMinimo: 0,
    }]);
    setLibreNombre(''); setLibreImporte(''); setLibreAbierto(false);
  }

  function cambiarCantidad(clave: string, delta: number) {
    setAviso(null);
    setCarrito((prev) => prev.flatMap((i) => {
      if (i.clave !== clave) return [i];
      const nueva = i.cantidad + delta;
      if (nueva <= 0) return [];
      if (delta > 0 && !puedeAnadir(i.stock, i.cantidad)) {
        setAviso(`No queda más stock de «${i.nombre}».`);
        return [i];
      }
      return [{ ...i, cantidad: nueva }];
    }));
  }

  function vaciar() {
    setCarrito([]); setClienteId(null); setDescuentoTexto('');
    setCodigoTexto(''); setCodigoAplicado(null); setCodigoError(null);
    setAviso(null); setVistaMovil('catalogo');
    setLibreAbierto(false); setLibreNombre(''); setLibreImporte('');
    setNonceVenta(nuevoNonce());
  }

  // ── Totales (previsualización; manda el servidor) ─────────────────────────
  const ticket = useMemo(() => calcularTicket(carrito, {
    descuentoTipo,
    descuentoValor: parseFloat(descuentoTexto.replace(',', '.')) || 0,
    descuentoCodigo: codigoAplicado ? calcularDescuento(codigoAplicado, carrito.reduce((s, l) => s + l.precio * l.cantidad, 0)) : 0,
  }), [carrito, descuentoTipo, descuentoTexto, codigoAplicado]);

  function aplicarCodigo() {
    const encontrado = buscarCodigo(codigosDescuento, codigoTexto);
    const r = validarCodigoCanjeable(encontrado, { hoyISO: new Date().toISOString(), subtotal: ticket.subtotal });
    if (!r.ok) { setCodigoAplicado(null); setCodigoError(r.motivo); return; }
    setCodigoAplicado(encontrado); setCodigoError(null);
  }

  // Un bono sin ficha SE PUEDE cobrar: alguien entra de la calle, paga una
  // clase de prueba y se va sin dar sus datos. Antes esto bloqueaba el botón
  // de cobrar, y el mostrador acababa tecleándolo como importe libre — el
  // dinero entraba, pero la clase no quedaba registrada como clase.
  //
  // Sigue avisando, porque no es lo mismo que una botella de agua: el bono
  // queda SIN ENTREGAR hasta que alguien le ponga ficha desde Ventas. El aviso
  // informa; no impide.
  const bonoSinFicha = carrito.some((i) => i.tipo === 'PLAN') && !clienteId;

  // ── Cobro ─────────────────────────────────────────────────────────────────
  //
  // ⚠️ La clave de idempotencia identifica ESTE INTENTO DE COBRO, no la forma
  // del ticket. La diferencia no es sutil: atada solo al contenido, dos
  // clientas comprando lo mismo (una botella de agua en efectivo, el caso más
  // común de un mostrador) generarían la MISMA clave, el servidor devolvería la
  // venta de la primera y la segunda no se registraría nunca — sin bajar stock,
  // sin ingreso, y con la pantalla diciendo «Cobrado». A partir de la primera
  // venta de una forma dada, ninguna igual volvería a existir.
  //
  // De ahí el nonce: se genera al montar, y se renueva al vaciar el ticket y
  // tras cada venta con éxito. Dentro de un mismo intento no cambia, que es lo
  // que hace que un doble toque o un reintento de red sigan siendo un solo
  // cobro. El contenido sigue en la firma para que MODIFICAR el carrito a
  // media venta cuente como intento nuevo.
  const [nonceVenta, setNonceVenta] = useState(() => nuevoNonce());
  const claveIdempotencia = useMemo(() => {
    const firma = carrito
      // Las líneas LIBRE no tienen `referenciaId`, así que sin nombre y precio
      // «Esterilla 3 €» y «Camiseta 25 €» darían la misma firma.
      .map((i) => `${i.tipo}|${i.referenciaId ?? i.nombre}|${i.precio}|${i.cantidad}`)
      .join(';');
    return `pos-${hash(nonceVenta + firma + clienteId + descuentoTexto + descuentoTipo + (codigoAplicado?.id ?? ''))}`;
  }, [nonceVenta, carrito, clienteId, descuentoTexto, descuentoTipo, codigoAplicado]);

  const enviarVenta = useCallback(async (metodo: MetodoPago, efectivoRecibido: number | null) => {
    const r = await registrarVenta({
      lineas: carrito.map((i) => ({
        tipo: i.tipo, referenciaId: i.referenciaId, cantidad: i.cantidad,
        ...(i.tipo === 'LIBRE' ? { nombre: i.nombre, precio: i.precio } : {}),
      })),
      socioId: clienteId,
      metodoPago: metodo,
      descuentoTipo: descuentoTexto ? descuentoTipo : null,
      descuentoValor: parseFloat(descuentoTexto.replace(',', '.')) || 0,
      codigoDescuentoId: codigoAplicado?.id ?? null,
      efectivoRecibido,
      idempotenciaClave: `${claveIdempotencia}-${metodo}`,
    });
    // `yaExistia` = el servidor reconoció este mismo intento y devolvió la
    // venta que ya había creado. No es un cobro nuevo, y hay que decirlo: dar
    // por buena una venta que no se ha registrado ahora es justo lo que
    // convierte un reintento en un descuadre invisible.
    if (!esError(r) && r.yaExistia) {
      setAviso(`Esta venta ya estaba registrada (${formatNumeroVenta(r.numero)}). No se ha cobrado dos veces.`);
    }
    return r;
  }, [carrito, clienteId, descuentoTexto, descuentoTipo, codigoAplicado, claveIdempotencia]);

  // ── Atajos de teclado (escritorio) ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const enCampo = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if (e.key === '/' && !enCampo) { e.preventDefault(); buscadorRef.current?.focus(); }
      if (e.key === 'Escape' && !mostrarCobro && !mostrarCaja) { setBusqueda(''); (e.target as HTMLElement)?.blur?.(); }
      // Enter NO cobra desde cualquier sitio: en el TPV anterior un Enter suelto
      // lanzaba el cobro entero. Aquí abre la hoja, que es donde se decide.
      if (e.key === 'Enter' && !enCampo && carrito.length > 0 && !mostrarCobro) {
        setMostrarCobro(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [carrito.length, mostrarCobro, mostrarCaja]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <Loader2 size={26} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-3 text-center px-6">
        <AlertTriangle size={28} className="text-warning" />
        <p className="text-[15px] font-semibold text-foreground">No hemos podido abrir el TPV</p>
        <p className="text-[13px] text-muted-foreground max-w-[320px]">{errorCarga}</p>
        <button onClick={() => { setCargando(true); refrescar(); }} className="mt-2 h-11 px-5 rounded-xl bg-brand text-brand-foreground text-[14px] font-semibold">
          Reintentar
        </button>
      </div>
    );
  }

  const unidades = carrito.reduce((s, i) => s + i.cantidad, 0);

  return createPortal(
    <div
      className={cn(
        'fixed z-40 flex flex-col overflow-hidden bg-background',
        'left-0 right-0 lg:left-[var(--sidebar-w)]',
        // Móvil: entre la barra superior (48px) y la inferior (56px + área
        // segura), que siguen siendo navegables.
        'top-12 bottom-[calc(56px+env(safe-area-inset-bottom,0px))]',
        // Escritorio: todo lo que no es el raíl lateral, incluida la franja del
        // buscador ⌘K — el TPV es una herramienta a pantalla completa.
        //
        // ⚠️ En clases, NO en `style`: un `style` en línea gana a cualquier
        // clase, así que poner aquí el `top` móvil dejaba la barra ⌘K asomando
        // en escritorio porque `lg:top-0` no podía pisarlo.
        'lg:top-0 lg:bottom-0',
      )}
    >
      {/* ── Barra superior ────────────────────────────────────────────────── */}
      <header className="shrink-0 h-16 px-4 sm:px-5 border-b border-border bg-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="hidden md:block text-[16px] font-bold text-foreground shrink-0">Caja</h1>
          {/* La Caja no usa PageHeader (es una barra de mostrador, no una
              cabecera de página), así que su (i) se pone aquí a mano. */}
          <AyudaDePantalla ruta="/pos" className="hidden md:inline-flex" />
          {/* En móvil las tres métricas no caben, pero dejar la fila VACÍA era
              peor: media cabecera en blanco encima de un catálogo que ya iba
              justo de alto. Se enseña la única cifra que se mira de pie. */}
          <div className="sm:hidden min-w-0">
            <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground leading-none">Hoy</p>
            <p className="mt-1 text-[15px] font-bold leading-none tabular-nums text-success">
              {formatEuro(catalogo?.hoy.total ?? 0)}
            </p>
          </div>
          <div className="hidden sm:flex items-center">
            <Metrica label="Hoy" valor={formatEuro(catalogo?.hoy.total ?? 0)} destacado />
            <Metrica label="Ventas" valor={String(catalogo?.hoy.ventas ?? 0)} />
            <Metrica label="Ticket medio" valor={formatEuro(catalogo?.hoy.ticketMedio ?? 0)} />
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => setMostrarVentas(true)}
            className="h-11 px-4 rounded-xl border border-border bg-background text-[13.5px] font-semibold text-foreground flex items-center gap-2 hover:border-foreground/30 transition-colors"
          >
            <Receipt size={15} /> <span className="hidden sm:inline">Ventas</span>
          </button>
          <button
            onClick={() => setMostrarCaja(true)}
            className={cn(
              'h-11 px-4 rounded-xl border text-[13.5px] font-semibold flex items-center gap-2 transition-colors',
              catalogo?.caja
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-warning/40 bg-warning/10 text-warning',
            )}
          >
            <Wallet size={15} />
            {catalogo?.caja ? 'Caja abierta' : 'Abrir caja'}
          </button>
        </div>
      </header>

      {/* ── Conmutador móvil ──────────────────────────────────────────────── */}
      {/* Segmentado de verdad: los dos lados dentro de un mismo carril. Antes
          el elegido era una píldora sólida y el otro texto suelto sobre el
          fondo, así que no se leía como «dos pestañas» sino como un botón
          principal y una etiqueta. */}
      <div className="lg:hidden shrink-0 p-2 bg-card border-b border-border">
        <div role="tablist" className="flex gap-1 p-1 rounded-2xl bg-muted/60">
          {(['catalogo', 'ticket'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={vistaMovil === v}
              onClick={() => setVistaMovil(v)}
              className={cn(
                'flex-1 h-11 rounded-xl text-[14px] font-semibold transition-all flex items-center justify-center gap-2',
                vistaMovil === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {v === 'catalogo' ? 'Catálogo' : 'Ticket'}
              {/* Cuántos artículos llevas, no un error: el rojo de
                  `destructive` decía «algo va mal» para contar hasta tres. */}
              {v === 'ticket' && unidades > 0 && (
                <span className={cn(
                  'text-[12px] font-bold px-2 py-0.5 rounded-full',
                  vistaMovil === v ? 'bg-brand text-brand-foreground' : 'bg-foreground/10 text-foreground',
                )}>{unidades}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Catálogo ───────────────────────────────────────────────────── */}
        <section className={cn(
          'flex-col overflow-hidden w-full lg:w-[58%] xl:w-[62%] border-r border-border',
          vistaMovil === 'ticket' ? 'hidden lg:flex' : 'flex',
        )}>
          <div className="shrink-0 p-3 sm:p-4 space-y-3">
            <div className="relative">
              <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                ref={buscadorRef}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar artículo, bono o clienta…"
                aria-label="Buscar"
                className="w-full h-14 pl-11 pr-11 rounded-2xl border border-border bg-card text-[16px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground transition-colors"
              />
              {busqueda && (
                <button onClick={() => setBusqueda('')} aria-label="Limpiar" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Clientas encontradas por el MISMO buscador. No hay que saber de
                antemano si lo que escribes es un producto o una persona. */}
            {clientasEncontradas.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Clientas</p>
                {clientasEncontradas.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setClienteId(s.id); setBusqueda(''); }}
                    className="w-full h-14 px-4 flex items-center gap-3 text-left hover:bg-background transition-colors"
                  >
                    <span className="w-9 h-9 rounded-full bg-brand/10 text-brand-secondary flex items-center justify-center text-[13px] font-bold shrink-0">
                      {s.nombre.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[15px] font-medium text-foreground truncate">{s.nombre} {s.apellidos}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Los chips se desplazan cuando no caben, y antes el último
                quedaba cortado a media palabra («Tie…»). `pr-6` deja aire para
                que se lea entero.
                ⚠️ NO poner aquí un `mask-image` de degradado: se probó y dejó
                las tarjetas del catálogo SIN RESPONDER al clic en Chromium —
                el catálogo entero se volvía inservible. Lo cazó
                `caja-captura.spec.ts` al no poder pulsar un artículo. */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 pr-6">
              {categorias.map((c) => (
                <button
                  key={c.valor}
                  onClick={() => setCategoria(c.valor)}
                  className={cn(
                    'shrink-0 h-11 px-4 rounded-xl text-[14px] font-semibold transition-colors',
                    categoria === c.valor
                      ? 'bg-foreground text-background'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {c.label}
                </button>
              ))}
              <button
                onClick={() => setLibreAbierto((v) => !v)}
                aria-expanded={libreAbierto}
                className={cn(
                  'shrink-0 h-11 px-4 rounded-xl text-[14px] font-semibold border transition-colors flex items-center gap-1.5',
                  libreAbierto
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-card border-dashed border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Plus size={15} /> Importe libre
              </button>
            </div>

            {libreAbierto && (
              <div className="rounded-2xl border border-border bg-card p-3 flex flex-col sm:flex-row gap-2">
                <input
                  autoFocus value={libreNombre}
                  onChange={(e) => setLibreNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && anadirLibre()}
                  placeholder="¿De qué es?" aria-label="Concepto del importe libre"
                  className="flex-1 h-12 px-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-foreground"
                />
                <input
                  inputMode="decimal" value={libreImporte}
                  onChange={(e) => setLibreImporte(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && anadirLibre()}
                  placeholder="0,00" aria-label="Importe libre"
                  className="w-full sm:w-32 h-12 px-3 rounded-xl border border-border bg-background text-[15px] font-bold text-foreground tabular-nums text-center outline-none focus:border-foreground"
                />
                <button
                  onClick={anadirLibre}
                  disabled={!libreNombre.trim() || (parseFloat(libreImporte.replace(',', '.')) || 0) <= 0}
                  className="h-12 px-5 rounded-xl bg-brand text-brand-foreground text-[15px] font-bold disabled:opacity-40"
                >
                  Añadir
                </button>
              </div>
            )}
          </div>

          {/* `pb-28` cuando hay barra fija: sin ese hueco, la última fila de
              artículos quedaba PARTIDA por debajo de «Ver el ticket» y no
              había forma de llegar a ella. */}
          <div className={cn('flex-1 overflow-y-auto px-3 sm:px-4', carrito.length > 0 ? 'pb-28 lg:pb-6' : 'pb-6')}>
            <div
              className="grid gap-2.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))' }}
            >
              {articulosFiltrados.map((a) => {
                const est = estadoStock(a.stock, a.stockMinimo);
                const agotado = est === 'AGOTADO';
                return (
                  <button
                    key={a.clave}
                    onClick={() => !agotado && anadir(a)}
                    disabled={agotado}
                    className={cn(
                      // `justify-between` + alto mínimo: los precios de una
                      // misma fila quedan en la MISMA línea aunque un artículo
                      // no tenga subtítulo. Sin esto, «Mensual ilimitado» subía
                      // su precio respecto a sus vecinos y la rejilla se leía
                      // desordenada.
                      'group relative rounded-2xl border bg-card px-3 py-2.5 text-left flex flex-col justify-between gap-1.5',
                      'min-h-[104px] transition-all',
                      agotado
                        // ⚠️ Sin `opacity`: atenuar el bloque entero dejaba el
                        // nombre en gris sobre gris, ilegible. Se apaga el
                        // FONDO y el texto conserva su contraste — un artículo
                        // agotado hay que poder leerlo para saber cuál es.
                        ? 'border-border/60 bg-muted/40 cursor-not-allowed'
                        : 'border-border hover:border-foreground/30 hover:shadow-sm active:scale-[0.98]',
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn(
                        'text-[14.5px] font-semibold leading-snug line-clamp-2',
                        agotado ? 'text-muted-foreground' : 'text-foreground',
                      )}>{a.nombre}</p>
                      {a.detalle && <p className="text-[11.5px] text-muted-foreground truncate">{a.detalle}</p>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn(
                        'text-[16.5px] font-bold tabular-nums leading-none',
                        agotado ? 'text-muted-foreground' : 'text-foreground',
                      )}>{formatEuro(a.precio)}</p>
                      {/* Una sola forma para el stock, siempre en el mismo
                          sitio: antes «Quedan 3» era un texto naranja bajo el
                          precio y «Agotado» otro rojo, y sin control no había
                          nada — tres lenguajes visuales para un solo dato. */}
                      {/* Sin botón `+`: la tarjeta ENTERA es el objetivo, y
                          un cuadradito dentro de otro objetivo pulsable no
                          añade nada — solo robaba el ancho que necesitan el
                          nombre y el precio, que es lo que se lee de pie. */}
                      {est === 'BAJO' && <Chip tono="warning">Quedan {a.stock}</Chip>}
                      {est === 'AGOTADO' && <Chip tono="muted">Agotado</Chip>}
                    </div>
                  </button>
                );
              })}
            </div>

            {articulosFiltrados.length === 0 && (
              <div className="py-16 flex flex-col items-center gap-2 text-center">
                <Package size={26} className="text-muted-foreground" strokeWidth={1.5} />
                <p className="text-[14px] text-muted-foreground">
                  {q ? `Nada que coincida con «${busqueda}».` : 'Todavía no hay nada en el catálogo.'}
                </p>
              </div>
            )}
          </div>

          {/* ── Barra de ticket (solo táctil) ────────────────────────────
              En un iPad con ocho artículos, el catálogo dejaba media pantalla
              en blanco y el camino a cobrar estaba arriba del todo, en una
              pestaña. Esta barra acota ese vacío y pone el total y el paso
              siguiente donde está el pulgar. En escritorio no aparece: allí el
              ticket ya está a la vista en su columna. */}
          {carrito.length > 0 && (
            <button
              onClick={() => setVistaMovil('ticket')}
              className="lg:hidden shrink-0 m-3 h-16 rounded-2xl bg-brand text-brand-foreground px-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
            >
              <span className="w-8 h-8 rounded-full bg-brand-foreground/20 flex items-center justify-center text-[14px] font-extrabold tabular-nums">
                {unidades}
              </span>
              <span className="flex-1 text-left text-[15px] font-bold">Ver el ticket</span>
              <span className="text-[19px] font-extrabold tabular-nums">{formatEuro(ticket.total)}</span>
            </button>
          )}
        </section>

        {/* ── Ticket ─────────────────────────────────────────────────────── */}
        <aside className={cn(
          'flex-col overflow-hidden w-full lg:w-[42%] xl:w-[38%] bg-card',
          vistaMovil === 'catalogo' ? 'hidden lg:flex' : 'flex',
        )}>
          <div className="shrink-0 h-14 px-4 border-b border-border flex items-center justify-between">
            <span className="text-[15px] font-bold text-foreground flex items-center gap-2">
              <ShoppingCart size={16} /> Ticket
            </span>
            {carrito.length > 0 && (
              <button onClick={vaciar} className="h-9 px-3 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-destructive">
                Vaciar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {carrito.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-background border border-border flex items-center justify-center">
                  <ShoppingCart size={26} strokeWidth={1.5} className="text-muted-foreground" />
                </div>
                <p className="text-[15px] font-semibold text-foreground">Ticket vacío</p>
                <p className="text-[13px] text-muted-foreground max-w-[220px]">Toca un artículo del catálogo para empezar.</p>
              </div>
            ) : (
              <div className="py-2">
                {ticket.lineas.map((l) => (
                  <div key={l.clave} className="flex items-center gap-2 py-2.5 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-medium text-foreground truncate">{l.nombre}</p>
                      <p className="text-[12px] text-muted-foreground tabular-nums truncate">
                        {formatEuro(l.precio)}
                        {l.descuento > 0 && <span className="text-warning"> · −{formatEuro(l.descuento)}</span>}
                      </p>
                    </div>
                    {/* Steppers de 44 px: se pulsan de pie, con prisa. */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => cambiarCantidad(l.clave, -1)} aria-label={`Quitar una unidad de ${l.nombre}`}
                        className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-foreground hover:bg-background active:scale-95 transition-all">
                        <Minus size={15} />
                      </button>
                      <span className="w-8 text-center text-[15px] font-bold text-foreground tabular-nums">{l.cantidad}</span>
                      <button onClick={() => cambiarCantidad(l.clave, 1)} aria-label={`Añadir una unidad de ${l.nombre}`}
                        className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-foreground hover:bg-background active:scale-95 transition-all">
                        <Plus size={15} />
                      </button>
                    </div>
                    <span className="w-[74px] text-right text-[15px] font-bold text-foreground tabular-nums shrink-0">
                      {formatEuro(l.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lo que debe, cobrable aquí mismo.
              ⚠️ FUERA del pie a propósito: el pie entero está detrás de
              `carrito.length > 0`, y quien viene solo a pagar la cuota tiene el
              ticket VACÍO — que es justo el caso que esto resuelve. Dentro del
              pie no se habría visto nunca cuando más falta hace. */}
          {cliente && (
            <div className="shrink-0 border-t border-border px-4 pt-3 space-y-2">
              {carrito.length === 0 && (
                <button
                  onClick={() => setClienteId(null)}
                  className="w-full h-11 px-3 rounded-xl border border-border bg-background flex items-center gap-2.5 text-left"
                >
                  <User size={15} className="text-muted-foreground" />
                  <span className="flex-1 text-[14px] truncate text-foreground font-medium">
                    {cliente.nombre} {cliente.apellidos ?? ''}
                  </span>
                  <X size={14} className="text-muted-foreground" />
                </button>
              )}
              <DeudaClienta socioId={cliente.id} onCobrado={refrescar} />
            </div>
          )}

          {carrito.length > 0 && (
            <div className="shrink-0 border-t border-border p-4 space-y-3">
              {aviso && (
                <p className="rounded-xl bg-warning/10 px-3 py-2 text-[12.5px] text-warning">{aviso}</p>
              )}

              {/* Clienta */}
              <button
                onClick={() => { setVistaMovil('catalogo'); buscadorRef.current?.focus(); }}
                className={cn(
                  'w-full h-12 px-3 rounded-xl border flex items-center gap-2.5 text-left transition-colors',
                  bonoSinFicha ? 'border-warning/50 bg-warning/10' : 'border-border bg-background hover:border-foreground/30',
                )}
              >
                <User size={15} className={bonoSinFicha ? 'text-warning' : 'text-muted-foreground'} />
                <span className={cn('flex-1 text-[14px] truncate', cliente ? 'text-foreground font-medium' : bonoSinFicha ? 'text-warning font-medium' : 'text-muted-foreground')}>
                  {cliente ? `${cliente.nombre} ${cliente.apellidos ?? ''}` : bonoSinFicha ? 'Sin ficha: el bono quedará por asignar' : 'Venta sin clienta'}
                </span>
                {cliente && (
                  <span
                    role="button" tabIndex={0} aria-label="Quitar clienta"
                    onClick={(e) => { e.stopPropagation(); setClienteId(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setClienteId(null); } }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive"
                  >
                    <X size={14} />
                  </span>
                )}
              </button>


              {/* ── Descuento ───────────────────────────────────────────
                  Antes eran un icono, un número suelto y un botón «€» que
                  alternaba en silencio: mirando la pantalla no se podía saber
                  si «10» eran diez euros o el diez por ciento. Ahora la unidad
                  es un segmentado con las dos opciones a la vista, y la que
                  manda está marcada. */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    inputMode="decimal" value={descuentoTexto}
                    onChange={(e) => setDescuentoTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="Descuento" aria-label="Descuento"
                    className="w-full h-12 pl-9 pr-3 rounded-xl border border-border bg-background text-[14px] text-foreground outline-none focus:border-foreground"
                  />
                </div>
                <div role="group" aria-label="Unidad del descuento" className="flex h-12 rounded-xl border border-border bg-background overflow-hidden shrink-0">
                  {(['EUROS', 'PORCENTAJE'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setDescuentoTipo(t)}
                      aria-pressed={descuentoTipo === t}
                      aria-label={t === 'EUROS' ? 'Descuento en euros' : 'Descuento en porcentaje'}
                      className={cn(
                        'w-11 text-[15px] font-bold transition-colors',
                        descuentoTipo === t ? 'bg-foreground text-background' : 'text-muted-foreground',
                      )}
                    >
                      {t === 'EUROS' ? '€' : '%'}
                    </button>
                  ))}
                </div>
              </div>

              {codigoAplicado ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/10 px-3 h-11">
                  <span className="text-[13px] font-bold text-success truncate flex items-center gap-1.5">
                    <Ticket size={13} /> {codigoAplicado.codigo}
                  </span>
                  <button onClick={() => { setCodigoAplicado(null); setCodigoTexto(''); }} className="text-[13px] font-semibold text-success shrink-0">
                    Quitar
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      value={codigoTexto}
                      onChange={(e) => { setCodigoTexto(e.target.value.toUpperCase()); setCodigoError(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && aplicarCodigo()}
                      placeholder="Código de descuento" aria-label="Código de descuento"
                      className="flex-1 h-12 px-3 rounded-xl border border-border bg-background text-[14px] text-foreground uppercase placeholder:normal-case outline-none focus:border-foreground"
                    />
                    <button
                      onClick={aplicarCodigo} disabled={!codigoTexto.trim()}
                      className="h-12 px-4 rounded-xl border border-border bg-background text-[14px] font-semibold text-foreground disabled:opacity-40"
                    >
                      Aplicar
                    </button>
                  </div>
                  {codigoError && <p className="mt-1 text-[12px] text-destructive">{codigoError}</p>}
                </div>
              )}

              {/* ── Totales ─────────────────────────────────────────────
                  ⚠️ El IVA va INCLUIDO en el precio (un artículo de 25 € son
                  20,66 de base + 4,34 de IVA), que es lo correcto para un
                  mostrador: el precio de la etiqueta es lo que se paga.
                  Pero la columna lo pintaba como una línea más entre el
                  descuento y el total —«Subtotal 130 · Descuento −10 · IVA
                  20,83 · Total 120»— y eso se lee sumando: 130 − 10 + 20,83
                  daría 140,83, no 120. Parecía que el IVA se añadía encima.
                  Ahora se enseña la BASE junto a la cuota, para que la
                  aritmética cuadre a la vista (base + IVA = total), y el
                  bloque se separa con un título que dice que ya está dentro. */}
              <div className="space-y-1 text-[14px] pt-1">
                <Fila label="Subtotal" valor={formatEuro(ticket.subtotal)} />
                {ticket.descuento > 0 && <Fila label="Descuento" valor={`−${formatEuro(ticket.descuento)}`} tono="warning" />}
                <div className="pt-2 mt-1 border-t border-border space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Desglose (IVA ya incluido)
                  </p>
                  <Fila label="Base imponible" valor={formatEuro(ticket.baseImponible)} />
                  {/* Desglosado por tipo: un ticket con género al 21 % y una
                      clase al 10 % enseña los dos, no una media. */}
                  {ticket.porTipoIva.map((t) => (
                    <Fila key={t.ivaPct} label={`IVA ${t.ivaPct}%`} valor={formatEuro(t.cuota)} />
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-background border border-border px-4 py-3 mt-2">
                  <span className="text-[15px] font-bold text-foreground">Total</span>
                  <span className="text-[30px] leading-none font-extrabold text-foreground tabular-nums">{formatEuro(ticket.total)}</span>
                </div>
              </div>

              <button
                onClick={() => setMostrarCobro(true)}
                className="w-full h-16 rounded-2xl bg-brand text-brand-foreground text-[18px] font-extrabold active:scale-[0.99] transition-all"
              >
                {`Cobrar ${formatEuro(ticket.total)}`}
              </button>
            </div>
          )}
        </aside>
      </div>

      {mostrarCobro && (
        <HojaCobro
          total={ticket.total}
          cobroDisponible={catalogo?.cobro ?? { stripeConectado: false, datafonoEmparejado: false }}
          onCobrar={enviarVenta}
          onHecho={() => { setMostrarCobro(false); vaciar(); refrescar(); }}
          onCerrar={() => { setMostrarCobro(false); refrescar(); }}
        />
      )}

      {mostrarCaja && (
        <HojaCaja onCerrar={() => setMostrarCaja(false)} onCambio={() => { refrescar(); }} />
      )}

      {mostrarVentas && (
        <HojaVentas onCerrar={() => setMostrarVentas(false)} onCambio={() => { refrescar(); }} />
      )}
    </div>,
    anfitrionPortal(),
  );
}

/**
 * Un solo formato para los avisos de la tarjeta. Antes cada estado de stock
 * tenía su propio color y su propio sitio; esto los pone en la misma forma y
 * en la misma esquina, que es lo que deja leer una rejilla de un vistazo.
 */
function Chip({ tono, children }: { tono: 'warning' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap',
        tono === 'warning' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

/**
 * Cifra del día. SIN fondo de píldora, a propósito: llevaba el mismo relleno
 * redondeado que los botones «Ventas» y «Caja abierta» de su derecha, así que
 * tres datos de solo lectura parecían tres controles más. Un separador fino
 * las agrupa sin disfrazarlas de botón.
 */
function Metrica({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className="px-3.5 border-l border-border first:border-l-0 first:pl-0">
      <p className="text-[10.5px] uppercase tracking-wide text-muted-foreground leading-none">{label}</p>
      <p className={cn('mt-1 text-[15px] font-bold leading-none tabular-nums', destacado ? 'text-success' : 'text-foreground')}>{valor}</p>
    </div>
  );
}

function Fila({ label, valor, tono }: { label: string; valor: string; tono?: 'warning' }) {
  return (
    <div className={cn('flex justify-between', tono === 'warning' ? 'text-warning' : 'text-muted-foreground')}>
      <span>{label}</span><span className="tabular-nums">{valor}</span>
    </div>
  );
}

/**
 * Identificador de un intento de cobro. `crypto.randomUUID` no existe en
 * contextos sin HTTPS (un TPV en la red local del estudio), así que hay
 * respaldo — no puede quedarse sin nonce, porque sin él dos ventas iguales
 * volverían a colisionar.
 */
function nuevoNonce(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Hash corto y estable para la clave de idempotencia (FNV-1a, como en codigos-descuento). */
function hash(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
