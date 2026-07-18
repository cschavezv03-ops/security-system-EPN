# Especificación técnica de validaciones y cambios generales

## Sistema de seguridad de la Escuela Politécnica Nacional

**Objetivo:** convertir los requerimientos 9 al 38 en reglas implementables y verificables en base de datos, backend y frontend.

**Contexto de datos:** esta especificación se basa exclusivamente en el esquema PostgreSQL proporcionado para el sistema, que incluye, entre otras, las tablas `persona`, `empresa`, `usuario_sistema`, `sesion`, `usuario_rol`, `parametro_sistema`, `vehiculo`, `persona_vehiculo`, `memorando`, `guardia_punto_control`, `regla_acceso`, `evento_acceso` y `bitacora_sistema`.

> **Instrucción obligatoria para el LLM que implemente los cambios:** antes de modificar código o base de datos, debe auditar las validaciones existentes. Si una validación ya está implementada, debe conservarla y mejorarla cuando sea incompleta. No debe reemplazar una validación más estricta por otra más débil ni duplicar lógica contradictoria. Por ejemplo, si la cédula ya valida provincia, debe mantener esa regla y añadir la validación completa del dígito verificador.

---

## 1. Principios de implementación obligatorios

### 1.1 Defensa en profundidad

Toda regla crítica debe aplicarse en tres capas cuando corresponda:

1. **Frontend:** prevención temprana, mensajes claros en español y deshabilitación de acciones inválidas.
2. **Backend/API/RPC:** validación autoritativa antes de ejecutar cualquier operación.
3. **Base de datos:** restricciones, índices, funciones o triggers para impedir que datos inválidos ingresen por rutas distintas al frontend.

Nunca se debe considerar suficiente una validación implementada únicamente en el navegador.

### 1.2 Normalización antes de validar

Antes de validar o comparar datos:

- Aplicar `trim` a textos.
- Colapsar espacios internos consecutivos cuando no sean significativos.
- Convertir correos a minúsculas para comparación y unicidad.
- Convertir placas a mayúsculas y eliminar espacios o guiones usados solo como presentación.
- Mantener cédulas y RUC como texto; nunca almacenarlos como números.
- No eliminar tildes, `ñ`, apóstrofes o guiones válidos de nombres.
- No modificar silenciosamente información sensible sin mostrar el valor normalizado al usuario.

### 1.3 Errores consistentes

Todos los formularios y endpoints deben devolver errores con una estructura homogénea, por ejemplo:

```json
{
  "codigo": "CEDULA_INVALIDA",
  "campo": "cedula",
  "mensaje": "La cédula ingresada no es válida.",
  "detalle": "El dígito verificador no coincide."
}
```

Los mensajes visibles deben estar en español, ser concretos y no exponer detalles internos, SQL, tokens o trazas.

### 1.4 Migraciones seguras

Antes de agregar `NOT NULL`, `CHECK`, índices únicos o triggers:

1. Auditar datos existentes.
2. Generar un reporte de filas incompatibles.
3. Corregir, normalizar o marcar los registros que requieran revisión.
4. Crear primero restricciones de manera no destructiva cuando la tecnología lo permita.
5. Validar la restricción después de limpiar datos.
6. No eliminar columnas ni registros sin analizar dependencias, vistas, RPC, RLS, reportes y frontend.

### 1.5 Operaciones atómicas

Los procesos que crean una entidad y su asociación deben ejecutarse en una sola transacción. Si falla una parte, no debe persistirse ninguna.

Casos obligatorios:

- Crear vehículo y asociarlo con una persona.
- Crear usuario y asignarle uno o más roles permitidos.
- Cambiar contraseña obligatoria, actualizar el indicador y cerrar sesiones.

### 1.6 Zona horaria

- Almacenar fechas y horas técnicas en `timestamptz`.
- Ejecutar comparaciones de turnos usando la hora autoritativa del servidor o base de datos.
- Interpretar los turnos en la zona horaria `America/Guayaquil`.
- Nunca confiar en la hora enviada por el navegador para autorizar acceso.

---

## 2. Relación con el esquema actual

| Área | Tablas y campos principales |
|---|---|
| Personas | `persona.cedula`, `nombres`, `apellidos`, `correo`, `correo_respaldo`, `fecha_nacimiento`, teléfonos, estado |
| Empresas | `empresa.nombre`, `empresa.ruc`, `tipo_servicio`, estado |
| Usuarios | `usuario_sistema.nombre_usuario`, `correo_electronico`, `requiere_cambio_password`, `estado_usuario`, `intentos_fallidos` |
| Sesiones | `sesion.token_hash`, `recordar_sesion`, `fecha_inicio`, `fecha_expiracion`, `fecha_cierre`, `estado_sesion`, `ip_origen` |
| Roles | `rol`, `usuario_rol`, `rol_permiso` |
| Parámetros | `parametro_sistema.tipo_dato`, `valor_parametro`, `editable`, estado |
| Vehículos | `vehiculo.placa`, `tipo_vehiculo`, `marca`, `modelo`, `color`, estado |
| Asociación persona-vehículo | `persona_vehiculo.id_persona`, `id_vehiculo`, fechas, estado y tipo de relación |
| Fechas de vigencia | `memorando`, `persona_vehiculo`, `guardia_punto_control`, `usuario_rol`, `rol_permiso`, `regla_acceso` |
| Turnos | `guardia_punto_control.turno`, `fecha_inicio`, `fecha_fin`, estado |
| Auditoría | `bitacora_sistema` |

---

# 3. Desarrollo específico de los requerimientos 9 al 24

## 9. Todos los datos ingresados deben estar validados

### Regla

Ningún campo editable puede enviarse al backend sin una regla explícita de:

- tipo;
- obligatoriedad;
- longitud mínima y máxima;
- formato;
- catálogo permitido;
- rango;
- coherencia con otros campos;
- unicidad cuando corresponda;
- permisos del usuario que realiza la operación.

### Implementación

- Crear una capa centralizada de esquemas de validación reutilizable por formularios y endpoints.
- Evitar expresiones regulares o reglas diferentes para el mismo dato en pantallas distintas.
- Usar listas permitidas para estados, tipos de persona, tipos de movimiento, roles, turnos y niveles de riesgo.
- Rechazar propiedades inesperadas en solicitudes sensibles para impedir asignación masiva de campos.
- Limitar longitudes también en backend, aunque la interfaz use `maxlength`.
- Parametrizar consultas y no construir SQL con concatenación de entradas.
- Verificar permisos en servidor y conservar las políticas RLS existentes.

### Criterios de aceptación

