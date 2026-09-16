'use client';

import { Fragment, useId, useMemo, useState } from 'react';
import { Check, Download, QrCode } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { btnPrimary, btnSecondary } from '@/components/configuracion/estilos';
import { fetchThemePublicado } from '@/lib/api-client';
import { foregroundParaFondo } from '@/lib/wcag-contrast';
import {
  A4, BLANCO, COLOR_CODIGO_POR_DEFECTO, cartelPdf, codigoLegible, nombreArchivoQr, normalizarHex, svgCartel, svgQr, tramosQr,
  urlLegible, type ColoresCartel, type DestinoQr,
} from '@/lib/qr/escaparate';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// El código QR de un enlace del estudio: la vista previa del cartel tal y como
// se imprime, sus colores y las descargas. Todo se genera aquí, en el navegador:
// no sube nada a ningún sitio.
//
// Los colores los elige el estudio. Arranca con los de su marca (el tema, que es
// donde vive el color de verdad: `studios.color_primario` está muerta), y lo que
// elija se recuerda en este navegador para que los carteles de sus tres enlaces
// salgan iguales.
// ─────────────────────────────────────────────────────────────────────────────

/** El oliva de Tentare: el panel de un estudio sin tema propio se ve así. */
const MARCA_POR_DEFECTO = '#343825';
const NEGRO = COLOR_CODIGO_POR_DEFECTO;
/** El cartel en imagen, a 200 ppp: nítido impreso y de sobra para una historia. */
const ESCALA_PNG_CARTEL = 200 / 72;
/** Solo el código: de sobra para imprimirlo a 20 cm a 250 ppp. */
const LADO_PNG_CODIGO = 2048;

interface Marca { primario: string; secundario: string | null }

function marcaCacheada(): Marca | null {
  try {
    const tema = JSON.parse(localStorage.getItem('panel-theme-cache') ?? 'null') as { primary?: string; secondary?: string } | null;
    const primario = normalizarHex(tema?.primary);
    return primario ? { primario, secundario: normalizarHex(tema?.secondary) } : null;
  } catch {
    return null;
  }
}

const claveColores = (slug: string) => `qr-cartel-colores:${slug}`;

function coloresGuardados(slug: string): Partial<ColoresCartel> {
  try {
    const guardado = JSON.parse(localStorage.getItem(claveColores(slug)) ?? '{}') as Partial<ColoresCartel>;
    const fondo = normalizarHex(guardado.fondo);
    const codigo = normalizarHex(guardado.codigo);
    return { ...(fondo ? { fondo } : {}), ...(codigo && codigoLegible(codigo) ? { codigo } : {}) };
  } catch {
    return {};
  }
}

function guardarColores(slug: string, colores: Partial<ColoresCartel>) {
  try {
    localStorage.setItem(claveColores(slug), JSON.stringify(colores));
  } catch {
    // Sin almacenamiento solo se pierde recordarlos la próxima vez.
  }
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari aún está leyendo el blob cuando vuelve el clic: se suelta más tarde.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function lienzoABlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, mal) => canvas.toBlob(b => (b ? ok(b) : mal(new Error('sin png'))), 'image/png'));
}

