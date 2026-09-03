import type { Metadata } from 'next';
// ⚠️ La hoja se importa AQUÍ y no se hereda del layout de `[slug]`: esta ruta
// vive fuera de ese segmento a propósito (no tiene slug), así que ese layout
// nunca corre. Sin este import la pantalla salía con la paleta del PANEL
// —fondo #EEEEE8 en vez del #FAF9F5 del kit— y sin ninguna de las clases
// `.t-h1`/`.t-meta` que usa abajo. Es justo la pantalla que se ve sin red, o
// sea la que no puede depender de nada que no venga con ella.
import '../[slug]/student.css';

export const metadata: Metadata = { title: 'Sin conexión', robots: { index: false, follow: false } };

// Pantalla de respaldo del service worker. Sin slug a propósito: tiene que
// poder servirse desde la caché cuando no hay red, y resolver un estudio exige
// consultar la base de datos.
//
// Por eso tampoco usa el shell: `StudentShell` necesita el contexto del
// estudio. Aquí se pintan los tokens del kit a mano sobre `.student-app`.
export default function OfflinePage() {
  return (
    <div className="student-app" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div
          aria-hidden
          style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 22 }}
        >
          ⚡
        </div>
        <h1 className="t-h1">Sin conexión</h1>
        <p className="t-meta" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
          No hemos podido cargar esta pantalla. Lo que ya habías visto sigue disponible;
          para reservar o pagar hace falta conexión.
        </p>
      </div>
    </div>
  );
}
