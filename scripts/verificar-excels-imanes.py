#!/usr/bin/env python3
"""
Comprueba que las fórmulas de los Excel de /recursos dan lo que dicen.

Calcula cada libro con un motor de fórmulas independiente (`formulas`) y
compara CADA resultado con una cuenta hecha aparte, en Python, desde las mismas
entradas. Además mueve las entradas (precio, ocupación, descuentos) y repite,
para pillar una fórmula que solo cuadra con los números de ejemplo.

  /tmp/venv-xl/bin/python scripts/verificar-excels-imanes.py /tmp/imanes

Sale con código 1 si algo no cuadra. No va en el CI (necesita `formulas`).
"""
import math
import shutil
import sys
import tempfile
from pathlib import Path

import formulas
from openpyxl import load_workbook

SEM = 4.33
IVA = 0.21
fallos = []


def cerca(a, b, tol=0.011):
    return a == b or (isinstance(a, (int, float)) and isinstance(b, (int, float)) and math.isclose(a, b, abs_tol=tol, rel_tol=1e-9))


def comprobar(nombre, obtenido, esperado, tol=0.011):
    if not cerca(obtenido, esperado, tol):
        fallos.append(f"{nombre}: el libro da {obtenido!r} y la cuenta aparte {esperado!r}")


def calcular(origen: Path, cambios: dict):
    """Copia el libro, cambia celdas de entrada, lo calcula y devuelve {(hoja, celda): valor}."""
    tmp = Path(tempfile.mkdtemp())
    copia = tmp / "libro.xlsx"
    wb = load_workbook(origen)
    for (hoja, celda), v in cambios.items():
        wb[hoja][celda] = v
    wb.save(copia)
    modelo = formulas.ExcelModel().loads(str(copia)).finish()
    modelo.calculate()
    modelo.write(dirpath=str(tmp / "salida"))
    calculado = next((tmp / "salida").glob("*.XLSX"), None) or next((tmp / "salida").glob("*.xlsx"))
    out = load_workbook(calculado, data_only=True)
    vals = {}
    for ws in out.worksheets:
        for fila in ws.iter_rows():
            for c in fila:
                if c.value is not None:
                    vals[(ws.title.upper(), c.coordinate)] = c.value
    shutil.rmtree(tmp, ignore_errors=True)
    return vals


# ── Modelo a 12 meses ────────────────────────────────────────────────────────

BASE = dict(plazas=8, clases=30, ocu0=0.45, paso=0.03, ocumax=0.8, precio=17, com=0.015, instr=22,
            alq=1800, sumin=350, soft=300, mkt=250, res=200, sueldo=1800, inv=30000)
CELDAS = dict(plazas="B4", clases="B5", ocu0="B6", paso="B7", ocumax="B8", precio="B9", com="B10", instr="B11",
              alq="B12", sumin="B13", soft="B14", mkt="B15", res="B16", sueldo="B17", inv="B18")


def esperado_modelo(p):
    ofrecidas = p["plazas"] * p["clases"] * SEM
    fijos = p["alq"] + p["sumin"] + p["soft"] + p["mkt"] + p["res"]
    instr = p["instr"] * p["clases"] * SEM
    meses, acum_a, acum_d = [], 0, 0
    for mes in range(1, 13):
        ocu = min(p["ocumax"], p["ocu0"] + (mes - 1) * p["paso"])
        ocupadas = ofrecidas * ocu
        ingresos = ocupadas * p["precio"]
        com = ingresos * p["com"]
        antes = ingresos - com - instr - fijos
        despues = antes - p["sueldo"]
        acum_a += antes
        acum_d += despues
        meses.append(dict(ocu=ocu, ocupadas=ocupadas, ingresos=ingresos, com=com, antes=antes, despues=despues,
                          acum_a=acum_a, acum_d=acum_d, recuperada=1 if acum_d >= p["inv"] else 0))
    costes = instr + fijos
    deja = p["precio"] * (1 - p["com"])
    eq_sin = costes / (ofrecidas * deja)
    eq_con = (costes + p["sueldo"]) / (ofrecidas * deja)
    primero = next((i + 1 for i, m in enumerate(meses) if m["recuperada"]), None)
    return dict(meses=meses, ofrecidas=ofrecidas, costes=costes, deja=deja, eq_sin=eq_sin, eq_con=eq_con,
                pers_sin=eq_sin * p["plazas"], pers_con=eq_con * p["plazas"],
                llega="Sí" if p["ocumax"] >= eq_con else "No",
                precio_min=(costes + p["sueldo"]) / (ofrecidas * p["ocumax"] * (1 - p["com"])),
                payback=primero if primero else "No en 12 meses")