- Una petición directa a la API con datos inválidos es rechazada aunque el frontend se omita.
- Todos los errores identifican el campo y muestran un mensaje en español.
- No existen dos validadores contradictorios para el mismo tipo de dato.

---

## 10. Validación de cédulas ecuatorianas

### Campos afectados

- `persona.cedula`.
- Cualquier búsqueda, filtro o formulario que reciba una cédula.

### Reglas obligatorias

1. Normalizar eliminando espacios exteriores. No convertir a número.
2. Aceptar exactamente 10 dígitos.
3. Rechazar letras, signos, espacios internos y longitudes distintas de 10.
4. Validar el código territorial de los dos primeros dígitos:
   - `01` a `24`;
   - `30`, cuando el sistema deba admitir identificaciones emitidas con ese código.
5. Para cédula de persona natural, el tercer dígito debe estar entre `0` y `5`.
6. Rechazar valores evidentemente ficticios o de relleno:
   - todos los dígitos iguales;
   - secuencias completas ascendentes o descendentes;
   - valores incompletos como `1234` o `0123`;
   - cualquier lista de identificadores de prueba que ya exista en el proyecto.
7. Aplicar el algoritmo de módulo 10 al décimo dígito.
8. Comprobar unicidad después de normalizar.
9. No afirmar que una cédula existe solo porque pasa el algoritmo. Si existe integración autorizada con Registro Civil, consultar la fuente oficial; en caso contrario, distinguir entre **estructura válida** y **existencia verificada**.

### Algoritmo de módulo 10

Usar los primeros nueve dígitos y los coeficientes:

```text
[2, 1, 2, 1, 2, 1, 2, 1, 2]
```

Procedimiento:

```text
suma = 0
para i desde 0 hasta 8:
    producto = digito[i] * coeficiente[i]
    si producto >= 10:
        producto = producto - 9
    suma = suma + producto

digito_calculado = (10 - (suma mod 10)) mod 10
válida = digito_calculado == digito[9]
```

### Base de datos

- Crear una función central, por ejemplo `validar_cedula_ec(text)`, o su equivalente según la arquitectura.
- Añadir una restricción para nuevas escrituras después de limpiar datos existentes.
- Conservar el índice único de `persona.cedula` y asegurar que la comparación se haga sobre el valor normalizado.

### Frontend

- Usar teclado numérico cuando aplique.
- Limitar a 10 caracteres, pero no depender solo de `maxlength`.
- Mostrar errores diferenciados: longitud, provincia, tercer dígito y verificador.
- No permitir guardar mientras la cédula sea inválida.

### Pruebas mínimas

- Cédula de 9 y 11 dígitos: rechazada.
- `1234`, `0123`, diez ceros y secuencias: rechazadas.
- Provincia `00`, `25` o `99`: rechazada.
- Provincia `01`–`24`: sometida al resto de validaciones.
- Código `30`: aceptado únicamente conforme a la regla funcional definida.
- Dígito verificador alterado: rechazado.
- Dos personas con la misma cédula normalizada: rechazadas.

> Para pruebas automatizadas, generar identificadores sintéticos mediante una utilidad exclusiva del entorno de pruebas. No incluir un generador de cédulas en producción ni presentar datos sintéticos como personas reales.

---

## 11. Validación de nombres y apellidos

### Campos afectados

- `persona.nombres`.
- `persona.apellidos`.
- Nombres de empresas, roles, zonas y otros campos nominales con reglas propias.

### Reglas para personas

- Obligatorios cuando el caso funcional represente una persona identificada.
- Longitud recomendada: 2 a 100 caracteres por campo, ajustable según el proyecto.
- Aceptar letras Unicode, tildes, diéresis, `ñ`, espacios, apóstrofes y guiones.
- Rechazar números, emojis, etiquetas HTML, caracteres de control y símbolos ajenos a un nombre.
- Aplicar `trim` y colapsar espacios consecutivos.
- Rechazar valores formados solo por espacios, guiones o apóstrofes.
- No exigir dos nombres ni dos apellidos.
- No invalidar nombres compuestos como `María José`, `De la Cruz`, `O'Connor` o `Paz y Miño`.
- No convertir automáticamente todo a mayúsculas. La presentación puede aplicar capitalización sin destruir el valor almacenado.

### Nombres de empresa

No reutilizar la expresión regular de nombres personales. Una razón social puede contener números y símbolos legítimos como `&`, `.`, `-` o siglas. Validar longitud, contenido peligroso, espacios y unicidad cuando corresponda.

### Seguridad

- Escapar el contenido al renderizarlo.
- No usar el bloqueo de caracteres como sustituto de consultas parametrizadas y codificación de salida.

---

## 12. Validación de fechas

### Reglas generales

- Recibir fechas en un formato inequívoco, preferiblemente ISO `YYYY-MM-DD` para API.
- Mostrar fechas al usuario con configuración regional `es-EC`.
- Rechazar fechas inexistentes: 31 de febrero, meses 13, años fuera de rango, etc.
- No convertir silenciosamente una fecha inválida en otra válida.
- No confiar en texto libre cuando puede usarse un selector de fecha accesible.
- La base de datos debe conservar `date` para fechas sin hora y `timestamptz` para instantes.

### Reglas por campo

- `persona.fecha_nacimiento`:
  - no puede estar en el futuro;
  - edad máxima razonable configurable, por ejemplo 120 años;
  - no imponer mayoría de edad salvo que el caso de uso lo exija.
- Fechas de registro y modificación:
  - deben asignarse en servidor/base de datos;
  - no deben ser editables desde el frontend.
- Fechas de visitas y autorizaciones:
  - aplicar las restricciones del proceso, no una regla genérica de “siempre futura” si existen registros históricos.

---

## 13. Coherencia entre fechas y horarios

### Reglas obligatorias

- `memorando.fecha_fin >= memorando.fecha_inicio`.
- `persona_vehiculo.fecha_fin >= persona_vehiculo.fecha_inicio` cuando `fecha_fin` no sea nula.
- `guardia_punto_control.fecha_fin >= guardia_punto_control.fecha_inicio` cuando `fecha_fin` no sea nula.
- `usuario_rol.fecha_revocacion >= usuario_rol.fecha_asignacion` cuando exista revocación.
- `rol_permiso.fecha_revocacion >= rol_permiso.fecha_asignacion` cuando exista revocación.
- Una relación activa no debe tener una fecha de finalización pasada sin que el estado se actualice.
- Una relación revocada o finalizada debe registrar fecha y, cuando aplique, motivo.

### Horarios de reglas de acceso

`regla_acceso.horario_inicio` y `horario_fin` requieren una decisión explícita:

