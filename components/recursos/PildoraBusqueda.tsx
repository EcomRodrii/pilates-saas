// La búsqueda que responde una página, dentro de su h1 y con la forma de la
// píldora pequeña que antes iba suelta encima («Precios», «Funcionalidades»).
// El titular grande sigue siendo la frase con gancho; esta línea es la que le
// dice a quien busca —y a Google— de qué trata la página. Mismo criterio que el
// h1 de la home y que `busqueda` en FeatureShell.
export function PildoraBusqueda({ children, centrada = false }: { children: React.ReactNode; centrada?: boolean }) {
  // El espacio de después no se ve (la píldora es un bloque), pero sin él el
  // texto del h1 sale pegado («…de yogaTu estudio…») para quien lo lee como texto.
  return (
    <>
    {/* Sin letra de máquina de escribir ni mayúsculas (#2458, «sin pinta de IA»):
        la sans de la web, en oliva sobre arena clara (tokens de components/web). */}
    <span
      style={{
        display: 'table',
        margin: centrada ? '0 auto 24px' : '0 0 24px',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.45,
        // Dentro de un h1: sin esto hereda su tracking negativo y se apiña.
        letterSpacing: 'normal',
        color: 'var(--w-olive)',
        background: 'var(--w-sand-claro)',
        padding: '7px 14px',
        borderRadius: 999,
      }}
    >
      {children}
    </span>{' '}
    </>
  );
}