def verificar_modelo(libro: Path, nombre, cambios):
    p = dict(BASE)
    ce = {("Supuestos", CELDAS[k]): v for k, v in cambios.items() for k in [k]}
    p.update(cambios)
    vals = calcular(libro, {("Supuestos", CELDAS[k]): v for k, v in cambios.items()})
    e = esperado_modelo(p)
    g = lambda hoja, celda: vals.get((hoja.upper(), celda))
    cols = "BCDEFGHIJKLM"
    for i, c in enumerate(cols):
        m = e["meses"][i]
        pre = f"{nombre} mes {i + 1}"
        comprobar(f"{pre} ocupación", g("12 meses", f"{c}5"), m["ocu"], 1e-9)
        comprobar(f"{pre} plazas ofrecidas", g("12 meses", f"{c}6"), e["ofrecidas"])
        comprobar(f"{pre} plazas ocupadas", g("12 meses", f"{c}7"), m["ocupadas"])
        comprobar(f"{pre} ingresos", g("12 meses", f"{c}8"), m["ingresos"])
        comprobar(f"{pre} comisiones", g("12 meses", f"{c}9"), m["com"])
        comprobar(f"{pre} resultado antes de ti", g("12 meses", f"{c}12"), m["antes"])
        comprobar(f"{pre} resultado tras sueldo", g("12 meses", f"{c}14"), m["despues"])
        comprobar(f"{pre} acumulado antes", g("12 meses", f"{c}15"), m["acum_a"])
        comprobar(f"{pre} acumulado tras sueldo", g("12 meses", f"{c}16"), m["acum_d"])
        comprobar(f"{pre} cubre costes", g("12 meses", f"{c}17"), "Sí" if m["antes"] >= 0 else "No")
        comprobar(f"{pre} cubre costes y sueldo", g("12 meses", f"{c}18"), "Sí" if m["despues"] >= 0 else "No")
    comprobar(f"{nombre} total ingresos", g("12 meses", "N8"), sum(m["ingresos"] for m in e["meses"]))
    comprobar(f"{nombre} total resultado tras sueldo", g("12 meses", "N14"), sum(m["despues"] for m in e["meses"]))
    comprobar(f"{nombre} equilibrio plazas", g("Equilibrio", "B4"), e["ofrecidas"])
    comprobar(f"{nombre} lo que deja cada plaza", g("Equilibrio", "B5"), e["deja"])
    comprobar(f"{nombre} costes del mes", g("Equilibrio", "B6"), e["costes"])
    comprobar(f"{nombre} ocupación equilibrio sin sueldo", g("Equilibrio", "B7"), e["eq_sin"], 1e-9)
    comprobar(f"{nombre} ocupación equilibrio con sueldo", g("Equilibrio", "B8"), e["eq_con"], 1e-9)
    comprobar(f"{nombre} personas sin sueldo", g("Equilibrio", "B9"), e["pers_sin"], 1e-9)
    comprobar(f"{nombre} personas con sueldo", g("Equilibrio", "B10"), e["pers_con"], 1e-9)
    comprobar(f"{nombre} llegas", g("Equilibrio", "B11"), e["llega"])
    comprobar(f"{nombre} precio mínimo", g("Equilibrio", "B12"), e["precio_min"])
    comprobar(f"{nombre} mes de recuperación", g("Equilibrio", "B13"), e["payback"])