- Si no se permiten rangos que crucen medianoche, exigir `horario_fin > horario_inicio`.
- Si se permiten, tratar `22:00–06:00` como un rango nocturno válido y no rechazarlo por una comparación simple.
- Si el modelo actual no distingue los casos, añadir un indicador como `cruza_medianoche` o encapsular la lógica en una función.

### Base de datos

Crear `CHECK` para relaciones simples y triggers/funciones para reglas dependientes del estado o de otras filas.

---

## 14. Validación de RUC ecuatoriano

### Campo afectado

- `empresa.ruc`.

### Regla principal

La validación debe diferenciar entre:

1. **Estructura local válida**.
2. **Validación algorítmica aplicable al tipo de contribuyente**.
3. **Existencia y estado verificados en la fuente oficial del SRI**.

No se debe rechazar automáticamente un RUC de sociedad solo porque no satisface un algoritmo legado. El SRI ha indicado que existen RUC válidos de sociedades privadas, públicas y personas naturales extranjeras para los que no corresponde una validación local obligatoria por algoritmo; la validación autoritativa debe realizarse contra la fuente oficial cuando exista convenio o servicio disponible.

### Reglas estructurales

- Exactamente 13 dígitos.
- Mantener como texto.
- Rechazar todos los dígitos iguales, secuencias de relleno y valores incompletos.
- Validar el código territorial inicial conforme al catálogo aceptado por el SRI y los datos vigentes del sistema.
- Los tres últimos dígitos deben ser `001` para el número de RUC principal, salvo que una fuente oficial o requerimiento institucional documentado establezca otra representación.
- El tercer dígito permite clasificar el caso:
  - `0` a `5`: persona natural ecuatoriana o residente; los primeros 10 dígitos deben pasar la validación de cédula.
  - `6`: caso asociado tradicionalmente a entidades públicas; validar estructura y consultar fuente oficial.
  - `9`: sociedades privadas y otros casos; validar estructura y consultar fuente oficial.
  - cualquier otro valor: rechazar, salvo evidencia oficial y documentada de un formato adicional.

### Algoritmos existentes

- Si el proyecto ya contiene módulo 11 para RUC de sociedades, mantenerlo solo como validación complementaria o advertencia cuando sea aplicable.
- No usar el resultado del módulo 11 como único motivo de rechazo de todos los RUC de sociedad.
- Documentar claramente qué tipos pasan por módulo 10, cuáles por módulo 11 y cuáles requieren consulta oficial.

### Verificación oficial

Si existe un servicio autorizado del SRI:

- consultar por backend, nunca directamente desde el navegador si expone credenciales;
- aplicar timeout, reintentos limitados y registro de resultado;
- diferenciar `INVÁLIDO`, `VÁLIDO`, `NO VERIFICADO` y `SERVICIO NO DISPONIBLE`;
- no marcar como inválido un RUC solo porque el servicio esté caído;
- guardar fecha y fuente de la última verificación si el modelo lo requiere.

### Unicidad

- `empresa.ruc` debe seguir siendo único cuando no sea nulo.
- La comparación debe realizarse sobre el valor normalizado.

### Pruebas mínimas

- 12 o 14 dígitos: rechazado.
- Sufijo distinto de `001`: rechazado para RUC principal.
- RUC de persona natural con cédula inválida: rechazado.
- RUC de sociedad estructuralmente válido que no pasa un algoritmo legado: no rechazar sin comprobación oficial.
- Servicio SRI no disponible: devolver estado de verificación pendiente, no falsificar una respuesta.

---

## 15. Validación de placas vehiculares

### Campos afectados

- `vehiculo.placa`.
- Búsquedas y registros de acceso que reciban placa.

### Normalización

- Convertir a mayúsculas.
- Eliminar espacios y guiones usados como separadores de presentación.
- Conservar solo letras latinas sin tildes y dígitos para placas ordinarias.
- No almacenar dos representaciones de la misma placa.

### Reglas

La validación debe depender de `tipo_vehiculo` o de un nuevo catálogo `tipo_placa`. No debe existir una sola expresión regular excesivamente restrictiva para todos los vehículos.

Patrones iniciales que deben contemplarse, sujetos a la auditoría de datos reales y normativa aplicable:

- Vehículo ordinario: tres letras seguidas de tres o cuatro dígitos.
- Motocicleta: formatos alfanuméricos específicos, por ejemplo dos letras, tres dígitos y una letra.
- Placas diplomáticas, temporales, estatales, de internación u otras categorías: validar mediante catálogo propio y reglas separadas; no forzarlas al patrón ordinario.

### Reglas adicionales

- Rechazar valores formados solo por letras iguales, solo por ceros o textos de relleno como `SINPLACA`, salvo que el negocio permita explícitamente vehículos sin placa.
- Si un tipo de vehículo todavía no tiene placa, almacenar `NULL` y un estado/motivo explícito; no usar cadenas ficticias.
- Aplicar unicidad sin distinguir mayúsculas/minúsculas para placas no nulas.
- La validación de formato no demuestra que la placa exista o corresponda al vehículo. Si existe integración autorizada con ANT, verificarla en backend.
- No rechazar placas históricas existentes sin un proceso de revisión y migración.

### Base de datos

- Crear un índice único sobre la placa normalizada, condicionado a `placa IS NOT NULL`.
- Aplicar validación condicional según tipo de vehículo.
- Evaluar añadir `placa_normalizada` y `tipo_placa` si simplifica búsquedas y reglas.

---

## 16. Validación de correos electrónicos

### Campos afectados

- `persona.correo`.
- `persona.correo_respaldo`.
- `usuario_sistema.correo_electronico`.
- Cualquier correo usado en recuperación de contraseña o notificaciones.

### Reglas

- Aplicar `trim` y convertir el dominio y la comparación a minúsculas.
- Longitud máxima total: 254 caracteres.
- Rechazar espacios, saltos de línea y formatos evidentemente inválidos.
- Usar una validación práctica, no una expresión regular gigantesca que intente reproducir todo el RFC.
- Cuando el correo sea obligatorio para autenticación o recuperación, verificar su propiedad mediante enlace o código.
- La unicidad de `usuario_sistema.correo_electronico` debe ser insensible a mayúsculas/minúsculas.
- Los correos opcionales solo se validan cuando contienen un valor.
- No completar automáticamente el correo a partir de nombres o apellidos.
- No aceptar dominios inexistentes como prueba definitiva mediante frontend; una comprobación DNS, si se usa, debe ejecutarse en backend y no sustituye la verificación de propiedad.

### Mensajes

- `Ingrese un correo electrónico válido.`
- `Este correo ya está asociado con otro usuario.`
- `Debe verificar el correo antes de continuar.`

---

