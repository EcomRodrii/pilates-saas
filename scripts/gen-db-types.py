import re

import glob, os
# Fuente de verdad = las migraciones, en orden de aplicación. Antes se leía
# supabase/schema.sql, un snapshot hecho a mano que se declaraba a sí mismo
# NO AUTORITATIVO y llevaba días divergido: faltaban sustituciones,
# valoraciones, webhook_events y rate_limits, así que el código las usaba
# sin tipos. Las migraciones son aditivas (ningún DROP/RENAME real), por lo
# que leerlas en orden reconstruye el esquema correctamente.
#
# Se leen fichero a fichero (no concatenadas) para saber de QUÉ migración sale
# cada columna y poder emitir el comentario `// migr NNN` automáticamente.
# Antes esos comentarios se añadían a mano y regenerar los borraba, que es
# justo lo que hacía que nadie se fiara de este script.
ficheros = sorted(glob.glob('supabase/migrations/*.sql'))

def sin_comentarios(sql):
    """Quita los comentarios `--` antes de trocear por `;`.

    Un punto y coma DENTRO de un comentario cortaba la sentencia ahí y las
    columnas siguientes desaparecían del tipo generado sin ningún error — pasó
    de verdad con `plantillas_email.fuente` (2026-08-11), y no lo caza `tsc`
    porque la fila llega de Supabase como `any` en el punto del mapeo.
    Los literales entre comillas se reconocen PRIMERO para no destrozar un
    `comment on ... is '... -- ...'`.
    """
    return re.sub(r"'[^']*'|--[^\n]*",
                  lambda m: m.group(0) if m.group(0).startswith("'") else '', sql)

def sql_to_ts(coltype, notnull):
    coltype = coltype.strip().lower()
    if coltype.endswith('[]'):
        base = coltype[:-2]
        t = 'string[]' if 'text' in base or 'char' in base else 'number[]'
    elif 'int' in coltype or 'numeric' in coltype or 'serial' in coltype or 'real' in coltype or 'double' in coltype:
        t = 'number'
    elif 'bool' in coltype:
        t = 'boolean'
    elif 'jsonb' in coltype or coltype == 'json':
        t = 'any'
    else:
        t = 'string'
    return t if notnull else f'{t} | null'

def pascal(s): return ''.join(p.capitalize() for p in s.split('_'))

def parse_type(rest):
    tm = re.match(r'([a-z]+(?:\s*\([0-9, ]*\))?(?:\s*\[\])?)', rest, re.I)
    return tm.group(1) if tm else 'text'

tables = {}  # name -> dict(col -> ts)
origen = {}  # (tabla, col) -> version de la migración que la AÑADIÓ por ALTER
order = []

for ruta in ficheros:
    sql = sin_comentarios(open(ruta).read())
    version = os.path.basename(ruta).split('_')[0]

    for name, body in re.findall(r'create table (?:if not exists )?(?:public\.)?(\w+)\s*\((.*?)\n\);', sql, re.S | re.I):
        cols = {}
        for raw in body.split('\n'):
            line = raw.strip().rstrip(',')
            low = line.lower()
            if not line or line.startswith('--'): continue
            if re.match(r'(primary\s+key|foreign\s+key|unique|check|constraint)\b', low): continue
            m = re.match(r'([a-z_][a-z0-9_]*)\s+(.*)', line, re.I)
            if not m: continue
            col, rest = m.group(1), m.group(2)
            if col.lower() in ('primary','foreign','unique','check','constraint'): continue
            notnull = 'not null' in rest.lower() or 'primary key' in rest.lower()
            cols[col] = sql_to_ts(parse_type(rest), notnull)
        if name not in tables:
            order.append(name)
        tables[name] = cols

    # merge ALTER TABLE ADD COLUMN (always optional -> nullable).
    # Se procesa la SENTENCIA entera, no una línea: las migraciones escriben
    #   ALTER TABLE public.socios
    #     ADD COLUMN IF NOT EXISTS a text,
    #     ADD COLUMN IF NOT EXISTS b text;
    # es decir, el nombre de tabla y los ADD COLUMN van en líneas distintas y puede
    # haber varios por sentencia. Buscar 'alter table X add column' en una sola
    # línea capturaba 7 de 36 y perdía columnas reales (logo_url, sepa_*, etc.).
    for m in re.finditer(r'alter table\s+(?:only\s+)?(?:public\.)?(\w+)(.*?);', sql, re.S | re.I):
        name, cuerpo = m.group(1), m.group(2)
        for col, rest in re.findall(r'add column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)\s+([^,\n]+)', cuerpo, re.I):
            if name not in tables:
                tables[name] = {}; order.append(name)
            if col not in tables[name]:
                tables[name][col] = sql_to_ts(parse_type(rest), False)
                origen[(name, col)] = version

