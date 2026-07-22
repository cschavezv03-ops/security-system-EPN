#!/usr/bin/env python3
"""Comprueba la numeración de las decisiones (§Dnn) y las dudas (§Vnn).

Existe porque la ronda de ADM reutilizó sin querer los números D53-D58 que ya ocupaba la de PCO,
y la colisión pasó desapercibida durante dos rondas: cada una usaba un formato de encabezado
distinto (`## §Dnn` frente a `### Dnn`), así que ninguna búsqueda las veía juntas.

Comprueba cuatro cosas:

  1. Ningún número de decisión ni de duda está definido dos veces.  (fallo)
  2. Toda referencia `§Dnn` / `§Vnn` del repositorio apunta a algo que existe.  (fallo)
  3. No quedan huecos en la secuencia.  (fallo)
  4. En qué orden aparecen dentro del documento.  (solo aviso)

El orden es un aviso y no un fallo a propósito: el documento agrupa las decisiones por secciones
temáticas —"Decisiones de arquitectura", "Conflictos resueltos entre documentos"…— y dentro de
cada una los números no son correlativos. D2 aparece después de D26 porque pertenecen a bloques
distintos, y moverlo rompería el sentido del documento. Lo que sí importa es que un número no
signifique dos cosas.

Uso:
    python3 scripts/verificar_numeracion_docs.py

Devuelve 0 si todo está bien y 1 si hay algo que arreglar, para poder encadenarlo en un script
de comprobación general.
"""
from __future__ import annotations

import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DOC_DECISIONES = RAIZ / 'docs' / '03_DECISIONES_Y_CORRECCIONES.md'
DOC_DUDAS = RAIZ / 'docs' / '99_DUDAS_PARA_EL_EQUIPO.md'

# Se aceptan los dos niveles de encabezado y el símbolo § opcional: el documento arrastra ambas
# formas por motivos históricos, y lo que importa es que el NÚMERO sea único.
ENC_DECISION = re.compile(r'^#{2,3} (?:§)?D(\d+)\b', re.M)
ENC_DUDA = re.compile(r'^#{2,3} (?:§)?V(\d+)\b', re.M)
REF_DECISION = re.compile(r'§D(\d+)')
REF_DUDA = re.compile(r'§V(\d+)')

EXTENSIONES = {'.md', '.sql', '.ts', '.tsx', '.py'}
EXCLUIDOS = ('node_modules', '/.git/', '/dist/', '/.testsprite/')


def archivos_del_repo():
    for p in RAIZ.rglob('*'):
        if not p.is_file() or p.suffix not in EXTENSIONES:
            continue
        if any(x in str(p) for x in EXCLUIDOS):
            continue
        yield p


def numeros_definidos(doc: pathlib.Path, patron: re.Pattern) -> list[int]:
    return [int(n) for n in patron.findall(doc.read_text(encoding='utf-8'))]


def revisar(nombre: str, prefijo: str, doc: pathlib.Path, enc: re.Pattern, ref: re.Pattern) -> tuple[list[str], list[str]]:
    fallos: list[str] = []
    avisos: list[str] = []
    definidos = numeros_definidos(doc, enc)

    duplicados = sorted({n for n in definidos if definidos.count(n) > 1})
    if duplicados:
        fallos.append(f'{nombre}: números definidos más de una vez: {duplicados}')

    desorden = [(a, b) for a, b in zip(definidos, definidos[1:]) if b < a]
    if desorden:
        avisos.append(f'{nombre}: aparecen fuera de orden (normal si están en secciones distintas): ' +
                      ', '.join(f'{a} antes de {b}' for a, b in desorden))

    conjunto = set(definidos)
    if conjunto:
        huecos = sorted(set(range(min(conjunto), max(conjunto) + 1)) - conjunto)
        if huecos:
            fallos.append(f'{nombre}: huecos en la secuencia: {huecos}')

    rotas: dict[int, set[str]] = {}
    for p in archivos_del_repo():
        try:
            texto = p.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        for m in ref.finditer(texto):
            n = int(m.group(1))
            if n not in conjunto:
                rotas.setdefault(n, set()).add(str(p.relative_to(RAIZ)))
    for n, donde in sorted(rotas.items()):
        # `nombre` es "Decisiones" o "Dudas", pero el prefijo de la referencia es D o V. Tomar
        # la inicial del nombre hacía que una §V rota se anunciara como §D, y quien la buscaba
        # la encontraba existiendo tan campante en el otro documento.
        fallos.append(f'{nombre}: se cita §{prefijo}{n}, que no existe — en {", ".join(sorted(donde))}')

    return fallos, avisos


def main() -> int:
    fallos, avisos = revisar('Decisiones', 'D', DOC_DECISIONES, ENC_DECISION, REF_DECISION)
    f2, a2 = revisar('Dudas', 'V', DOC_DUDAS, ENC_DUDA, REF_DUDA)
    fallos += f2
    avisos += a2

    dec = numeros_definidos(DOC_DECISIONES, ENC_DECISION)
    dud = numeros_definidos(DOC_DUDAS, ENC_DUDA)
    print(f'Decisiones: {len(dec)} (D{min(dec)}-D{max(dec)})')
    print(f'Dudas:      {len(dud)} (V{min(dud)}-V{max(dud)})')

    if avisos:
        print('\nAvisos (no bloquean):')
        for a in avisos:
            print(f'  - {a}')

    if fallos:
        print('\nProblemas que hay que arreglar:')
        for f in fallos:
            print(f'  - {f}')
        print(f'\nEl siguiente número libre de decisión es D{max(dec) + 1}.')
        return 1

    print('\nSin duplicados, sin huecos y sin referencias rotas.')
    print(f'Siguiente número libre: D{max(dec) + 1} y V{max(dud) + 1}.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