## 17. Valores numéricos y parámetros: tipo y rango

### Campos relevantes

- `usuario_sistema.intentos_fallidos`.
- `parametro_sistema.tipo_dato` y `valor_parametro`.
- Cualquier límite de sesiones, tolerancia de turno, cantidad máxima de vehículos, duración de token o rango de riesgo.

### Reglas

- No aceptar `NaN`, infinito, cadenas vacías convertidas a cero ni números con texto adicional.
- Definir mínimo, máximo, precisión y unidad.
- `intentos_fallidos >= 0` y con máximo coherente con la política configurada.
- Los parámetros deben validarse de acuerdo con `tipo_dato`:
  - `INTEGER`: entero dentro del rango declarado.
  - `DECIMAL`: precisión y escala definidas.
  - `BOOLEAN`: valores booleanos reales, no cualquier texto.
  - `DATE`, `TIME`, `TIMESTAMP`: formato y rango válidos.
  - `ENUM`: valor dentro del catálogo permitido.
  - `JSON`: esquema JSON validado.
- No permitir modificar parámetros con `editable = false`, ni siquiera por petición directa.
- Agregar metadatos de validación cuando sea necesario: `valor_minimo`, `valor_maximo`, `unidad`, `opciones_permitidas` o un `jsonb` de reglas.
- El backend debe convertir y validar antes de guardar `valor_parametro` como texto.

---

## 18. Datos realistas y coherentes para presentación

### Reglas

- Usar un entorno o conjunto de datos de demostración separado de producción.
- No usar datos personales reales sin autorización.
- Los datos de prueba deben respetar relaciones y reglas:
  - persona interna con categoría interna;
  - persona externa vinculada a empresa cuando corresponda;
  - memorando vigente para el periodo mostrado;
  - vehículo asociado con una persona;
  - usuario con rol coherente;
  - guardia con turno y punto de control activos;
  - estados y fechas compatibles.
- Evitar `Juan Pérez`, `1234`, `AAA0000`, fechas imposibles y correos inventados que aparenten ser institucionales reales.
- Para correos de demostración usar dominios reservados como `example.com` cuando no se requiera envío real.
- Si se requieren identificaciones que pasen checksum, generarlas solo en fixtures de prueba y marcarlas claramente como sintéticas.

### Criterio de aceptación

La presentación no debe mostrar registros que contradigan las reglas del sistema o que solo puedan guardarse desactivando validaciones.

---

## 19. Campos editables vacíos

### Regla

Todo campo visible y editable debe estar en uno de estos estados:

- obligatorio;
- opcional identificado;
- condicional con explicación;
- deshabilitado porque no aplica;
- solo lectura.

No debe existir un campo editable vacío cuya finalidad no esté definida.

### Implementación

- Revisar formulario por formulario.
- Eliminar controles que no tengan persistencia o función real.
- No enviar cadenas vacías para representar ausencia; normalizar a `NULL` cuando el modelo lo permita.
- Evitar que el backend sobrescriba datos existentes con `NULL` o cadena vacía cuando el campo no fue enviado en una actualización parcial.

---

## 20. Deshabilitar campos que no correspondan al caso seleccionado

### Ejemplos

- `id_empresa` solo se habilita cuando el tipo de persona externa requiere empresa.
- Campos académicos de `persona_interna_detalle` solo aparecen para categorías aplicables.
- Datos de contrato, nombramiento o escalafón se habilitan según categoría laboral.
- Placa se habilita o exige según tipo de vehículo.
- Motivo de revocación solo se habilita al revocar una relación.
- Fecha fin solo se habilita cuando se selecciona vigencia limitada.

### Reglas técnicas

- Al deshabilitar un campo, limpiar su valor si ya no aplica, salvo que se requiera conservarlo para volver a la opción anterior durante la misma edición.
- El backend debe ignorar o rechazar valores enviados para campos que no aplican.
- No depender del atributo HTML `disabled` como regla de seguridad.
- Usar esquemas condicionales compartidos entre frontend y backend.

---

## 21. Identificación de campos opcionales

- Añadir el texto `(opcional)` en la etiqueta o una ayuda accesible.
- No usar un asterisco para campos opcionales; reservarlo para obligatorios.
- Ejemplo: `Teléfono de respaldo (opcional)`.
- Si el teléfono es opcional, aceptar `NULL`; si se ingresa, validarlo.
- No mostrar errores de obligatoriedad en campos opcionales vacíos.
- Incluir la condición cuando sea contextual: `Empresa (obligatoria para personal externo contratado)`.

---

## 22. Campos obligatorios deben impedir guardar

### Frontend

- Marcar visualmente el campo.
- Deshabilitar o bloquear la acción de guardado mientras existan errores.
- Al intentar guardar, enfocar el primer campo inválido y mostrar resumen de errores accesible.

### Backend

- Rechazar cadenas vacías, espacios y `NULL` en campos obligatorios.
- Aplicar reglas condicionales según tipo de registro.
- Devolver un error por campo.

### Base de datos

- Usar `NOT NULL` donde la obligatoriedad sea universal.
- Usar `CHECK` o trigger cuando dependa de otros campos.
- No colocar `NOT NULL` en un campo condicional sin representar adecuadamente el caso en el modelo.

---

## 23. Evitar datos redundantes o columnas equivalentes

### Auditoría obligatoria

Revisar tablas, vistas, formularios y DTO para detectar:

- dos columnas que almacenen el mismo valor sin finalidad distinta;
- código y nombre duplicados literalmente en todas las filas;
- datos derivados almacenados sin necesidad;
- claves foráneas acompañadas por copias de nombres que se desactualizan;
- estados repetidos con significados diferentes.

### Precaución

No eliminar automáticamente pares como `codigo_categoria` y `nombre_categoria`, o `codigo_parametro` y `nombre_parametro`. Pueden tener propósitos legítimos:

- el código es estable y usado por lógica;
- el nombre es una etiqueta modificable para la interfaz.

Solo consolidar cuando se demuestre que son semánticamente idénticos y no tienen consumidores diferentes.

### Implementación

- Preferir claves foráneas y consultar el nombre desde la tabla maestra.
- Crear migración de datos y actualizar consultas antes de eliminar una columna.
- Mantener compatibilidad temporal si existen clientes o vistas dependientes.

---

## 24. Ortografía de interfaz y datos

### Frontend

- Revisar menús, títulos, botones, ayudas, placeholders, mensajes, estados y errores.
- Usar correctamente: `cédula`, `vehículo`, `sesión`, `contraseña`, `Politécnica`, `administración`, `asignación`, `búsqueda`.
- Unificar terminología; no alternar entre `password`, `clave` y `contraseña` en la interfaz.
- Crear un catálogo central de textos para evitar variantes.

