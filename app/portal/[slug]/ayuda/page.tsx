'use client';

import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { ProfileSection } from '@/components/student/domain/ProfileSection';

// Ayuda (§A.20): contacto del estudio y las preguntas que de verdad hacen.
//
// Las respuestas usan la política del estudio, no un número inventado. Y el
// contacto sale de los campos públicos: si el estudio no ha puesto teléfono, la
// fila no se pinta — mejor que un enlace `tel:` vacío.
export default function AyudaPage() {
  const { estudio } = useEstudio();

  const contacto = [
    estudio.telefono && {
      label: 'Llamar al estudio',
      href: `tel:${estudio.telefono.replace(/\s/g, '')}`,
      valor: estudio.telefono,
    },
    estudio.email && { label: 'Escribir un email', href: `mailto:${estudio.email}`, valor: estudio.email },
    estudio.direccion && {
      label: 'Cómo llegar',
      href: `https://maps.google.com/?q=${encodeURIComponent(`${estudio.direccion} ${estudio.ciudad}`)}`,
      valor: estudio.direccion,
    },
  ].filter(Boolean) as { label: string; href: string; valor: string }[];

  const faq: Array<[string, string]> = [
    ['¿Cómo cancelo una clase?', `Desde Mis clases → Cancelar. Si faltan más de ${estudio.politicaCancelacionHoras} h, normalmente recuperas la sesión de tu bono; el estudio puede tener una regla distinta para algún tipo de clase.`],
    ['¿Qué pasa si la clase está llena?', 'Puedes apuntarte a la lista de espera. Te avisamos al momento si se libera una plaza y decides si la quieres.'],
    ['¿Cómo funciona el pase de acceso?', 'Al entrar al estudio, abre tu reserva: el pase se valida solo. No necesitas imprimir nada, y caduca cada dos minutos por seguridad.'],
    ['¿Caducan los bonos?', 'Depende del bono; lo ves en Bonos → detalle. Te avisamos antes de que caduque.'],
    ['¿Puedo cambiar mi email?', 'Todavía no desde aquí: escríbele al estudio y lo cambian ellos. Es para que tu email de acceso y el de tu ficha no se separen.'],
  ];

  return (
    <StudentShell>
      <PageHeader titulo="Ayuda" sub={estudio.nombre} back />
      <div className="px grid-lg-2" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
        {contacto.length > 0 && <ProfileSection titulo="Contacto" items={contacto} />}

        <section>
          <p className="t-label" style={{ margin: '0 0 7px' }}>Preguntas frecuentes</p>
          <div className="card" style={{ overflow: 'hidden' }}>
            {faq.map(([q, a], i) => (
              <details key={q} style={{ borderBottom: i < faq.length - 1 ? '1px solid var(--muted)' : 'none' }}>
                <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '13px 15px', fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  {q}<span aria-hidden style={{ color: 'var(--accent)' }}>+</span>
                </summary>
                <p style={{ margin: 0, padding: '0 15px 13px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted-foreground)' }}>{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </StudentShell>
  );
}