# ── Simulador de la escalera ─────────────────────────────────────────────────

def red(n):
    # La misma redondeo que ROUND de Excel (mitad hacia arriba), no el del banquero de Python.
    return math.floor(n * 100 + 0.5 + 1e-9) / 100


def esperado_escalera(suelta, coste, dtos, ventas):
    """dtos: [d5, d10, c1, c2] en fracción. Devuelve la tabla de la hoja «Escalera»."""
    sesiones = [1, 5, 10, 4, 8]
    descuentos = [0] + dtos
    filas = []
    for ses, d in zip(sesiones, descuentos):
        ps = red(suelta * (1 - d))
        filas.append(dict(ps=ps, precio=red(ps * ses), ahorro=(round((1 - ps / suelta) * 100) / 100) if suelta > 0 else 0,
                          bajo=bool(coste > 0 and ps / (1 + IVA) < coste)))
    canibaliza = suelta * (1 - dtos[1]) < suelta * (1 - dtos[2])
    return filas, canibaliza


def esperado_escenario(suelta, coste, dtos, ventas):
    ps5, ps10, pc1, pc2 = (red(suelta * (1 - d)) for d in dtos)
    n = ventas  # [sueltas, b5, b10, c1, c2]
    ingresos_iva = red(n[0] * suelta + n[1] * ps5 * 5 + n[2] * ps10 * 10 + n[3] * pc1 * 4 + n[4] * pc2 * 8)
    sin_iva = red(ingresos_iva / (1 + IVA))
    sesiones = n[0] + n[1] * 5 + n[2] * 10 + n[3] * 4 + n[4] * 8
    coste_total = red(sesiones * coste)
    margen = red(sin_iva - coste_total)
    medio = red(sin_iva / sesiones) if sesiones > 0 else 0
    bajo = bool(coste > 0 and min(suelta, ps5, ps10, pc1, pc2) / (1 + IVA) < coste)
    return dict(ingresos_iva=ingresos_iva, sin_iva=sin_iva, sesiones=sesiones, coste=coste_total, margen=margen,
                medio=medio, bajo="Sí" if bajo else "No", canib="Sí" if ps10 < pc1 else "No",
                ps=(ps5, ps10, pc1, pc2))