### Datos maestros

- Corregir nombres de roles, estados, permisos y parámetros visibles al usuario.
- No modificar códigos técnicos estables solo por ortografía.
- Registrar cambios de catálogos en bitácora.

### Pruebas

- Añadir revisión de cadenas visibles y, si es viable, herramienta de detección ortográfica en CI.

---

# 4. Desarrollo específico de los cambios 25 al 38

## 25. Todo el frontend debe estar en español

### Alcance

Incluye:

- navegación;
- autenticación;
- formularios;
- tablas;
- filtros;
- paginación;
- modales;
- notificaciones;
- mensajes de validación;
- estados vacíos;
- errores 401, 403, 404 y 500;
- recuperación y cambio de contraseña;
- formatos de fecha y hora.

### Reglas

- Centralizar textos mediante i18n o un catálogo, aunque solo exista español inicialmente.
- Configurar localización `es-EC`.
- Mantener en inglés únicamente identificadores internos, nombres de tablas, variables o mensajes técnicos no visibles.
- Traducir textos provenientes de librerías mediante sus adaptadores de idioma.
- No mostrar al usuario errores crudos del proveedor de autenticación o base de datos.

---

## 26. Cambiar contraseña debe cerrar automáticamente la sesión

### Comportamiento obligatorio

Después de un cambio de contraseña exitoso, sea voluntario, obligatorio o por recuperación:

1. Actualizar la contraseña mediante el proveedor de autenticación seguro.
2. Revocar todas las sesiones y refresh tokens del usuario en servidor/proveedor.
3. Marcar como cerradas o revocadas las filas activas de `sesion`:
   - `fecha_cierre = now()`;
   - `estado_sesion = 'CERRADA_CAMBIO_PASSWORD'` o estado equivalente.
4. Limpiar cookies/tokens del cliente.
5. Redirigir al login con el mensaje: `La contraseña se actualizó correctamente. Inicie sesión nuevamente.`
6. Registrar el evento en `bitacora_sistema` sin guardar contraseña ni token.

### Seguridad

- Para cambio voluntario, solicitar contraseña actual o reautenticación equivalente.
- No cerrar sesiones solo en frontend; la revocación debe ser efectiva en backend/proveedor.
- Rotar o destruir identificadores de sesión anteriores.

---

## 27. Deshabilitar “Debes cambiar tu contraseña de arranque” después del cambio

### Fuente de verdad

- `usuario_sistema.requiere_cambio_password`.

### Flujo

1. Usuario creado con contraseña temporal: `requiere_cambio_password = true`.
2. Al iniciar sesión, el guard de rutas obliga a ir a la pantalla de cambio inicial.
3. Mientras el valor sea `true`, el usuario no puede acceder al resto del sistema, salvo cerrar sesión.
4. Tras cambiar correctamente la contraseña:
   - actualizar `requiere_cambio_password = false` dentro del mismo flujo lógico;
   - deshabilitar u ocultar la pestaña `Debes cambiar tu contraseña de arranque`;
   - cerrar todas las sesiones según el punto 26.
5. En el siguiente login, el usuario entra al sistema normal.

### Consistencia

No actualizar el indicador antes de confirmar que el proveedor de autenticación cambió la contraseña. Si falla cualquier paso, el estado debe seguir pendiente.

---

## 28. Actualizar “Cambio requerido” de “Pendiente” a “Realizado”

### Presentación

Mapeo recomendado:

- `requiere_cambio_password = true` → `Pendiente`.
- `requiere_cambio_password = false` → `Realizado`.

### Reglas

- No almacenar ambos textos si pueden derivarse del booleano.
- Actualizar la interfaz inmediatamente después de la operación y volver a consultar la fuente de verdad.
- Si existe caché, invalidarla.
- No mostrar `No pendiente`, `False` ni términos técnicos.
- Registrar fecha del cambio si el negocio necesita evidencia. En ese caso, añadir un campo como `fecha_cambio_password_inicial`, sin almacenar la contraseña.

---

## 29. Revisar sesiones activas que no se cierran

### Auditoría

Revisar:

- creación de fila al iniciar sesión;
- renovación de token;
- logout manual;
- expiración por inactividad;
- expiración absoluta;
- cierre de navegador;
- cambio o recuperación de contraseña;
- bloqueo o baja de usuario;
- refresh de token que esté creando sesiones duplicadas;
- sesiones cuyo `fecha_expiracion` pasó pero continúan con estado activo.

### Modelo recomendado

La tabla `sesion` puede ampliarse, si el proveedor no ofrece esta información, con:

- `fecha_ultima_actividad timestamptz`;
- `user_agent text`;
- `dispositivo_nombre varchar`;
- `motivo_cierre varchar`;
- `revocada_por uuid` nullable;
- `fecha_revocacion timestamptz` nullable;
- identificador estable de sesión/dispositivo;
- hash del token, nunca token en texto plano.

### Reglas

- Una renovación de access token no debe crear una sesión lógica nueva.
- Al logout, invalidar en servidor y actualizar la fila.
- Cerrar automáticamente sesiones vencidas mediante consulta programada o al validarlas.
- Aplicar timeout de inactividad y timeout absoluto configurables.
- Mostrar al usuario/admin las sesiones activas con fecha, dispositivo aproximado e IP, sin exponer tokens.
- Permitir cerrar una sesión concreta o todas las demás, según permisos.
- Bloquear nuevas acciones si la sesión figura revocada aunque el cliente conserve un token.
- Registrar creación, renovación y cierre en bitácora usando identificadores no sensibles.

### Restricción sugerida

Evitar múltiples filas activas para el mismo identificador lógico de sesión. No imponer una sola sesión por usuario salvo que sea un requerimiento explícito; si se limita, usar un parámetro como `MAX_SESIONES_CONCURRENTES`.

---

## 30. “Recordar sesión” debe ser funcional y seguro

### Corrección del requerimiento

“Recordar sesión” no debe guardar ni autocompletar la contraseña. Debe conservar una sesión autenticada mediante mecanismos seguros del proveedor.

### Comportamiento

- Sin seleccionar `Recordar sesión`:
  - cookie o sesión de corta duración;
  - expira al cerrar el navegador o al alcanzar el timeout definido.
- Seleccionado:
  - refresh token rotatorio o sesión persistente de duración mayor;
  - cookie `Secure`, `HttpOnly` y `SameSite` cuando la arquitectura lo permita;
  - registro `sesion.recordar_sesion = true`;
  - revocación disponible desde el servidor.

### Límite importante

