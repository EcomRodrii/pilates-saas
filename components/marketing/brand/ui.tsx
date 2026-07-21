import type { ReactNode, CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import './brand.css';

// Átomos de UI del sistema de marca de marketing. Presentacionales (server
// components): sin estado ni efectos, solo estilo. Los estilos con :hover/:focus
// viven en brand.css (clases .mkt-*); estos componentes solo aplican la clase.

/** Eyebrow: label mono en mayúsculas con punto de degradado. */
export function Eyebrow({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`mkt-eyebrow${className ? ` ${className}` : ''}`} style={style}>
      <span className="mkt-eyebrow__dot" aria-hidden />
      {children}
    </span>
  );
}

/** Fragmento de texto con relleno de degradado de marca. */
export function GradientText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="mkt-grad-text" style={style}>{children}</span>;
}

/** CTA principal (degradado) o secundario (ghost). Enlace de Next. */
export function BrandButton({
  href,
  children,
  variant = 'primary',
  size,
  external,
  style,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  size?: 'sm';
  external?: boolean;
  style?: CSSProperties;
}) {
  const cls = `mkt-btn mkt-btn--${variant}${size === 'sm' ? ' mkt-btn--sm' : ''}`;
  if (external) {
    return <a href={href} className={cls} style={style}>{children}</a>;
  }
  return <Link href={href} className={cls} style={style}>{children}</Link>;
}

/** Enlace de marca (subrayado teal). */
export function BrandLink({ href, children, style }: { href: string; children: ReactNode; style?: CSSProperties }) {
  return <Link href={href} className="mkt-link" style={style}>{children}</Link>;
}

/** Halo ambiental de degradado. Posiciónalo con `style` (top/right/width…). */
export function Halo({ style }: { style?: CSSProperties }) {
  return <div className="mkt-halo" aria-hidden style={style} />;
}

/** Tarjeta base de marca. */
export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`mkt-card${className ? ` ${className}` : ''}`} style={style}>{children}</div>;
}

/**
 * Marco de navegador para enseñar CAPTURAS REALES del producto. Pásale `src` +
 * las dimensiones naturales (`width`/`height`) de la captura, o —mientras no la
 * haya— `children` con un mockup provisional. `url` es la barra de direcciones.
 */
export function DeviceFrame({
  src,
  alt,
  width,
  height,
  priority,
  url = 'estudio.tentare.app',
  children,
  style,
}: {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  url?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="mkt-device" style={style}>
      <div className="mkt-device__bar">
        <div className="mkt-device__dots"><i /><i /><i /></div>
        <div className="mkt-device__url">{url}</div>
      </div>
      {src && width && height
        ? (
          <Image
            className="mkt-device__shot"
            src={src}
            alt={alt ?? 'Captura del producto Tentare'}
            width={width}
            height={height}
            sizes="(max-width: 900px) 100vw, 560px"
            priority={priority}
            style={{ width: '100%', height: 'auto' }}
          />
        )
        : children}
    </div>
  );
}
