# Calibración del lector de placas

Mide el lector de placas contra un banco de imágenes **con la respuesta conocida**, para poder
fijar `UMBRAL_PLACA` y `UMBRAL_PLACA_REVISION` con datos. No forma parte de la aplicación.

## Por qué el banco es sintético

Para calibrar un OCR hace falta saber qué pone en cada imagen. Un puñado de fotos de internet no
trae esa etiqueta y, sobre todo, no deja controlar la dificultad: aquí se genera la misma placa
con diez grados de desenfoque y se ve exactamente dónde se rompe la lectura.

La forma de la placa (tipografía, proporciones, "ECUADOR" arriba, provincia abajo) reproduce el
modelo vigente en Ecuador, incluidas las 24 letras de provincia que asigna la ANT.

## El caso que hay que cubrir

La demo no es una placa metálica delante de la cámara, sino **una foto de una placa mostrada en
la pantalla de un celular**. No es una versión más fácil del problema, es otra:

- la pantalla **emite** luz en vez de reflejarla, así que el contraste se aplana;
- aparece **moiré**, la interferencia entre la rejilla de píxeles del móvil y la del sensor, que
  llena la imagen de rayas finas justo donde el algoritmo busca los cantos de los caracteres;
- hay **reflejos** del propio brillo de la pantalla;
- la placa ocupa **pocos píxeles**, porque en el móvil se ve pequeña.

Las cinco condiciones del banco (`limpia`, `leve`, `pantalla_movil`, `pantalla_movil_dificil`,
`placa_real_dificil`) simulan eso por separado y combinado.

## Cómo se ejecuta

```bash
cd scripts/calibracion_placas
npm install

# 1. Generar el banco (necesita Pillow y numpy).
python3 generar_banco.py /tmp/banco-placas 40

# 2. Medir. Compila web/src/lib/placas.ts y usa ESE código, no una copia.
npm run medir /tmp/banco-placas
```

## Cómo se lee el resultado

- **Leída bien / leída mal / no se leyó.** Las tres son distintas y la del medio es la peligrosa:
  una placa mal leída que existe en la base autorizaría a otro vehículo.
- **Qué variante gana.** Dice si el preprocesado actual sirve para la condición que importa.
- **Confianza por consenso.** Cuántas de las cuatro variantes coincidieron. Es la señal que
  sustituye a la confianza de Tesseract, que en la versión 5 llega siempre a cero (§D71).
- **Efecto de cada umbral.** El compromiso: subirlo reduce las lecturas equivocadas que se
  aceptan y aumenta las correctas que hay que confirmar a mano.

## Advertencia sobre el resultado

El banco es sintético y las degradaciones son una **aproximación** a lo que hace una cámara real.
Sirve para comparar variantes de preprocesado entre sí y para situar el umbral, que es para lo
que se construyó. No sirve para prometer un porcentaje de acierto en la garita: eso solo lo dice
una prueba con la cámara de verdad.

Ver `docs/03_DECISIONES_Y_CORRECCIONES.md` §D68 y §D71.
