// ─────────────────────────────────────────────────────────────────────────────
// Calendario — minutos del día a texto: «09:30» y «en 20 min».
// ─────────────────────────────────────────────────────────────────────────────

// Exportada: lib/calendario-arrastre.ts (y su caller en page.tsx) la
// reutilizan para convertir el nuevo horario arrastrado a "HH:MM" — evita
// duplicar esta conversión ya escrita.
export function mmA(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function faltaTexto(minutos: number): string {
  if (minutos < 60) return `en ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const r = minutos % 60;
  return `en ${h} h${r ? ` ${r}` : ''}`;
}