def verificar_bonos(libro: Path, nombre, suelta, coste, dtos, esc_a, esc_b, ventas_a=None, ventas_b=None):
    cambios = {("Escalera", "B3"): suelta, ("Escalera", "B4"): coste,
               ("Escalera", "C9"): dtos[0], ("Escalera", "C10"): dtos[1], ("Escalera", "C11"): dtos[2], ("Escalera", "C12"): dtos[3]}
    for fila, d in zip((5, 6, 7, 8), esc_a):
        cambios[("Escenarios", f"C{fila}")] = d
    for fila, d in zip((5, 6, 7, 8), esc_b):
        cambios[("Escenarios", f"D{fila}")] = d
    base_ventas = [60, 12, 10, 25, 15]
    va, vb = ventas_a or base_ventas, ventas_b or base_ventas
    for fila, a, b in zip((12, 13, 14, 15, 16), va, vb):
        cambios[("Escenarios", f"C{fila}")] = a
        cambios[("Escenarios", f"D{fila}")] = b
    vals = calcular(libro, cambios)
    g = lambda hoja, celda: vals.get((hoja.upper(), celda))

    filas, canib = esperado_escalera(suelta, coste, dtos, None)
    for i, fila in enumerate((8, 9, 10, 11, 12)):
        e = filas[i]
        comprobar(f"{nombre} escalera {fila} precio por sesión", g("Escalera", f"D{fila}"), e["ps"])
        comprobar(f"{nombre} escalera {fila} precio", g("Escalera", f"E{fila}"), e["precio"])
        comprobar(f"{nombre} escalera {fila} ahorro", g("Escalera", f"F{fila}"), e["ahorro"], 1e-9)
        alerta = g("Escalera", f"G{fila}") or ""
        comprobar(f"{nombre} escalera {fila} alerta de coste", bool(alerta), e["bajo"])
    comprobar(f"{nombre} canibaliza (hoja Escalera)", (g("Escalera", "F14") or "").startswith("Sí"), canib)

    for col, dto, ventas in (("B", dtos, base_ventas), ("C", esc_a, va), ("D", esc_b, vb)):
        e = esperado_escenario(suelta, coste, dto, ventas)
        for fila, clave in ((24, "ingresos_iva"), (25, "sin_iva"), (26, "sesiones"), (27, "coste"), (28, "margen"), (29, "medio")):
            comprobar(f"{nombre} escenario {col}{fila} {clave}", g("Escenarios", f"{col}{fila}"), e[clave])
        comprobar(f"{nombre} escenario {col}31 alerta de coste", g("Escenarios", f"{col}31"), e["bajo"])
        comprobar(f"{nombre} escenario {col}32 canibaliza", g("Escenarios", f"{col}32"), e["canib"])
    base = esperado_escenario(suelta, coste, dtos, base_ventas)
    for col, dto, ventas in (("C", esc_a, va), ("D", esc_b, vb)):
        e = esperado_escenario(suelta, coste, dto, ventas)
        comprobar(f"{nombre} escenario {col}30 diferencia de margen", g("Escenarios", f"{col}30"), red(e["margen"] - base["margen"]))


if __name__ == "__main__":
    carpeta = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/imanes")
    modelo = carpeta / "modelo-estudio-12-meses.xlsx"
    bonos = carpeta / "simulador-escalera-bonos.xlsx"

    verificar_modelo(modelo, "modelo (ejemplo)", {})
    verificar_modelo(modelo, "modelo (precio 21 y 40 clases)", dict(precio=21, clases=40))
    verificar_modelo(modelo, "modelo (sin sueldo ni inversión)", dict(sueldo=0, inv=0))
    verificar_modelo(modelo, "modelo (ocupación sube rápido)", dict(ocu0=0.6, paso=0.1, ocumax=0.9, plazas=10))
    verificar_modelo(modelo, "modelo (no llega a equilibrio)", dict(alq=5000, precio=12))

    verificar_bonos(bonos, "bonos (ejemplo)", 25, 11, [0.12, 0.20, 0.24, 0.34], [0.10, 0.18, 0.24, 0.34], [0.15, 0.22, 0.26, 0.36])
    verificar_bonos(bonos, "bonos (suelta 30, coste 22: por debajo del coste)", 30, 22, [0.15, 0.30, 0.20, 0.35], [0.05, 0.10, 0.20, 0.35], [0.20, 0.25, 0.30, 0.40])
    verificar_bonos(bonos, "bonos (el bono de 10 canibaliza la cuota)", 24, 0, [0.10, 0.30, 0.20, 0.30], [0.10, 0.20, 0.20, 0.30], [0.10, 0.10, 0.20, 0.30],
                    [40, 10, 20, 15, 5], [80, 5, 5, 10, 5])
    verificar_bonos(bonos, "bonos (sin ventas)", 18, 9, [0.12, 0.20, 0.24, 0.34], [0.12, 0.20, 0.24, 0.34], [0.12, 0.20, 0.24, 0.34],
                    [0, 0, 0, 0, 0], [0, 0, 0, 0, 0])

    if fallos:
        print(f"✖ {len(fallos)} comprobaciones no cuadran:")
        for x in fallos[:40]:
            print("  -", x)
        sys.exit(1)
    print("✔ Todas las fórmulas cuadran con la cuenta hecha aparte (9 juegos de números).")
