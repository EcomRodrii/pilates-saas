// El validador zod, derivado del schema de campos.
//
// Único módulo del motor que importa zod, a propósito: `campos.ts` lo importan
// las tres vistas del portal y meterle zod engordaría su bundle sin que
// ninguna de ellas valide nada (validar es cosa del servidor al guardar).
//
// Cierra la última de las cuatro copias de la misma forma. Las otras tres ya
// salen del schema: el tipo (`ConfigDe<>`), los defaults (`defaultsDe`) y —
// en cuanto llegue el Inspector genérico — el formulario. El zod escrito a
// mano era el más peligroso de los cuatro porque su divergencia no se ve al
// revisar: un campo que falta aquí no da error, simplemente **se poda en el
// siguiente guardado** y la propietaria pierde lo que había escrito.

import { z } from 'zod';
import type { CampoSchema } from './campos.ts';

function zodDeCampo(campo: CampoSchema): z.ZodTypeAny {
  switch (campo.tipo) {
    case 'texto':
    case 'textoLargo':
    // `textoRico` guarda la marca TAL CUAL la escribe la propietaria: la
    // interpretación (y el filtrado de enlaces) ocurre en el render, no al
    // guardar. Validar aquí la sintaxis rechazaría un texto a medio marcar.
    case 'textoRico':
    case 'url':
    case 'imagen':
    case 'color':
      // A propósito `z.string()` pelado y no `.url()`/hex estricto: el
      // borrador se guarda mientras la propietaria teclea, y a medio escribir
      // casi nada valida. Quien decide si un valor se aplica o se hereda es el
      // render. Mismo criterio que tenía el zod escrito a mano.
      return z.string();
    case 'colorHeredado':
      return z.string().nullable();
    case 'booleano':
      return z.boolean();
    case 'numero':
      return z.number();
    case 'numeroHeredado':
      return z.number().nullable();
    case 'opciones':
    case 'select': {
      const ids = campo.opciones.map((o) => o.id);
      return z.enum(ids as [string, ...string[]]);
    }
    case 'lista':
      return z.array(zodDeCampos(campo.campos));
  }
}

/**
 * Un `z.object` con una clave por campo. `todoOpcional` es para `estilo`,
 * donde "ausente" significa "hereda del tema" y no puede volverse obligatorio.
 */
export function zodDeCampos(
  campos: readonly CampoSchema[],
  opciones?: { todoOpcional?: boolean },
): z.ZodObject<z.ZodRawShape> {
  // `Record<...>` mutable y no `z.ZodRawShape`: en zod 4 ese tipo es
  // `Readonly<...>` y no deja escribir por índice.
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const campo of campos) {
    const base = zodDeCampo(campo);
    shape[campo.id] = opciones?.todoOpcional ? base.optional() : base;
  }
  return z.object(shape);
}

/**
 * El validador de UN bloque, derivado del registro: la unión discriminada por
 * `kind` de los `sistema` más una entrada por bloque del catálogo.
 *
 * Se construye una sola vez al importar el módulo, no por llamada.
 */
