#!/usr/bin/env python3
"""Verifica el cierre de UNA sesion concreta desde administracion (req 29).

Comprueba que cerrar una sesion:
  * revoca esa sesion en el proveedor (su refresh token deja de servir),
  * NO afecta a las demas sesiones del mismo usuario,
  * queda registrada con motivo y fecha de cierre,
  * exige el permiso ADM_USUARIO_UPDATE.

Uso (deja las sesiones de prueba cerradas):

    export SB_URL="https://<ref>.supabase.co"
    export SB_ANON="<anon key>"
    export SB_PASSWORD="<clave comun de las cuentas de prueba>"
    export SB_USER="gary.defas@epn.edu.ec"        # opcional
    export SB_ADMIN="admin@epn.edu.ec"            # opcional
    export SB_SIN_PERMISO="heidy.tenelema@epn.edu.ec"  # opcional
    python3 scripts/prueba_cierre_sesion.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ["SB_URL"].rstrip("/")
ANON = os.environ["SB_ANON"]
PWD = os.environ["SB_PASSWORD"]
USER = os.environ.get("SB_USER", "gary.defas@epn.edu.ec")
ADMIN = os.environ.get("SB_ADMIN", "admin@epn.edu.ec")
SIN_PERMISO = os.environ.get("SB_SIN_PERMISO", "heidy.tenelema@epn.edu.ec")

fallos = []


def pedir(path, cuerpo=None, token=None, metodo="POST"):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f"{URL}{path}", data=datos, method=metodo)
    req.add_header("apikey", ANON)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token or ANON}")
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t.strip() else {})
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        return e.code, (json.loads(t) if t.strip() else {})


def login(email):
    _, r = pedir("/auth/v1/token?grant_type=password", {"email": email, "password": PWD})
    return r.get("access_token"), r.get("refresh_token")


def ok(cond, desc):
    print(("  OK    " if cond else "  FALLA ") + desc)
    if not cond:
        fallos.append(desc)


print("1) Dos dispositivos del mismo usuario")
tokA, refA = login(USER)
tokB, _ = login(USER)
_, sA = pedir("/rest/v1/rpc/registrar_sesion", {"p_dispositivo": "PC de prueba"}, tokA)
_, sB = pedir("/rest/v1/rpc/registrar_sesion", {"p_dispositivo": "Celular de prueba"}, tokB)
ok(sA.get("id_sesion_proveedor") and sB.get("id_sesion_proveedor"),
   "se guarda el identificador de sesion del proveedor")
ok(sA["id_sesion_proveedor"] != sB["id_sesion_proveedor"], "cada dispositivo tiene el suyo")

print("\n2) El administrador cierra SOLO la sesion del PC")
tokAdmin, _ = login(ADMIN)
cod, r = pedir("/rest/v1/rpc/cerrar_sesion_admin", {"p_id_sesion": sA["id_sesion"]}, tokAdmin)
ok(cod == 200 and r.get("cerrada") and r.get("revocada_en_proveedor"),
   "la RPC informa cierre y revocacion en el proveedor")

_, filas = pedir(
    f"/rest/v1/sesion?id_sesion=in.({sA['id_sesion']},{sB['id_sesion']})"
    "&select=id_sesion,estado_sesion,motivo_cierre,fecha_cierre",
    token=tokAdmin, metodo="GET")
por = {f["id_sesion"]: f for f in filas}
ok(por[sA["id_sesion"]]["estado_sesion"] == "REVOCADA", "la sesion del PC queda REVOCADA")
ok(por[sA["id_sesion"]]["motivo_cierre"] == "CIERRE_ADMINISTRATIVO", "con su motivo de cierre")
ok(por[sA["id_sesion"]]["fecha_cierre"] is not None, "y su fecha de cierre")
ok(por[sB["id_sesion"]]["estado_sesion"] == "ACTIVA", "la sesion del CELULAR sigue ACTIVA")

print("\n3) El dispositivo cerrado ya no puede renovar su sesion")
cod, r = pedir("/auth/v1/token?grant_type=refresh_token", {"refresh_token": refA})
ok(cod != 200 and "access_token" not in r, "el refresh token del PC fue revocado")

print("\n4) Sin ADM_USUARIO_UPDATE no se puede cerrar una sesion")
tokOtro, _ = login(SIN_PERMISO)
if tokOtro:
    cod, r = pedir("/rest/v1/rpc/cerrar_sesion_admin", {"p_id_sesion": sB["id_sesion"]}, tokOtro)
    ok(cod >= 400, "se rechaza por falta de permiso")
    ok("permiso" in str(r.get("message", "")).lower(), "y el mensaje esta en espanol")
else:
    print(f"   (no se pudo autenticar {SIN_PERMISO}; se omite)")

print("\n5) Limpieza")
pedir("/rest/v1/rpc/cerrar_sesion_admin", {"p_id_sesion": sB["id_sesion"]}, tokAdmin)

print("\n" + ("TODAS LAS COMPROBACIONES PASARON" if not fallos else f"FALLARON {len(fallos)}: {fallos}"))
sys.exit(1 if fallos else 0)
