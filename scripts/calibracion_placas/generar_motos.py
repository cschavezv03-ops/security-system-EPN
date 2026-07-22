#!/usr/bin/env python3
"""
Genera placas de MOTOCICLETA ecuatorianas para medir si el lector puede con ellas.

Una placa de moto no es una placa de auto más pequeña: es otra forma.

    Auto   ~400 x 130 mm  (relación 3:1, apaisada)   ->  el codigo cabe en UNA linea
    Moto   ~200 x 150 mm  (relacion 1.33:1, casi     ->  el codigo va en DOS lineas
                           cuadrada)

Eso rompe dos supuestos del lector actual, los dos medibles:

  1. El recorte del marco guia es 70 % de ancho x 26 % de alto (relacion 2.7:1). Una placa
     casi cuadrada encuadrada ahi se queda con la linea de arriba o la de abajo fuera.
  2. Tesseract corre con `tessedit_pageseg_mode = 7`, que significa "esta imagen es UNA SOLA
     LINEA de texto". Con dos lineas, ese modo no esta pensado para el caso.

Se generan las dos disposiciones que se ven en la calle, porque no todas las motos llevan la
misma y el lector tiene que servir para ambas.

Uso:  python3 generar_motos.py <carpeta-destino> [placas-por-condicion]
"""

import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

sys.path.insert(0, str(Path(__file__).parent))
from generar_banco import (  # noqa: E402
    LETRAS_PROVINCIA, PROVINCIAS, FUENTE, brillo_pantalla, escalar_ida_y_vuelta,
    moire, perspectiva, ruido,
)

ANCHO, ALTO = 600, 450  # 1.33:1, la proporción real de una placa de moto


def placa_moto_aleatoria(rng):
    """Formato vigente: 3 letras (la 1ª de provincia) + 3 dígitos."""
    provincia = rng.choice(LETRAS_PROVINCIA)
    resto = "".join(rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(2))
    digitos = "".join(rng.choice("0123456789") for _ in range(3))
    return provincia + resto + digitos


def dibujar_moto(texto, disposicion):
    """
    `disposicion` decide dónde se parte el código entre las dos líneas:

      'letras_digitos'  ->  ABC        (las tres letras arriba)
                            123        (los tres dígitos abajo)

      'partido'         ->  AB         (parte del bloque arriba)
                            C123       (el resto abajo)
    """
    img = Image.new("RGB", (ANCHO, ALTO), "white")
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([5, 5, ANCHO - 6, ALTO - 6], radius=24, outline="black", width=6)

    # Franja del país, igual que en la de auto pero proporcionalmente más alta.
    d.rounded_rectangle([12, 12, ANCHO - 13, 82], radius=16, fill=(20, 40, 120))
    d.text((ANCHO // 2, 47), "ECUADOR", font=ImageFont.truetype(FUENTE, 44), fill="white", anchor="mm")

    if disposicion == "letras_digitos":
        arriba, abajo = texto[:3], texto[3:]
    else:
        arriba, abajo = texto[:2], texto[2:]

    f_grande = ImageFont.truetype(FUENTE, 118)
    d.text((ANCHO // 2, 175), arriba, font=f_grande, fill="black", anchor="mm")
    d.text((ANCHO // 2, 300), abajo, font=f_grande, fill="black", anchor="mm")

    d.text((ANCHO // 2, 400), PROVINCIAS.get(texto[0], "ECUADOR"),
           font=ImageFont.truetype(FUENTE, 26), fill="black", anchor="mm")

    return img


def limpia(img, rng):
    return img


def pantalla_movil(img, rng):
    """El caso de la demo: la placa mostrada en la pantalla de un celular."""
    img = escalar_ida_y_vuelta(img, rng.uniform(0.30, 0.45))
    img = perspectiva(img, 0.03, rng)
    img = moire(img, rng.uniform(0.10, 0.20), rng)
    img = brillo_pantalla(img, rng)
    img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.62, 0.82))
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.7, 1.4)))
    return ruido(img, 6, rng)


CONDICIONES = {"limpia": limpia, "pantalla_movil": pantalla_movil}
DISPOSICIONES = ["letras_digitos", "partido"]


def main():
    from PIL import ImageFont  # noqa: F401  (lo usa dibujar_moto vía global)

    if len(sys.argv) < 2:
        raise SystemExit("Uso: python3 generar_motos.py <carpeta-destino> [placas-por-condicion]")

    destino = Path(sys.argv[1])
    por_condicion = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    destino.mkdir(parents=True, exist_ok=True)

    rng = random.Random(20260720)
    indice = []

    for disposicion in DISPOSICIONES:
        for condicion, degradar in CONDICIONES.items():
            for i in range(por_condicion):
                texto = placa_moto_aleatoria(rng)
                img = degradar(dibujar_moto(texto, disposicion), rng)
                nombre = f"{disposicion}_{condicion}_{i:03d}.png"
                img.save(destino / nombre)
                indice.append({
                    "archivo": nombre, "placa": texto,
                    "condicion": f"{disposicion}/{condicion}",
                })
            print(f"  {disposicion}/{condicion}: {por_condicion}")

    (destino / "indice.json").write_text(json.dumps(indice, indent=2))
    print(f"\n  {len(indice)} imágenes en {destino}")


if __name__ == "__main__":
    from PIL import ImageFont
    globals()["ImageFont"] = ImageFont
    main()