Una sesión se vincula necesariamente con el navegador o dispositivo que posee el token. No es seguro “mantener las credenciales” automáticamente en cualquier navegador diferente. En otro navegador o dispositivo se debe volver a autenticar, salvo que exista un proveedor de identidad institucional con inicio de sesión único.

### Prohibiciones

- No guardar contraseña en `localStorage`, `sessionStorage`, IndexedDB, cookies legibles por JavaScript ni base de datos de la aplicación.
- No guardar access/refresh tokens en texto plano en `sesion`.
- No confiar únicamente en una bandera local del navegador.

---

## 31. Hacer funcional “¿Olvidó su contraseña?”

### Flujo obligatorio

1. Usuario ingresa correo o identificador.
2. Responder siempre de forma neutral: `Si existe una cuenta asociada, recibirá instrucciones para restablecer la contraseña.`
3. Generar token criptográficamente aleatorio, de un solo uso y con expiración corta, o usar el flujo seguro del proveedor de identidad.
4. Guardar solo hash del token si el sistema lo administra.
5. Enviar enlace por canal verificado.
6. Al abrirlo, validar token, vigencia, uso previo y usuario activo.
7. Solicitar nueva contraseña y confirmación.
8. Aplicar política de contraseña y evitar reutilización si el proveedor lo soporta.
9. Marcar token como usado.
10. Invalidar todas las sesiones.
11. Enviar notificación de que la contraseña fue cambiada, sin incluirla.
12. Redirigir al login; no iniciar sesión automáticamente.

### Controles

- Rate limiting por IP y cuenta.
- Tiempo de respuesta uniforme para reducir enumeración.
- No revelar si el correo existe.
- No enviar contraseñas temporales por correo.
- Expiración sugerida configurable, por ejemplo 15–30 minutos.
- Invalidar tokens anteriores cuando se emita uno nuevo o cuando se complete el cambio.
- Registrar solicitudes y resultados en bitácora sin guardar el token.

### Base de datos

Si el proveedor no gestiona el proceso, crear una tabla específica con usuario, hash de token, fechas, IP, estado y número de intentos. Aplicar RLS para impedir acceso desde clientes normales.

---

## 32. Conservar el formulario al cambiar pestaña, página o aplicación

### Problema a corregir

Cambiar con `Alt + Tab`, perder el foco, cambiar de pestaña del navegador o recibir un evento de visibilidad no debe:

- navegar a otra ruta;
- reiniciar el componente;
- limpiar el formulario;
- perder la selección actual;
- regresar a una pestaña anterior del sistema.

### Implementación

- Eliminar cualquier listener de `blur`, `focus` o `visibilitychange` que reinicie navegación o estado.
- Mantener el estado del formulario fuera de componentes que se desmontan al cambiar pestaña interna.
- Implementar borradores automáticos por usuario, módulo y registro:
  - guardar con debounce después de cambios;
  - guardar también al evento `visibilitychange`;
  - restaurar al volver a la ruta;
  - eliminar el borrador después de guardar o cancelar explícitamente.
- Para datos no sensibles, puede usarse almacenamiento local por navegador.
- Para continuidad entre dispositivos o sesiones, usar un borrador en backend con permisos y expiración.
- No almacenar contraseñas, tokens, biometría ni información altamente sensible en almacenamiento web persistente.
- Añadir aviso al intentar cerrar o recargar solo cuando haya cambios sin guardar; no depender exclusivamente de `beforeunload`.
- Usar una clave que incluya `id_usuario`, módulo, tipo de formulario y entidad para evitar mezclar borradores.
- Si dos pestañas editan el mismo registro, detectar conflicto de versión o `fecha_modificacion`.

### Criterios de aceptación

- Iniciar registro de persona, escribir datos, hacer `Alt + Tab` y volver: los datos permanecen.
- Cambiar entre pestañas internas y volver: los datos permanecen.
- Recargar accidentalmente: se ofrece restaurar el borrador.
- Guardar exitosamente: el borrador se elimina.
- Cerrar sesión: se limpian borradores sensibles y se evita que otro usuario los recupere.

---

## 33. Unificar encabezado de usuario y rol

### Componente único

Crear un componente reutilizable para encabezados de usuario con dos líneas:

1. Nombre visible o nombre de usuario.
2. Rol visible.

### Reglas de formato

- Primera letra en mayúscula donde corresponda.
- Mantener tildes y nombres compuestos.
- No usar valores distintos en cada módulo.
- Obtener el rol de la asignación activa y su catálogo, no de texto hardcodeado disperso.

### Caso obligatorio

```text
Admin
Administrador del Sistema
```

### Otros casos

- El nombre personal debe provenir de `persona.nombres` y `persona.apellidos`, o del nombre de usuario si no existe perfil.
- Si existen varios roles activos, mostrar el rol efectivo actual o una lista definida por la UX; no escoger uno arbitrariamente.
- Corregir datos maestros como `Administrador del Sistema`, no solo aplicar CSS.

---

## 34. Restringir acceso del guardia según turno y hora

### Campos relacionados

- `guardia_punto_control.id_usuario`.
- `guardia_punto_control.turno`.
- `fecha_inicio`, `fecha_fin`, `estado_asignacion`.
- `parametro_sistema` para horarios y tolerancias.

### Fuente de tiempo

Usar `now()` del servidor/base de datos, convertido a `America/Guayaquil`. No usar la hora del cliente.

### Configuración

No hardcodear horas. Definir parámetros, por ejemplo:

- `TURNO_MATUTINO_INICIO`.
- `TURNO_MATUTINO_FIN`.
- `TURNO_VESPERTINO_INICIO`.
- `TURNO_VESPERTINO_FIN`.
- `TOLERANCIA_INGRESO_GUARDIA_MINUTOS`, si aplica.

### Regla de autorización

Para un usuario cuyo rol efectivo sea Guardia:

1. El usuario debe estar activo.
2. Debe existir una asignación activa en `guardia_punto_control`.
3. La fecha actual debe estar dentro de `fecha_inicio` y `fecha_fin`, considerando `NULL` como vigencia abierta cuando sea válido.
4. El turno debe ser `MATUTINO` o `VESPERTINO` dentro del catálogo permitido.
5. La hora actual debe pertenecer a la ventana configurada para ese turno.
6. El punto de control debe estar activo.
7. Si no cumple, denegar login o acceso operativo con mensaje en español.

### Mensajes

- `No tiene una asignación activa para este momento.`
- `Su turno no se encuentra habilitado a esta hora.`
- `Comuníquese con el administrador para revisar su asignación.`

### Ubicación de la validación

