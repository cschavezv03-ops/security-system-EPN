-- ADM · Parámetros: unidad de medida como columna propia.
--
-- Pedido del equipo (Requerimientos_ADM): "agregar la columna Unidad de medida junto a
-- Valor, por ejemplo: minutos, horas, intentos, vehículos o porcentaje. Quitar la unidad
-- de medida en Nombre."
--
-- Hasta ahora la unidad viajaba pegada al nombre ("Tiempo de sesion (min)"), que es dato
-- disfrazado de etiqueta: no se puede filtrar, ni ordenar, ni validar. Se extrae a su
-- propia columna con CHECK, y el nombre queda como nombre.
--
-- Valores del catálogo en MAYÚSCULAS y sin tildes (convención de CLAUDE.md); la
-- traducción a "Minutos"/"Vehículos" vive en la interfaz (lib/catalogos.ts).

alter table public.parametro_sistema
  add column if not exists unidad_medida text;

alter table public.parametro_sistema
  drop constraint if exists parametro_sistema_unidad_medida_check;

alter table public.parametro_sistema
  add constraint parametro_sistema_unidad_medida_check
  check (unidad_medida is null or unidad_medida = any (array[
    'MINUTOS', 'HORAS', 'DIAS', 'SEGUNDOS',
    'INTENTOS', 'VEHICULOS', 'PERSONAS', 'CARACTERES',
    'PORCENTAJE', 'HORA_DEL_DIA', 'DISTANCIA', 'NINGUNA'
  ]));

comment on column public.parametro_sistema.unidad_medida is
  'Unidad en la que se expresa valor_parametro. NULL en parámetros sin magnitud.';

-- Relleno de los 18 parámetros existentes: unidad, nombre sin la unidad y con tildes,
-- y descripción con la ortografía correcta (pedido "Textos" del mismo documento).
update public.parametro_sistema set
  unidad_medida = v.unidad,
  nombre_parametro = v.nombre,
  descripcion = v.descripcion
from (values
  ('LONGITUD_MINIMA_PASSWORD',           'CARACTERES',   'Longitud mínima de contraseña',                                  'Número mínimo de caracteres exigido al cambiar la contraseña.'),
  ('MAX_INTENTOS_LOGIN',                 'INTENTOS',     'Máximo de intentos de inicio de sesión',                          'Intentos fallidos consecutivos antes de bloquear la cuenta.'),
  ('MAX_VEHICULOS_POR_PERSONA',          'VEHICULOS',    'Máximo de vehículos por persona',                                'Límite de vehículos que puede asociarse una misma persona (docs/03_DECISIONES_Y_CORRECCIONES.md F3).'),
  ('PERMANENCIA_ABANDONO_H',             'HORAS',        'Permanencia para considerar un vehículo abandonado',              'Umbral a partir del cual se considera que un vehículo está abandonado.'),
  ('PERMANENCIA_MAX_EXTERNO_H',          'HORAS',        'Permanencia máxima de vehículo con conductor externo',            'Límite de permanencia de un vehículo cuyo conductor es externo con memorando.'),
  ('PERMANENCIA_MAX_INTERNO_H',          'HORAS',        'Permanencia máxima de vehículo con conductor interno',            'Límite de permanencia de un vehículo cuyo conductor es personal interno activo.'),
  ('PERMANENCIA_MAX_VISITA_H',           'HORAS',        'Permanencia máxima de vehículo en visita diaria',                 'Límite de permanencia de un vehículo cuyo conductor tiene autorización de visita diaria.'),
  ('SESION_INACTIVIDAD_MIN',             'MINUTOS',      'Tiempo de inactividad que expira la sesión',                      'Minutos de inactividad tras los que una sesión se marca como EXPIRADA.'),
  ('TIEMPO_BLOQUEO_CUENTA_MIN',          'MINUTOS',      'Tiempo de bloqueo de la cuenta',                                  'Minutos que la cuenta permanece bloqueada tras exceder los intentos fallidos.'),
  ('TIEMPO_SESION_MIN',                  'MINUTOS',      'Duración máxima de la sesión',                                    'Documenta el tiempo máximo de sesión; lo aplica Supabase Auth de forma nativa (§D10).'),
  ('TOLERANCIA_INGRESO_GUARDIA_MINUTOS', 'MINUTOS',      'Tolerancia de ingreso del guardia',                               'Minutos de gracia antes y después de la ventana del turno.'),
  ('TURNO_MATUTINO_INICIO',              'HORA_DEL_DIA', 'Inicio del turno matutino',                                       'Hora de inicio del turno matutino (HH:MM, América/Guayaquil).'),
  ('TURNO_MATUTINO_FIN',                 'HORA_DEL_DIA', 'Fin del turno matutino',                                          'Hora de fin del turno matutino (HH:MM, América/Guayaquil).'),
  ('TURNO_VESPERTINO_INICIO',            'HORA_DEL_DIA', 'Inicio del turno vespertino',                                     'Hora de inicio del turno vespertino (HH:MM, América/Guayaquil).'),
  ('TURNO_VESPERTINO_FIN',               'HORA_DEL_DIA', 'Fin del turno vespertino',                                        'Hora de fin del turno vespertino (HH:MM, América/Guayaquil).'),
  ('TURNO_NOCTURNO_INICIO',              'HORA_DEL_DIA', 'Inicio del turno nocturno',                                       'Hora de inicio del turno nocturno (HH:MM, América/Guayaquil).'),
  ('TURNO_NOCTURNO_FIN',                 'HORA_DEL_DIA', 'Fin del turno nocturno',                                          'Hora de fin del turno nocturno (HH:MM, cruza la medianoche).'),
  ('UMBRAL_BIOMETRIA',                   'DISTANCIA',    'Umbral de confianza biométrica',                                  'Confianza mínima (= 1 - distancia L2) para aceptar una coincidencia facial. 0.38 equivale a una distancia L2 máxima de 0.62, sobre descriptores face-api de 128 dimensiones. NO subir a 0.85: ese era el valor del esquema coseno anterior.')
) as v(codigo, unidad, nombre, descripcion)
where public.parametro_sistema.codigo_parametro = v.codigo;
