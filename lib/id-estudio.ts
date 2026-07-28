// Id determinista del PRIMER estudio de una propietaria: mismo (dueña, nombre) →
// mismo id, siempre. Es lo que convierte el alta en idempotente — un segundo
// intento choca por clave primaria en vez de colarse con otro slug.
//
// En módulo aparte (como bono-logic o aforo-logic) para poder testearlo:
// supabase-data.ts arrastra el cliente de Supabase y alias `@/…` que
// `node --test` no resuelve.
//
// No es un hash criptográfico ni le hace falta: solo tiene que ser estable y no
// chocar entre propietarias distintas, y el uuid de auth ya aporta la entropía.
export function idEstudioDe(ownerAuthUserId: string, nombre: string): string {
  const semilla = `${ownerAuthUserId}|${nombre.trim().toLowerCase()}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < semilla.length; i++) {
    const c = semilla.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `studio-${h1.toString(36)}${h2.toString(36)}`;
}