/** El cartel en PNG: el mismo SVG de la vista previa, pintado en un lienzo. */
async function pngCartel(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(A4.ancho * ESCALA_PNG_CARTEL);
    canvas.height = Math.round(A4.alto * ESCALA_PNG_CARTEL);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('sin canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await lienzoABlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Solo el código, módulo a módulo a un número entero de píxeles: nítido, sin suavizado. */
function pngCodigo(url: string, color: string): Promise<Blob> {
  const { lado, tramos } = tramosQr(url);
  const px = Math.floor(LADO_PNG_CODIGO / lado);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px * lado;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('sin canvas'));
  ctx.fillStyle = BLANCO;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  for (const t of tramos) ctx.fillRect(t.x * px, t.y * px, t.ancho * px, px);
  return lienzoABlob(canvas);
}

interface Opcion { nombre: string; hex: string }

/** Sin repetidos: si el segundo color de la marca es el negro, sale una vez. */
function unicas(opciones: (Opcion | null)[]): Opcion[] {
  const resultado: Opcion[] = [];
  for (const o of opciones) if (o && !resultado.some(r => r.hex === o.hex)) resultado.push(o);
  return resultado;
}

function SelectorColor({ titulo, opciones, valor, otro, onElegir, aviso }: {
  titulo: string;
  opciones: Opcion[];
  valor: string;
  /** Nombre accesible del selector libre: «Otro color para el fondo». */
  otro: string;
  onElegir: (hex: string) => void;
  aviso?: string | null;
}) {
  const tituloId = useId();
  const libre = !opciones.some(o => o.hex === valor);
  return (
    <div className="flex flex-col gap-2">
      <span id={tituloId} className="text-[13px] font-semibold text-foreground">{titulo}</span>
      <div role="radiogroup" aria-labelledby={tituloId} className="flex flex-wrap items-center gap-2.5">
        {opciones.map(o => {
          const elegido = o.hex === valor;
          return (
            <button
              key={o.hex}
              type="button"
              role="radio"
              aria-checked={elegido}
              aria-label={o.nombre}
              title={o.nombre}
              onClick={() => onElegir(o.hex)}
              className={cn(
                'relative size-10 rounded-full ring-1 ring-inset ring-foreground/15 transition-transform [@media(pointer:fine)]:size-8 [@media(pointer:fine)]:hover:scale-110',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                elegido && 'outline-2 outline-offset-2 outline-foreground',
              )}
              style={{ backgroundColor: o.hex }}
            >
              {elegido && <Check size={15} strokeWidth={2.5} className="absolute inset-0 m-auto" style={{ color: foregroundParaFondo(o.hex) }} aria-hidden />}
            </button>
          );
        })}
        {/* El libre: el arcoíris hasta que se usa, y luego el color elegido. */}
        <span
          className={cn(
            'relative size-10 rounded-full ring-1 ring-inset ring-foreground/15 [@media(pointer:fine)]:size-8 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
            libre && 'outline-2 outline-offset-2 outline-foreground',
          )}
          style={libre
            ? { backgroundColor: valor }
            : { backgroundImage: 'conic-gradient(#ef4444, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #ef4444)' }}
          title={otro}
        >
          <input
            type="color"
            aria-label={otro}
            value={valor.toLowerCase()}
            onChange={e => onElegir(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
          />
          {libre && <Check size={15} strokeWidth={2.5} className="pointer-events-none absolute inset-0 m-auto" style={{ color: foregroundParaFondo(valor) }} aria-hidden />}
        </span>
      </div>
      {aviso && <p role="alert" className="text-[12px] text-destructive text-pretty">{aviso}</p>}
    </div>
  );
}

function BloqueDescarga({ titulo, detalle, children }: { titulo: string; detalle: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        <p className="text-[12px] text-muted-foreground text-pretty">{detalle}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

type Descarga = 'cartel-pdf' | 'cartel-png' | 'codigo-png' | 'codigo-svg';

export function BotonQr({ destino, url, slug, estudio, nombreEnlace }: {
  destino: DestinoQr;
  url: string;
  slug: string;
  estudio: string;
  /** Cómo se llama el enlace en la lista («Página de reservas»…), para el título. */
  nombreEnlace: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [marca, setMarca] = useState<Marca | null>(null);
  // `undefined` = aún no ha elegido: manda la marca.
  const [elegidos, setElegidos] = useState<Partial<ColoresCartel>>({});
  const [avisoCodigo, setAvisoCodigo] = useState<string | null>(null);
  const [preparando, setPreparando] = useState<Descarga | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const primario = marca?.primario ?? MARCA_POR_DEFECTO;
  const colores: ColoresCartel = { fondo: elegidos.fondo ?? primario, codigo: elegidos.codigo ?? NEGRO };

  const abrir = () => {
    setMarca(marcaCacheada());
    setElegidos(coloresGuardados(slug));
    setAvisoCodigo(null);
    setFallo(null);
    setAbierto(true);
    // La caché del panel puede ir un tema por detrás: se confirma con el de verdad.
    fetchThemePublicado()
      .then(tema => {
        const p = normalizarHex(tema.primary);
        if (p) setMarca({ primario: p, secundario: normalizarHex(tema.secondary) });
      })
      .catch(() => { /* sin red: se queda la caché o el oliva */ });
  };

  const elegir = (cambio: Partial<ColoresCartel>) => {
    const siguientes = { ...elegidos, ...cambio };
    setElegidos(siguientes);
    guardarColores(slug, siguientes);
  };

  const elegirCodigo = (hex: string) => {
    const color = normalizarHex(hex);
    if (!color) return;
    if (!codigoLegible(color)) {
      setAvisoCodigo('Ese color es demasiado claro para el código: el móvil podría no leerlo. Elige uno más oscuro.');
      return;
    }
    setAvisoCodigo(null);
    elegir({ codigo: color });
  };

  const etiqueta = `Cartel con el código QR de ${nombreEnlace}`;
  const svg = useMemo(
    () => (abierto ? svgCartel({ estudio, destino, url, colores: { fondo: colores.fondo, codigo: colores.codigo } }, etiqueta) : ''),
    [abierto, estudio, destino, url, colores.fondo, colores.codigo, etiqueta],
  );

  const opcionesFondo = unicas([
    { nombre: 'El color de tu marca', hex: primario },
    marca?.secundario ? { nombre: 'Tu segundo color', hex: marca.secundario } : null,
    { nombre: 'Negro', hex: NEGRO },
    { nombre: 'Blanco', hex: BLANCO },
  ]);
  const opcionesCodigo = unicas([
    { nombre: 'Negro', hex: NEGRO },
    codigoLegible(primario) ? { nombre: 'El color de tu marca', hex: primario } : null,
    marca?.secundario && codigoLegible(marca.secundario) ? { nombre: 'Tu segundo color', hex: marca.secundario } : null,
  ]);

  const bajar = async (que: Descarga) => {
    setFallo(null);
    setPreparando(que);
    try {
      const datos = { estudio, destino, url, colores };
      if (que === 'cartel-pdf') {
        descargar(new Blob([cartelPdf(datos) as BlobPart], { type: 'application/pdf' }), nombreArchivoQr(destino, slug, 'cartel', 'pdf'));
      } else if (que === 'cartel-png') {
        descargar(await pngCartel(svgCartel(datos, etiqueta)), nombreArchivoQr(destino, slug, 'cartel', 'png'));
      } else if (que === 'codigo-png') {
        descargar(await pngCodigo(url, colores.codigo), nombreArchivoQr(destino, slug, 'codigo', 'png'));
      } else {
        descargar(new Blob([svgQr(url, `Código QR de ${nombreEnlace}`, colores.codigo)], { type: 'image/svg+xml' }), nombreArchivoQr(destino, slug, 'codigo', 'svg'));
      }
    } catch {
      setFallo('No se ha podido preparar el archivo. Vuelve a intentarlo.');
    } finally {
      setPreparando(null);
    }
  };

  // El nombre accesible CONTIENE lo que se lee en el botón («PNG») y añade de
  // qué es: hay dos «PNG» en la misma pantalla.
  const botonDescarga = (que: Descarga, texto: string, contexto: string, principal = false) => (
    <button
      type="button"
      onClick={() => { void bajar(que); }}
      disabled={preparando !== null}
      className={cn(principal ? btnPrimary : btnSecondary, 'inline-flex items-center gap-1.5')}
    >
      <Download size={14} aria-hidden />
      <span className="sr-only">{contexto} </span>
      {preparando === que ? 'Preparando…' : texto}
    </button>
  );

  return (
    <>
      <button type="button" onClick={abrir} className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}>
        <QrCode size={14} aria-hidden /> Código QR
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-[50rem]">
          <div className="grid sm:grid-cols-[20rem_minmax(0,1fr)]">
            <figure className="flex flex-col items-center justify-center gap-3 bg-muted px-6 pt-8 pb-5 sm:px-7 sm:py-8">
              <div
                data-testid="vista-cartel"
                className="w-36 overflow-hidden rounded-[3px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_18px_40px_-16px_rgb(0_0_0/0.45)] sm:w-full [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                // Marcado generado aquí mismo (lib/qr/escaparate.ts): el nombre del estudio va escapado.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <figcaption className="text-center text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                {/* Se parte por las barras, no a mitad de palabra. */}
                {urlLegible(url).split('/').map((parte, i) => (
                  <Fragment key={i}>{i > 0 && <>/<wbr /></>}{parte}</Fragment>
                ))}
              </figcaption>
            </figure>

            <div className="flex flex-col gap-5 p-5 sm:p-6">
              <DialogHeader className="pr-8">
                <DialogTitle>Código QR · {nombreEnlace}</DialogTitle>
                <DialogDescription>
                  Para el escaparate, la puerta o tus folletos: quien lo escanea con el móvil llega sin escribir nada.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <SelectorColor
                  titulo="Fondo del cartel"
                  opciones={opcionesFondo}
                  valor={colores.fondo}
                  otro="Otro color para el fondo"
                  onElegir={hex => { const c = normalizarHex(hex); if (c) elegir({ fondo: c }); }}
                />
                <SelectorColor
                  titulo="Color del código"
                  opciones={opcionesCodigo}
                  valor={colores.codigo}
                  otro="Otro color para el código"
                  onElegir={elegirCodigo}
                  aviso={avisoCodigo}
                />
              </div>

              <div className="flex flex-col gap-3">
                <BloqueDescarga titulo="Cartel para el escaparate" detalle="A4 con el nombre de tu estudio y tus colores, listo para imprimir.">
                  {botonDescarga('cartel-pdf', 'PDF para imprimir', 'Descargar el cartel:', true)}
                  {botonDescarga('cartel-png', 'Imagen PNG', 'Descargar el cartel:')}
                </BloqueDescarga>
                <BloqueDescarga titulo="Solo el código" detalle="Para tus folletos, tarjetas o para quien te hace el diseño.">
                  {botonDescarga('codigo-png', 'PNG', 'Descargar solo el código:')}
                  {botonDescarga('codigo-svg', 'SVG', 'Descargar solo el código:')}
                </BloqueDescarga>
              </div>
              {fallo && <p role="alert" className="text-[13px] text-destructive">{fallo}</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
