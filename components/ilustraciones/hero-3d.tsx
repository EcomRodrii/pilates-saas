import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Las imágenes grandes de las pantallas vacías del marco nuevo (25-nov-2026): dos o tres objetos 3D apilados sobre un
// resplandor pastel, como las de Shopify. Entran escalonados y flotan despacio (la campana, en vez de flotar, suena cada pocos
// segundos); con «reducir movimiento», quietos
// (animaciones en app/estilos/panel-sistema.css).
//
// Origen: 3dicons.co, licencia CC0 (uso comercial sin atribución, según su web y la ficha de cada icono, comprobado el
// 25-nov-2026). Descargados en PNG de 2400 px, recortados a 640 px y pasados a WebP en public/ilustraciones/3d/.
// Decorativas: `alt` vacío, el texto de la pantalla es lo que se lee.
// ─────────────────────────────────────────────────────────────────────────────

type Pieza =
  | 'bell' | 'boy' | 'calendar' | 'chart' | 'chat-bubble' | 'clock' | 'computer' | 'credit-card' | 'cube' | 'folder'
  | 'gift-box' | 'girl' | 'mobile' | 'notebook' | 'wallet';

/** [pieza, centro x %, centro y %, ancho %]. La primera va al fondo; la última, delante. */
type Colocada = readonly [Pieza, number, number, number];

export const ESCENAS_3D = {
  // Sin globo de chat: detrás o delante de las dos figuras se leía como una mancha.
  clientes: [['boy', 65, 51, 52], ['girl', 36, 50, 60]],
  calendario: [['calendar', 46, 58, 76], ['clock', 70, 34, 40]],
  paquetes: [['gift-box', 66, 34, 42], ['wallet', 44, 62, 70], ['credit-card', 66, 74, 40]],
  cobros: [['wallet', 42, 44, 68], ['credit-card', 62, 68, 60]],
  informes: [['computer', 32, 52, 52], ['chart', 62, 56, 58]],
  mensajeria: [['mobile', 46, 68, 72], ['chat-bubble', 34, 34, 38], ['bell', 71, 36, 34]],
  equipo: [['notebook', 50, 76, 54], ['boy', 66, 44, 46], ['girl', 34, 46, 50]],
  citas: [['notebook', 44, 60, 70], ['clock', 70, 36, 40]],
  automatizaciones: [['cube', 28, 62, 34], ['clock', 52, 48, 56], ['bell', 76, 62, 36]],
  integraciones: [['computer', 62, 44, 52], ['folder', 36, 60, 52], ['cube', 70, 74, 28]],
  sustituciones: [['girl', 28, 52, 48], ['boy', 72, 52, 48], ['clock', 50, 66, 34]],
  vacio: [['folder', 44, 54, 62], ['cube', 70, 70, 30]],
  avisos: [['mobile', 46, 64, 74], ['bell', 62, 38, 44]],
  salas: [['cube', 40, 52, 58], ['clock', 70, 66, 36]],
  horario: [['calendar', 60, 60, 66], ['clock', 36, 44, 46]],
  marca: [['cube', 36, 56, 48], ['gift-box', 66, 52, 50]],
  fiscales: [['folder', 40, 52, 58], ['notebook', 66, 68, 46]],
} as const satisfies Record<string, readonly Colocada[]>;

export type Escena3D = keyof typeof ESCENAS_3D;

export function Hero3D({ escena, className }: { escena: Escena3D; className?: string }) {
  return (
    <div aria-hidden="true" data-hero-3d={escena} className={cn('hero3d pointer-events-none relative aspect-[4/3] w-full select-none', className)}>
      <span className="hero3d-resplandor" />
      {ESCENAS_3D[escena].map(([pieza, x, y, ancho], i) => (
        <span key={pieza} className="hero3d-entra absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%`, width: `${ancho}%`, ['--orden' as string]: i }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- WebP pequeño y ya recortado; next/image no aporta nada aquí */}
          <img src={`/ilustraciones/3d/${pieza}.webp`} alt="" width={665} height={665} loading="lazy" decoding="async" className={cn(pieza === 'bell' ? 'hero3d-campana' : 'hero3d-flota', 'block h-auto w-full')} />
        </span>
      ))}
    </div>
  );
}
