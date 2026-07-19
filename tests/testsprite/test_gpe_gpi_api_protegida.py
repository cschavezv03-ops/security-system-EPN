"""Lo que añadió la ronda GPE/GPI sigue cerrado desde fuera.

Esta ronda tocó la base en cuatro sitios: columnas nuevas en `memorando`
(motivo_anulacion, fecha_anulacion), en `autorizacion_visita_diaria`
(motivo_revocacion), funciones de estado efectivo, y una tarea de pg_cron que
escribe sobre `memorando`.

Tres de esas cosas son escribibles o revelan información, así que conviene
comprobar la frontera más externa: sin credencial ninguna, PostgREST tiene que
rechazar tanto la lectura como la ejecución de las funciones nuevas.

Importa especialmente `sincronizar_estado_memorandos`, que es SECURITY DEFINER:
si quedara invocable sin autenticar, cualquiera desde internet podría reactivar
memorandos vencidos con una petición HTTP y darse acceso al campus.

Como el resto de pruebas de este proyecto, no usa ningún secreto: no caduca y se
puede volver a ejecutar dentro de seis meses.
"""

import requests

BASE = "https://hwfayejcwpmercvmmyvw.supabase.co/rest/v1"
TIMEOUT = 30

# Las tablas de GPE/GPI. Un memorando dice quién entra al campus y hasta cuándo; una
# autorización de visita, lo mismo por un día. `persona_interna_detalle` lleva cargo y
# contrato del personal.
TABLAS_PROTEGIDAS = [
    "memorando",
    "persona_memorando",
    "autorizacion_visita_diaria",
    "persona_interna_detalle",
    "persona_vehiculo",
    "vehiculo",
    "empresa",
]

# Funciones añadidas o tocadas en esta ronda.
FUNCIONES_PROTEGIDAS = [
    "sincronizar_estado_memorandos",
    "estado_memorando_efectivo",
    "estado_autorizacion_efectivo",
    "hora_corte_categoria",
    "es_numero_memorando",
]


def test_las_tablas_de_gpe_y_gpi_no_responden_sin_credencial():
    fallos = []
    for tabla in TABLAS_PROTEGIDAS:
        r = requests.get(f"{BASE}/{tabla}", params={"select": "*", "limit": 1}, timeout=TIMEOUT)
        if r.status_code == 200:
            fallos.append(f"{tabla}: HTTP 200 sin credencial (cuerpo: {r.text[:200]})")
        elif r.status_code not in (401, 403):
            fallos.append(f"{tabla}: HTTP {r.status_code}, se esperaba 401 o 403")
    assert not fallos, "Tablas alcanzables sin autenticar:\n" + "\n".join(fallos)


def test_las_funciones_nuevas_no_son_invocables_sin_credencial():
    """`sincronizar_estado_memorandos` es SECURITY DEFINER: escribe sobre memorando."""
    fallos = []
    for funcion in FUNCIONES_PROTEGIDAS:
        r = requests.post(f"{BASE}/rpc/{funcion}", json={}, timeout=TIMEOUT)
        if r.status_code == 200:
            fallos.append(f"{funcion}: HTTP 200 sin credencial (cuerpo: {r.text[:200]})")
    assert not fallos, "Funciones ejecutables sin autenticar:\n" + "\n".join(fallos)


def test_no_se_puede_escribir_un_memorando_sin_credencial():
    """Un POST anónimo no puede crear una autorización de acceso al campus."""
    r = requests.post(
        f"{BASE}/memorando",
        json={
            "numero_memorando": "EPN-INTRUSO-2026-0001",
            "fecha_inicio": "2026-01-01",
            "fecha_fin": "2026-12-31",
        },
        timeout=TIMEOUT,
    )
    assert r.status_code in (401, 403), f"HTTP {r.status_code}, se esperaba 401 o 403: {r.text[:300]}"


def test_los_errores_no_revelan_datos_de_memorandos():
    """Ni el mensaje de error puede llevar números de memorando o cédulas."""
    r = requests.get(f"{BASE}/persona_memorando", params={"select": "*"}, timeout=TIMEOUT)

    assert r.status_code in (401, 403), f"HTTP {r.status_code}, se esperaba 401 o 403"
    cuerpo = r.text.lower()
    for filtrado in ("epn-da-2026", "1750000", "estado_acceso", "numero_memorando"):
        assert filtrado not in cuerpo, f"El error menciona {filtrado!r}: {r.text[:300]}"