export function zodDeBloques(
  definiciones: readonly DefinicionBloqueParaZod[],
  sistemaIds: readonly string[],
  camposEstilo: readonly CampoSchema[],
): z.ZodTypeAny {
  const estilo = zodDeCampos(camposEstilo, { todoOpcional: true }).optional();
  // Los bloques de sistema también tienen config: sus textos (el título de
  // "Esta semana", el titular de "Invita a una amiga"…) dejaron de estar
  // escritos a fuego en el render. Se valida por `sistemaId`, con el schema de
  // cada uno, en vez de con un `record` permisivo: si no, un guardado podaría
  // o dejaría pasar cualquier cosa y el schema no sería la fuente de verdad.
  const porSistemaId = new Map(
    definiciones.filter((d) => d.origen === 'sistema' && d.sistemaId).map((d) => [d.sistemaId!, d.campos]),
  );
  const sistema = z.object({
    id: z.string(),
    kind: z.literal('sistema'),
    sistemaId: z.enum(sistemaIds as [string, ...string[]]),
    oculto: z.boolean().optional(),
    // ⚠️ Sin esta línea, zod PODA la marca al guardar y el bloque fijo vuelve
    // a ser arrastrable en la siguiente carga — el fallo silencioso que
    // advierte la regla de retrocompatibilidad de portal-home-bloques.ts.
    fijo: z.literal(true).optional(),
    // Mismo motivo, mismo mecanismo — ver `esBloqueOcultable` en
    // portal-home-bloques.ts: un `fijo` que SÍ se puede ocultar (Portada de
    // /reservar) también viaja en el dato, no en una tabla aparte.
    fijoOcultable: z.literal(true).optional(),
    // `.optional()` porque los que todavía no tienen campos abiertos no
    // guardan config ninguna, y los guardados de antes tampoco la traen.
    config: z.record(z.string(), z.unknown()).optional(),
  }).superRefine((val, ctx) => {
    const campos = porSistemaId.get(val.sistemaId);
    if (!campos || campos.length === 0 || val.config === undefined) return;
    const r = zodDeCampos(campos, { todoOpcional: true }).safeParse(val.config);
    if (!r.success) ctx.addIssue({ code: 'custom', message: `config inválida para ${val.sistemaId}` });
  });
  const catalogo = definiciones
    .filter((d) => d.origen === 'catalogo')
    .map((d) => {
      const base = {
        id: z.string(),
        kind: z.literal(d.id),
        oculto: z.boolean().optional(),
        estilo,
        config: zodDeCampos(d.campos),
      };
      // Los hijos se validan con el schema de SU propio kind, y sin `hijos`
      // dentro — el nivel único queda garantizado también aquí, no solo en el
      // tipo: si el jsonb trae un tercer nivel, zod lo poda al guardar.
      if (!d.hijos) return z.object(base);
      const admitidos = definiciones.filter((x) => d.hijos!.admite.includes(x.id));
      const hijo = z.discriminatedUnion('kind', admitidos.map((x) => z.object({
        id: z.string(),
        kind: z.literal(x.id),
        oculto: z.boolean().optional(),
        estilo,
        config: zodDeCampos(x.campos),
      })) as unknown as [z.ZodObject<z.ZodRawShape>, z.ZodObject<z.ZodRawShape>, ...z.ZodObject<z.ZodRawShape>[]]);
      return z.object({ ...base, hijos: z.array(hijo).optional() });
    });
  // `discriminatedUnion` necesita al menos dos miembros y no acepta un array
  // de tipo genérico, de ahí el cast. Lo que garantiza que la unión es la
  // correcta no es el tipo aquí, es el test que la compara contra el zod
  // escrito a mano sobre un corpus de casos.
  return z.discriminatedUnion('kind', [sistema, ...catalogo] as unknown as [
    z.ZodObject<z.ZodRawShape>,
    z.ZodObject<z.ZodRawShape>,
    ...z.ZodObject<z.ZodRawShape>[],
  ]);
}

/**
 * Lo mínimo que `zodDeBloques` necesita de una definición. Se declara aquí en
 * vez de importar `DefinicionBloque` de portal-home-bloques.ts porque ese
 * módulo ya importa éste indirectamente (vía campos.ts) — mismo motivo por el
 * que los resolvedores de enlaces viven en su propio fichero.
 */
export interface DefinicionBloqueParaZod {
  id: string;
  origen: 'catalogo' | 'sistema';
  campos: readonly CampoSchema[];
  hijos?: { admite: readonly string[]; max?: number };
  /**
   * Solo en los de `sistema`: su `id` es siempre la cadena 'sistema', así que
   * lo que los distingue —y con lo que se busca su schema— es esto.
   */
  sistemaId?: string;
}
