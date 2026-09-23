'use client';

import { useEstudio } from '@/components/student/contexto';
import { inicialDe } from '@/lib/monograma-estudio';
import { Foto } from '@/components/student/ui/Foto';
import { urlServida } from '@/lib/student/imagen-servida';
import { renglonesDeAcceso } from '@/lib/student/titulo-acceso';
import { ALTO_LOGO, ANCHO_MAX_LOGO } from '@/components/student/shell/StudioHeader';

/**
 * Marco de acceso: portada fotográfica oscura arriba, formulario sobre crema
 * abajo. En ≥768px pasa a dos columnas (foto | formulario).
 *
 * Literal del paquete (`app/(auth)/layout.tsx`), con dos cambios obligados:
 * el estudio sale del contexto y no de una constante, y no llama a
 * `aplicarTema()` — el tema ya viene inyectado en servidor desde el layout de
 * `/portal/[slug]`, que envuelve también a estas pantallas.
 *
 * El `<style>` en línea es del paquete: son cuatro reglas que solo existen
 * aquí, y sacarlas a `student.css` las separaría de la única pantalla que las
 * usa. Van con el prefijo `st-` para no chocar con nada.
 */
export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  const { estudio } = useEstudio();

  return (
    <div className="st-auth">
      <style>{`
        .st-auth{min-height:100dvh;display:flex;flex-direction:column;background:var(--background)}
        .st-auth-hero{position:relative;height:38vh;min-height:250px;overflow:hidden;background:#0F0F0C;flex:none}
        .st-auth-body{flex:1;padding:22px 22px calc(24px + var(--safe-bottom));max-width:480px;width:100%;margin:0 auto}
        @media(min-width:768px){.st-auth{flex-direction:row}.st-auth-hero{height:auto;min-height:100dvh;flex:1 1 50%}.st-auth-body{flex:0 0 480px;display:flex;flex-direction:column;justify-content:center;padding:40px}}
      `}</style>

      <div className="st-auth-hero">
        {estudio.fotoPortada && (
          <Foto
            src={estudio.fotoPortada}
            ancho={640}
            alto={800}
            sizes="(min-width:768px) 50vw, 100vw"
            prioritaria
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center var(--portada-y, 40%)', animation: 'apKen 22s ease-in-out infinite' }}
          />
        )}
        {/* Velo neutro, no teñido: el diseño deja la foto en su color y el
            contraste lo pone el degradado. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,8,8,.45), rgba(8,8,8,.05) 35%, rgba(8,8,8,.7))' }} />

        <div style={{ position: 'absolute', top: 'calc(18px + var(--safe-top))', left: 22, display: 'flex', alignItems: 'center', gap: 9, color: 'var(--on-dark)' }}>
          {estudio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlServida(estudio.logoUrl, ANCHO_MAX_LOGO)} alt="" decoding="async" style={{ height: ALTO_LOGO, maxWidth: ANCHO_MAX_LOGO, objectFit: 'contain' }} />
          ) : (
            <span style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(250,249,245,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-meta)', fontWeight: 800 }}>
              {inicialDe(estudio.nombre)}
            </span>
          )}
          <span style={{ fontSize: 'var(--t-h3)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.02em' }}>{estudio.nombre}</span>
        </div>

        <div style={{ position: 'absolute', left: 22, right: 22, bottom: 22, color: 'var(--on-dark)' }}>
          <p className="t-label a-up" style={{ color: 'rgba(250,249,245,.75)' }}>
            {/* El backend no clasifica el estudio por disciplina, así que la
                línea es solo la ciudad cuando no hay nada más que decir. */}
            {estudio.ciudad}
          </p>
          {/* Lo escribe el estudio en «Apariencia de tu app»; vacío = el del
              producto, porque esta pantalla no puede quedarse muda. */}
          <h1 className="a-up" style={{ margin: '10px 0 0', fontSize: 34, fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.03em', lineHeight: 1.06, animationDelay: '80ms' }}>
            {renglonesDeAcceso(estudio.tituloAcceso).map((linea, i) => (
              <span key={linea + i} style={{ display: 'block' }}>{linea}</span>
            ))}
          </h1>
        </div>
      </div>

      <div className="st-auth-body">{children}</div>
    </div>
  );
}