# Afinado manual de columnas jsonb: el SQL solo dice "jsonb", que se traduce a
# `any`. Estas tienen forma conocida y estaba declarada a mano en el
# schema.sql anterior; se conserva aquí para no perder precisión de tipos al
# generar desde las migraciones.
#
# ⚠️ Cualquier corrección a mano sobre lib/db-types.ts va AQUÍ, no en el fichero
# generado — si no, la siguiente regeneración se la lleva por delante.
TIPOS_MANUALES = {
    ('socios', 'campos_extra'): 'Record<string, string | number | boolean | null> | null',
    ('instructor_dependency_snapshots', 'detalle'):
        'Array<{ socioId: string; nombre: string; gasto: number; pctConInstructor: number }> | null',
    ('campanas', 'publicaciones'): 'unknown | null',
    ('automatizaciones', 'pasos'): 'unknown | null',
    # `jsonb not null default '[]'` — se declara sin `| null` a propósito: el
    # mapper siempre la escribe, y el `| null` obligaba a comprobarla en cada uso.
    ('sustituciones', 'candidatos_network'): 'any',
}
for (tabla, col), ts in TIPOS_MANUALES.items():
    if tabla in tables and col in tables[tabla]:
        tables[tabla][col] = ts

# Notas de prosa que el SQL no puede darnos. La procedencia (`// migr NNN`) se
# genera sola; esto es solo el POR QUÉ, para las pocas columnas que lo necesitan.
NOTAS_MANUALES = {
    ('integraciones', 'ultimo_ok_en'): 'Salud real del servicio (ver lib/integraciones/salud.ts).',
    ('tipos_clase', 'objetivos'):
        "`text[] not null default '{}'` — pero se declara nullable aquí porque una "
        'fila leída con un `select` que no la pida llega sin ella, y el mapper ya lo tolera.',
    ('sustituciones', 'candidatos_network'): 'Sugerencia sin puntuar, aparte de `ranking`.',
    ('studios', 'trial_ends_at'):
        'Fin de la prueba gratuita LOCAL de 7 días (sin tarjeta). La fija el trigger '
        '`trg_arrancar_prueba_gratuita` al crear el estudio, NUNCA el cliente. NULL = '
        'sin prueba local (los estudios anteriores a la apertura al público), que no '
        'es lo mismo que una prueba agotada — ver `estadoTrial()` en lib/billing/trial.ts.',
}

def envolver(texto, ancho=76):
    lineas, actual = [], '  //'
    for palabra in texto.split(' '):
        if actual != '  //' and len(actual) + 1 + len(palabra) > ancho:
            lineas.append(actual); actual = '  //'
        actual += ' ' + palabra
    lineas.append(actual)
    return lineas

out = ['// AUTO-GENERADO desde supabase/migrations/*.sql — filas de BD (snake_case).',
       '// Regenerar con: python3 scripts/gen-db-types.py  (no editar a mano:',
       '// las correcciones van en TIPOS_MANUALES/NOTAS_MANUALES dentro del script).',
       '/* eslint-disable @typescript-eslint/no-explicit-any */', '']
for name in order:
    out.append(f'export interface Row{pascal(name)} {{')
    for col, ts in tables[name].items():
        partes = []
        if (name, col) in origen:
            partes.append(f'migr {origen[(name, col)]}.')
        if (name, col) in NOTAS_MANUALES:
            partes.append(NOTAS_MANUALES[(name, col)])
        if partes:
            out.extend(envolver(' '.join(partes)))
        out.append(f'  {col}: {ts};')
    out.append('}')
    out.append('')

open('lib/db-types.ts','w').write('\n'.join(out))
print(f'{len(order)} interfaces generadas desde supabase/migrations/*.sql')
