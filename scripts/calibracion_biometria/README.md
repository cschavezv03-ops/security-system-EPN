# Calibración del umbral biométrico

Herramienta de medición para fijar `UMBRAL_BIOMETRIA` y `UMBRAL_BIOMETRIA_REVISION` con datos,
no a ojo. **No forma parte de la aplicación y no toca la base de datos.**

## El problema que resuelve

El sistema decide si dos rostros son la misma persona comparando la distancia L2 entre sus
descriptores de 128 dimensiones. Para elegir el corte hacen falta dos números:

| Pregunta | Qué fija | ¿Se podía medir con el banco de la EPN? |
|---|---|---|
| ¿A qué distancia están **dos personas distintas**? | El **suelo**: por debajo, un impostor entra | Sí |
| ¿A qué distancia está **la misma persona** en dos fotos? | El **techo**: por encima, se rechaza a quien sí es | **No** |

El banco de la EPN tiene una sola foto por persona, así que la segunda pregunta no tenía
respuesta y el umbral se fijó con el margen que quedaba contra el impostor más parecido —
prudente, pero no medido.

## Por qué LFW

*Labeled Faces in the Wild* es el conjunto de referencia para esto, y su protocolo estándar no
es una lista de caras sueltas sino **parejas etiquetadas**: "estas dos fotos son de la misma
persona" o "son de personas distintas". Es exactamente la forma que tiene el problema.

Se usa el mirror `logasja/lfw` de Hugging Face, que expone el split de pares por API.

## Qué NO hace

- **No enrola a nadie.** Las fotos son de personas reales que no han consentido formar parte de
  un control de accesos. Se descargan a una carpeta temporal fuera del repositorio, se miden y
  ahí se quedan.
- **No escribe en la base de datos.** El resultado es un número que luego se aplica a mano, con
  su migración y su justificación.

## Cómo se ejecuta

```bash
cd scripts/calibracion_biometria
npm install

# 1. Descargar una muestra equilibrada de pares (la mitad de la misma persona,
#    la mitad de personas distintas). Fuera del repositorio.
node descargar_pares.mjs /tmp/pares-lfw 1200

# 2. Medir y proponer umbrales. Reparte el trabajo entre los núcleos disponibles.
node calibrar.mjs /tmp/pares-lfw
```

### Por qué CPU en paralelo y no GPU

Calcular un descriptor son unos cientos de milisegundos, y hay dos fotos por par: en secuencial,
1200 pares se van a cerca de una hora. La salida obvia sería la GPU, pero no compensa:
`@tensorflow/tfjs-node-gpu` se compila contra CUDA 11.8 y una tarjeta Blackwell (RTX 50xx)
necesita CUDA 12.8 o superior — varios GB de toolkit para acabar, con bastante probabilidad, en
un binario que no arranca.

El trabajo, en cambio, es **paralelo puro**: cada par es independiente de los demás y no hay
nada que coordinar. Repartirlo entre los núcleos da el mismo resultado sin instalar nada.
`calibrar.mjs` lanza un proceso por núcleo (dejando dos libres para que la máquina siga usable),
cada uno con su franja del índice, y agrega los resultados al final.

Los pesos del modelo están en `modelos/` y son **los mismos que descarga el navegador** desde
el CDN. El detector también es el mismo (`TinyFaceDetector`): calibrar con otro detector daría
un número que no aplica, porque cada uno recorta la cara de forma distinta y el descriptor sale
del recorte.

## Cómo se lee el resultado

- **FAR** (*False Accept Rate*): de cada 100 pares de personas **distintas**, a cuántos les
  abriría la puerta ese umbral. Es el error grave.
- **FRR** (*False Reject Rate*): de cada 100 pares de la **misma** persona, a cuántos se la
  cerraría. Es el error molesto: el guardia repite la captura o teclea la cédula.

El script propone el umbral **más permisivo que mantiene el FAR por debajo de un objetivo**
(0.1 %, 0.5 %, 1 %), que es el criterio adecuado para un control de acceso físico. También
reporta el EER (punto donde los dos errores se igualan), que sirve para comparar sistemas pero
**no** como umbral operativo: ahí un impostor entra con la misma facilidad con la que se rechaza
a alguien legítimo, y las dos cosas no cuestan lo mismo.

## Advertencias sobre el resultado

**LFW no es la garita de la EPN.** Son fotos de prensa, con iluminación y poses variadas pero
tomadas de frente y con buena resolución. Una cámara de garita a contraluz, de noche o con
mascarilla es un caso más difícil. Por tanto:

- El FRR medido aquí es **optimista**: en la garita se rechazará a gente legítima algo más a
  menudo de lo que diga el número.
- El FAR medido aquí es **razonablemente trasladable**: si dos personas distintas se separan
  bien en condiciones buenas, en condiciones malas se separan más, no menos.

Por eso el umbral se elige apuntando al FAR y se deja una **banda de revisión** por debajo, en
la que el sistema propone un nombre y decide el guardia mirando a la persona.

Ver `docs/03_DECISIONES_Y_CORRECCIONES.md` §D67 y §D70.