- Debe ejecutarse en backend inmediatamente después de autenticar y también al acceder a operaciones sensibles.
- No basta con ocultar el menú.
- Si el turno termina durante una sesión, definir política: cerrar sesión, bloquear nuevas operaciones o conceder una tolerancia configurable.
- Registrar intentos denegados en bitácora.
- No afectar a administradores u otros roles salvo que el modelo de permisos lo indique.

---

## 35. Unificar Vehículos y Asociaciones

### UX

El formulario de registro de vehículo debe incluir en el mismo flujo:

- datos del vehículo;
- búsqueda de persona propietaria/responsable por cédula;
- visualización de nombres y categoría para confirmar identidad;
- tipo de relación;
- fecha de inicio;
- confirmación de asociación.

No usar un `combo box` con todas las personas.

### Búsqueda

- Buscar por cédula exacta normalizada.
- Validar la cédula antes de consultar.
- Aplicar debounce solo si se permite búsqueda parcial; para asociación se recomienda coincidencia exacta.
- Mostrar un único resultado confirmado o mensaje de no encontrado.
- Respetar RLS y permisos.
- No exponer listados completos de personas.

### Regla de máximo dos vehículos

Una persona no puede tener más de dos relaciones vehiculares activas que computen para el límite.

Definir explícitamente qué relaciones cuentan, por ejemplo:

- `estado_relacion = 'ACTIVA'`;
- `fecha_fin IS NULL OR fecha_fin >= now()`;
- tipos de relación `PROPIETARIO` o `RESPONSABLE`, según negocio.

### Base de datos

Implementar la regla mediante función/trigger transaccional, no solo contando en frontend. Para evitar condiciones de carrera:

1. Bloquear de manera adecuada la persona o sus relaciones activas durante la operación.
2. Contar relaciones activas.
3. Rechazar si ya tiene dos.
4. Crear `vehiculo` y `persona_vehiculo` en la misma transacción.

### Otras restricciones

- Un vehículo no debe tener dos relaciones principales activas incompatibles.
- No duplicar la misma asociación activa persona-vehículo.
- Mantener historial cerrando la relación previa, no eliminándola.
- Si falla la asociación, no dejar un vehículo huérfano.
- Aplicar unicidad de placa normalizada.

### Criterios de aceptación

- Persona con 0 o 1 vehículo activo: puede asociar otro.
- Persona con 2: backend rechaza el tercero incluso con solicitudes simultáneas.
- Búsqueda por cédula inválida: no consulta.
- Fallo al crear relación: rollback del vehículo.

---

## 36. Unificar registros y asignaciones relacionadas

### Regla general

Cuando una entidad no es funcional sin una asociación inicial, crear ambas en una sola pantalla y transacción.

### Usuario y rol

El formulario de creación de usuario debe incluir:

- búsqueda de persona por cédula;
- nombre de usuario;
- correo ingresado manualmente;
- rol o roles permitidos;
- estado inicial;
- indicador de cambio obligatorio de contraseña;
- confirmación.

La operación debe crear `usuario_sistema` y `usuario_rol` atómicamente.

### Consideraciones

- Confirmar en el código si un usuario puede tener uno o varios roles activos.
- Si solo se permite uno, aplicar índice/regla de una asignación activa.
- Si se permiten varios, impedir duplicar el mismo rol activo.
- No crear usuario sin rol cuando el sistema no pueda operar así.
- No dejar asignación sin usuario.
- Aplicar permisos y RLS.
- Registrar ambos cambios en bitácora.

### Otros módulos

Auditar patrones equivalentes, por ejemplo:

- memorando y personas autorizadas;
- guardia y punto de control;
- rol y permisos;
- persona interna y su detalle.

Unificar solo cuando mejore el flujo y no elimine la capacidad de editar o revocar asociaciones históricas.

---

## 37. Buscar personas por cédula en todo el sistema

### Regla

Reemplazar combos masivos de personas por un componente común de búsqueda por cédula.

### Componente reutilizable

Debe incluir:

- entrada de 10 dígitos;
- normalización y validación de cédula;
- botón o búsqueda automática controlada;
- estado `Buscando…`;
- resultado con nombres, apellidos, categoría y estado;
- confirmación de selección;
- mensaje `No se encontró una persona con esa cédula.`;
- opción de limpiar selección.

### Seguridad y privacidad

- Exigir permiso de consulta.
- Buscar solo los campos necesarios.
- No devolver listados amplios por coincidencias parciales sin justificación.
- No revelar datos sensibles adicionales.
- Aplicar rate limiting si el endpoint puede ser abusado.

### Casos

Usar el componente en vehículos, usuarios, memorandos, autorizaciones, eventos y cualquier asociación que actualmente cargue todas las personas.

---

## 38. Evitar autocompletar correos a partir del nombre

### Regla

Eliminar cualquier lógica que genere automáticamente correos del tipo:

```text
nombre.apellido@epn.edu.ec
```

### Motivo funcional

Los correos institucionales pueden incluir números, segundos apellidos, iniciales u otras reglas para resolver homónimos. El nombre no determina de forma única el correo.

### Implementación

- `persona.correo`, `persona.correo_respaldo` y `usuario_sistema.correo_electronico` deben ingresarse o seleccionarse desde una fuente institucional autorizada.
- Si existe directorio institucional, permitir búsqueda y confirmación; no inferir.
- Validar formato, unicidad y, cuando corresponda, dominio permitido.
- Mostrar el correo completo antes de guardar.
- No sobrescribir un correo existente cuando cambien nombres o apellidos.
- No usar el correo derivado como `nombre_usuario` sin confirmación.
- Si el correo es opcional, dejarlo en `NULL`; no inventar uno.

---

# 5. Cambios de base de datos recomendados

> Los siguientes cambios son una guía. El implementador debe revisar datos, funciones, vistas, RLS, RPC y framework de autenticación antes de generar migraciones definitivas.

## 5.1 Funciones compartidas

Evaluar funciones como:

```text
normalizar_cedula(text) -> text
validar_cedula_ec(text) -> boolean
normalizar_ruc(text) -> text
validar_ruc_ec_estructural(text) -> boolean
normalizar_placa(text) -> text
esta_en_turno_guardia(uuid, timestamptz) -> boolean
```

Las funciones usadas en índices deben ser inmutables cuando técnicamente corresponda.

## 5.2 Restricciones e índices

- `persona.cedula`: formato válido y unicidad normalizada.
- `empresa.ruc`: unicidad parcial cuando no es nulo y validación estructural.
- `vehiculo.placa`: unicidad parcial normalizada cuando no es nula.
- `usuario_sistema.intentos_fallidos >= 0`.
- Coherencia de fechas en memorandos, relaciones, asignaciones y roles.
- Catálogo o `CHECK` para `turno`.
- Índice de búsqueda exacta por cédula.
- Índice para relaciones vehiculares activas por persona.
- Índice que impida duplicar una relación activa persona-vehículo.
- Índice que impida duplicar un rol activo por usuario.

