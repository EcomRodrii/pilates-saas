'use client';

import { useEstudio } from '@/components/student/contexto';
import { inicialDe } from '@/lib/monograma-estudio';

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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={estudio.fotoPortada}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%', animation: 'apKen 22s ease-in-out infinite' }}
          />
        )}
        {/* Velo neutro, no teñido: el diseño deja la foto en su color y el
            contraste lo pone el degradado. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,8,8,.45), rgba(8,8,8,.05) 35%, rgba(8,8,8,.7))' }} />

        <div style={{ position: 'absolute', top: 'calc(18px + var(--safe-top))', left: 22, display: 'flex', alignItems: 'center', gap: 9, color: '#FAF9F5' }}>
          {estudio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={estudio.logoUrl} alt="" style={{ height: 26 }} />
          ) : (
            <span style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(250,249,245,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800 }}>
              {inicialDe(estudio.nombre)}
            </span>
          )}
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em' }}>{estudio.nombre}</span>
        </div>

        <div style={{ position: 'absolute', left: 22, right: 22, bottom: 22, color: '#FAF9F5' }}>
          <p className="t-label a-up" style={{ color: 'rgba(250,249,245,.75)' }}>
            {/* El backend no clasifica el estudio por disciplina, así que la
                línea es solo la ciudad cuando no hay nada más que decir. */}
            {estudio.ciudad}
          </p>
          <h1 className="a-up" style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.06, animationDelay: '80ms' }}>
            Muévete.<br />Lo demás,<br />ya está.
          </h1>
        </div>
      </div>

      <div className="st-auth-body">{children}</div>
    </div>
  );
}
