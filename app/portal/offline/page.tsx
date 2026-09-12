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
        {/* ⚠️ La MISMA cara que `OfflineState` (components/student/ui/States.tsx),
            que es lo que la alumna ve cuando se queda sin red DENTRO de la app:
            📡 sobre el disco `.avatar` de 52 px en `--accent-soft`. Esta página
            llevaba ⚡ sobre un disco gris de 56 px, así que el mismo estado
            —«Sin conexión»— tenía dos caras según dónde la pillara el corte.
            `Disco` no se importa porque no se exporta, y esta pantalla no puede
            depender de nada que no venga con ella: se replica la receta. */}
        <span
          aria-hidden
          className="avatar"
          style={{ ['--size' as string]: '52px', fontSize: 24, background: 'var(--accent-soft)', margin: '0 auto 18px' }}
        >
          📡
        </span>
        <h1 className="t-h1">Sin conexión</h1>
        {/* `t-small t-dim`, como el cuerpo de `OfflineState`, y no un 13 px a
            mano entre dos escalones de la escala. */}
        <p className="t-small t-dim" style={{ marginTop: 10, lineHeight: 1.6 }}>
          No hemos podido cargar esta pantalla. Lo que ya habías visto sigue disponible;
          para reservar o pagar hace falta conexión.
        </p>
      </div>
    </div>
  );
}
