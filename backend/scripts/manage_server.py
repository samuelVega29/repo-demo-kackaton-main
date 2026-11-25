"""Gestión del servidor de desarrollo multiplataforma (Windows ok).

Problema que resuelve: matar el supervisor uvicorn no siempre mata el worker,
dejando un proceso zombie ocupando :8000 (con código viejo, sin --reload).

Uso:
    python manage_server.py start    # lanza uvicorn con --reload, en segundo plano
    python manage_server.py stop     # mata TODOS los procesos que escuchan en :8000
    python manage_server.py status   # muestra qué hay en :8000


Ejecutar desde la carpeta `backend/` (depende de app.main).
"""

from __future__ import annotations

import os
import signal
import socket
import sys
import subprocess
from pathlib import Path

HOST = "0.0.0.0"
PORT = 8000
LOG_DIR = Path(__file__).resolve().parents[1]


def owning_pids_on_port(port: int) -> list[int]:
    """Devuelve los PID locales que escuchan/usan `port` (no usa netstat, es portable)."""
    pids: set[int] = set()
    if os.name == "nt":
        # Windows: netstat -ano -p TCP y filtrar la columna PID.
        try:
            out = subprocess.check_output(
                ["netstat", "-ano", "-p", "TCP"], text=True, encoding="utf-8", errors="ignore"
            )
        except Exception:
            return []
        for line in out.splitlines():
            if f":{PORT}" not in line or "LISTEN" not in line:
                continue
            parts = line.split()
            pid = parts[-1]
            if pid.isdigit():
                pids.add(int(pid))
        return sorted(pids)
    else:
        try:
            import psutil
            for conn in psutil.net_connections(kind="inet"):
                if conn.laddr and conn.laddr.port == port:
                    if conn.pid:
                        pids.add(conn.pid)
        except Exception:
            pass
        return sorted(pids)


def stop() -> None:
    pids = owning_pids_on_port(PORT)
    if not pids:
        print(f"Nada escuchando en :{PORT}.")
        return
    for pid in pids:
        print(f"Matando PID {pid} (en :{PORT})...")
        try:
            if os.name == "nt":
                if pid != os.getpid():
                    os.kill(pid, signal.SIGTERM)
            else:
                os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    print(f"Liberado :{PORT}.")


def start() -> None:
    if owning_pids_on_port(PORT):
        print(f"Ya hay un servidor en :{PORT}. Ejecuta `stop` primero.")
        sys.exit(1)
    out = LOG_DIR / "server.out.log"
    err = LOG_DIR / "server.err.log"
    logf = open(out, "w", encoding="utf-8")
    errf = open(err, "w", encoding="utf-8")
    cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", HOST, "--port", str(PORT), "--reload"]
    cwd = LOG_DIR  # backend/
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=logf, stderr=errf)
    print(f"Uvicorn lanzado PID {proc.pid} (--reload).")
    print(f"  stdout -> {out.name}")
    print(f"  stderr -> {err.name}")


def status() -> None:
    pids = owning_pids_on_port(PORT)
    if pids:
        print(f"En :{PORT} escuchan: PID {', '.join(map(str, pids))}")
    else:
        print(f"Puerto :{PORT} libre.")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    if action == "start":
        start()
    elif action == "stop":
        stop()
    elif action == "status":
        status()
    else:
        print(__doc__)
        sys.exit(1)