## 5.3 Sesiones

Si la autenticación no lo resuelve, ampliar `sesion` para controlar:

- actividad;
- dispositivo;
- cierre/revocación;
- correlación estable con sesión del proveedor;
- motivo de cierre.

Crear proceso de cierre de sesiones expiradas y función de revocación global por usuario.

## 5.4 Recuperación de contraseña

Solo crear tabla propia si el proveedor no ofrece un flujo seguro. Nunca guardar token de restablecimiento en texto plano.

## 5.5 Borradores

Si se requiere continuidad entre dispositivos, evaluar una tabla:

```text
borrador_formulario(
  id_borrador,
  id_usuario,
  modulo,
  clave_formulario,
  datos_jsonb,
  version,
  fecha_actualizacion,
  fecha_expiracion
)
```

Aplicar cifrado o exclusión de campos sensibles, RLS por usuario y limpieza automática.

---

# 6. Estrategia de implementación

## Fase 1: auditoría

- Identificar stack, framework, proveedor de autenticación y capa de acceso a datos.
- Inventariar formularios, endpoints, RPC, funciones, triggers, constraints y RLS.
- Construir una matriz `requerimiento → estado actual → brecha → archivos afectados`.
- Ejecutar consultas de calidad de datos antes de migrar.

## Fase 2: validadores centrales

- Implementar normalización y validadores puros con pruebas unitarias.
- Reutilizarlos en frontend y backend cuando la arquitectura lo permita.
- Mantener la base de datos como última barrera.

## Fase 3: migraciones

- Normalizar datos existentes.
- Añadir restricciones gradualmente.
- Implementar transacciones y triggers de reglas cruzadas.
- Revisar y conservar RLS.

## Fase 4: autenticación y sesiones

- Corregir cambio de contraseña.
- Hacer funcional recuperación.
- Revisar “recordar sesión”.
- Cerrar sesiones vencidas, revocadas o afectadas por cambio de contraseña.
- Añadir visualización y cierre de sesiones si está dentro del alcance del módulo.

## Fase 5: frontend

- Español `es-EC`.
- Componentes comunes de formulario, errores, usuario/rol y búsqueda por cédula.
- Formularios unificados y operaciones atómicas.
- Persistencia de borradores.
- Eliminación de correos autogenerados.

## Fase 6: pruebas y documentación

- Unitarias, integración, RLS, migración, concurrencia y E2E.
- Documentar decisiones, parámetros y excepciones.
- Registrar pendientes que requieran acceso oficial a SRI, ANT, Registro Civil o directorio EPN.

---

# 7. Matriz mínima de pruebas

## Identificaciones

- Cédulas válidas generadas en fixture pasan.
- Cédulas con provincia, tercer dígito o verificador incorrecto fallan.
- RUC natural valida cédula y sufijo.
- RUC de sociedad no se rechaza solo por algoritmo legado.
- Caída del servicio oficial produce `NO VERIFICADO`, no `INVÁLIDO`.

## Personas y formularios

- Nombres con tildes, `ñ`, apóstrofe y guion pasan.
- Números o solo símbolos fallan.
- Campo obligatorio con espacios falla.
- Campo opcional vacío pasa.
- Campo no aplicable enviado manualmente es ignorado o rechazado por backend.

## Fechas

- 31 de febrero falla.
- Fecha final anterior a inicial falla.
- Rango nocturno funciona según configuración.
- Fecha de nacimiento futura falla.

## Vehículos

- Normalización de placa evita duplicados por guion, espacio o minúscula.
- Automóvil y motocicleta usan reglas distintas.
- Tercer vehículo activo se rechaza en backend.
- Dos solicitudes simultáneas no superan el máximo.
- Fallo de asociación revierte creación de vehículo.

## Usuarios y seguridad

- Usuario creado queda asociado con rol en una transacción.
- Cambio de contraseña marca `Realizado` y revoca sesiones.
- Token anterior deja de funcionar.
- Recuperación no revela existencia de cuenta.
- Token de recuperación expira y es de un solo uso.
- “Recordar sesión” no almacena contraseña.
- Sesiones expiradas no permanecen activas.

## Guardia

- Guardia dentro de turno y asignación activa puede entrar.
- Guardia fuera de turno no puede realizar operaciones.
- Manipular hora del navegador no cambia el resultado.
- Administrador no es bloqueado por una regla destinada solo a guardias.

## Persistencia del formulario

- `Alt + Tab` no borra datos.
- Cambiar pestaña interna no desmonta o reinicia el formulario.
- Recargar permite restaurar borrador.
- Guardar elimina borrador.
- Otro usuario no puede leerlo.

---

# 8. Definición de terminado

Un requerimiento solo se considera terminado cuando:

- está implementado en las capas necesarias;
- tiene pruebas automatizadas;
- no rompe RLS ni permisos;
- cuenta con migración reversible o estrategia de rollback;
- los datos existentes fueron auditados;
- la interfaz y errores están en español;
- los flujos sensibles quedan registrados en bitácora sin secretos;
- se documentaron las decisiones y excepciones;
- el frontend no es la única barrera;
- las pruebas de concurrencia cubren el máximo de dos vehículos;
- las sesiones realmente se invalidan en servidor/proveedor.

---

# 9. Referencias técnicas y oficiales

1. Servicio de Rentas Internas, información sobre conformación y validación de RUC:  
   https://www.sri.gob.ec/ruc-sociedades
2. Servicio de Rentas Internas, advertencia sobre RUC sin algoritmo local obligatorio para determinados contribuyentes:  
   https://www.sri.gob.ec/facturacion-electronica
3. Gobierno Electrónico del Ecuador, antecedente técnico de cambio de generación y validación del RUC:  
   https://minka.gob.ec/mintel/ge/rutr/gobec_forms/-/issues/32
4. OWASP, Authentication Cheat Sheet:  
   https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
5. OWASP, Session Management Cheat Sheet:  
   https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
6. OWASP, Forgot Password Cheat Sheet:  
   https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
7. OWASP, Input Validation Cheat Sheet:  
   https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
8. MDN, recomendaciones sobre `visibilitychange` y limitaciones de `beforeunload`:  
   https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event

---

## Nota final para implementación

La presencia de políticas RLS y llamadas como `auth.uid()` sugiere una integración de PostgreSQL con un proveedor de autenticación tipo Supabase, pero esto debe confirmarse en el repositorio. No se deben inventar APIs ni migraciones específicas de un proveedor sin revisar la implementación real.
