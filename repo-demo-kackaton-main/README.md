# SCAPDER — Spatial Intelligence

Aplicación que une la **configuración física de una tienda** (planograma) con **inteligencia calculada desde videos reales**: detecta personas con visión por computadora, las proyecta al piso en metros y mide tráfico, permanencia e interacción por góndola.

> *La configuración crea el espacio. El video crea la inteligencia. SCAPDER une ambos.*

Está pensada como demostración de retail analytics: no hace reconocimiento facial, de identidad, emociones, edad, género ni biometría. Toda identidad queda protegida de forma automática: durante el análisis se **difuminan las caras** en cada artefacto (fotogramas de evidencia, overlays) y en el **video anonimizado** (`anonymized.mp4`) que sirve el endpoint `/video` al frontend.

---

## Tabla de contenidos

1. [Qué incluye el repo](#1--qué-incluye-el-repo)
2. [Requisitos previos](#2--requisitos-previos)
3. [Clonar el proyecto](#3--clonar-el-proyecto)
4. [Correr el Backend (FastAPI)](#4--correr-el-backend-fastapi)
5. [Correr el Frontend (React)](#5--correr-el-frontend-react)
6. [Login con credenciales iniciales](#6--login-con-credenciales-iniciales)
7. [Flujo completo de uso](#7--flujo-completo-de-uso)
8. [Guía rápida de problemas](#8--guía-rápida-de-problemas-common-issues)
9. [Estructura del proyecto](#9--estructura-del-proyecto)
10. [Definición de métricas](#10--definición-de-métricas)
11. [Editor de planograma & calibración](#11--editor-de-planograma--calibración)
12. [Notas de producción](#12--notas-de-producción)

---

## 1.  Qué incluye el repo

| Carpeta | Qué es |
| --- | --- |
| `backend/` | API **FastAPI** + visión por computadora (YOLO, ByteTrack, homografía) + base SQLite |
| `frontend/` | App **React + Vite + Three.js** (flujo de uso y Digital Twin 3D) |
| `training/` | Dataset, anotaciones y scripts de entrenamiento (futuro modelo propio) |
| `models/exported/` | Modelos aprobados para inferencia |
| `.env.example` | Ejemplo de variables de entorno |

Pipeline del análisis de video:

```text
React → Login → Retailer → Site → subir MP4
                                            ↓
FastAPI → SQLite → YOLO → ByteTrack → homografía → zonas
                                              ↓
     trayectorias → dwell → interacción inferida → heatmaps → 3D
```

---

## 2.  Requisitos previos

Instala esto **antes** de continuar (versiones con las que funciona el proyecto):

- **Python 3.11** (usado para crear el virtualenv del backend).
  - Verifica: `python --version` o `py --version`
- **Node.js LTS** (18+). El proyecto se probó con Node 22.
  - Verifica: `node --version`
- **npm** (viene con Node).
  - Verifica: `npm --version`
- **Git** (para clonar).
- *(Opcional)* GPU NVIDIA con CUDA: acelera el modelo YOLO, pero **no es obligatorio**; en CPU también funciona (más lento).

> Para Windows **PowerShell**, cuando pidas permisos de ejecución de scripts de `.venv`, corre en la terminal (una vez):
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

---

## 3.  Clonar el proyecto

```bash
git clone <URL_DEL_REPO>
cd repo-demo-kackaton-main
```

> Nota: el repo NO incluye `node_modules/` ni `.venv/` (están en `.gitignore`). Los creamos en los pasos siguientes.

---

## 4.  Correr el Backend (FastAPI)

### 4.1. Crear el entorno virtual e instalar dependencias

Abre una terminal en la carpeta `backend/`:

```powershell
cd backend
py -3.11 -m venv .venv
```

> Si `py` no te funciona, prueba directamente con: `python -m venv .venv`

Activa el entorno virtual:

```powershell
.venv\Scripts\Activate.ps1
```

> En la terminal debe aparecer `(.venv)` al inicio de la línea. Si te da error de permisos, corre primero:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

Instala las dependencias:

```powershell
pip install -r requirements.txt
```

Esto descarga FastAPI, OpenCV, Ultralytics (YOLO), ByteTrack, entre otros. Puede tomar unos minutos.

### 4.2. (Opcional) Variables de entorno

Copia `.env.example` a `.env` en la raíz del proyecto si quieres definir una clave secreta propia:

```
SCAPDER_SECRET_KEY=una-clave-larga-y-aleatoria
SCAPDER_BLUR_FACES=1
```

`SCAPDER_BLUR_FACES` (activa por defecto) difumina las caras de las personas en todos los outputs. Cuando está activa, el análisis genera una copia del video con los rostros borrosos y `/api/analyses/<id>/video` la sirve en lugar del archivo original. Usa el ffmpeg incluido en `imageio-ffmpeg` (dependencia ya presente en `backend/requirements.txt`).

Si no defines la clave secreta, el backend usa una por defecto (solo válida para desarrollo local).

### 4.3. Arrancar el servidor

Asegúrate de estar en `backend/` con el venv activo, y ejecuta:

```powershell
uvicorn app.main:app --reload
```

Deberías ver algo como:

```text
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

- La **API** vive en `http://localhost:8000`.
- Docs interactivas (Swagger): `http://localhost:8000/docs`.
- Health check: `http://localhost:8000/api/health` → `{"status":"ok"}`.

> ⚠️ El puerto **8000 debe estar libre**. Si ya hay algo corriendo ahí, mira la [guía de problemas](#8--guía-rápida-de-problemas-common-issues).
>
> Al primer arranque se **inicializa la base** (SQLite) y se crea la sede de demo con datos de ejemplo.

---

## 5.  Correr el Frontend (React)

Deja el backend corriendo y abre **otra terminal** en la carpeta `frontend/`:

```powershell
cd frontend
npm install
npm run dev
```

Deberías ver:

```text
  VITE v7.x.x  ready in X ms
  ➜  Local:   http://localhost:5173/
```

Abre el navegador en **http://localhost:5173**.

> El frontend usa un **proxy**: las rutas `/api` y `/media` se redirigen automáticamente a `http://127.0.0.1:8000` (configurado en `frontend/vite.config.js`). No hay que configurar URLs manualmente.

---

## 6.  Login con credenciales iniciales

El proyecto arranca con estos usuarios (creados en `backend/app/seed.py`):

| Rol | Email | Contraseña |
| --- | --- | --- |
| **Admin** | `admin@scapder.ai` | `Scapder2026!` |
| **Analista (retailer)** | `analista@retail.co` | `Retail2026!` |

Usa el **admin** si quieres editar calibración/planogramas. El analista sirve para ver resultados.

---

## 7.  Flujo completo de uso

Una vez dentro de la app (admin):

1. **Retailer → Sites**: aparece la sede de demo **"Flagship 93"** (piso 12×8 m).
2. **Editor de planograma**: añade/arrastra/redimensiona góndolas y define la geometría de la tienda. (*Detalle abajo.*)
3. **Calibrar cámara**: arrastra los 4 puntos (P1–P4) para alinear la cuadrícula en metros con el piso real del video. *(Detalle abajo.)*
4. **Detectar góndolas** (opcional): dibuja manualmente sobre el frame o usa el botón de sugerencia automática (Canny + Hough). Siempre puedes corregirlas a mano.
5. **Subir un MP4** del piso (cámara fija) y esperar a que termine el análisis.
6. **Ver resultados**:
   - **Mapa 3D** con heatmaps de tráfico / permanencia / interacción y trayectorias.
   - **Video** real con el overlay de góndolas, ticks de interacción en la línea de tiempo, histograma y lista de eventos.
   - **Matriz por góndola** (3×3) con métricas y progreso de etiquetado de productos.

> El video debe mostrar un piso con cámara fija. Para resultados confiables es clave hacer bien la **calibración de 4 puntos** y el **planograma**.

---

## 8.  Guía rápida de problemas (Common issues)

| Síntoma | Causa posible | Solución |
| --- | --- | --- |
| `Address already in use` en el backend | Puerto 8000 ocupado | En Windows: `Get-NetTCPConnection -LocalPort 8000 | Select OwningProcess` y mata el proceso, o usa el comando de abajo |
| Error al activar `.venv` (política de scripts) | Permisos de PowerShell | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| `pip install` falla por net | falta conexión / mirror | Reintenta; opcional usa mirror local (`-i https://pypi.org/simple`) |
| El frontend carga pero las imágenes/videos no | Backend no está corriendo en 8000 | Levanta el backend y refresca |
| Análisis muy lento | Se corre sobre CPU | Normal; los modelos YOLO tardan más sin GPU |
| `yolo11n.pt` no descarga / error de modelo | El peso corre a `backend/` | Copia `backend/yolo11n.pt`; si falta, ultralytics lo baja solo. Si da error, descárgalo a la carpeta `backend/` |
| ImportError `lap` | Dependencia de tracking | Ya incluida en `requirements.txt` (`lap>=0.5.12`); reinstala requirements |
| Se ve un servidor viejo / cambios del backend no se aplican | Uvicorn no está en `--reload` o proceso stale | Reinicia `uvicorn app.main:app --reload` |

### Matar un proceso que ocupa el puerto 8000 (Windows)

```powershell
# Encontrar el PID que usa el puerto
Get-NetTCPConnection -LocalPort 8000 | Select-Object -ExpandProperty OwningProcess

# Matarlo (sustituye PID por el número)
Stop-Process -Id <PID> -Force
```

### Reset limpio de la base

Si quieres volver a los datos de fábrica:

```powershell
# En backend/
Remove-Item data\scapder.db
```

El backend la vuelve a crear con el seed al arrancar.

---

## 9.  Estructura del proyecto

```text
backend/
  app/
    main.py              # App FastAPI + CORS + routers
    security.py          # JWT, hash de contraseñas (PBKDF2), auth
    models.py            # Modelos SQLAlchemy (User, Retailer, Site, Analysis)
    seed.py              # Crea usuarios y la sede demo al primer arranque
    database.py          # Sesión SQLite
    routers/
      auth.py            # login
      catalog.py         # retailers, sites, configuración, suggest-gondolas
      analyses.py        # subir video, estado, resultados y artefactos (/video)
    cv/
      detector.py        # YOLO (persona detección)
      pipeline.py        # orquesta: tracking + homografía + métricas + heatmaps
      spatial.py         # homografía normalizada / metros
      heatmaps.py        # mapa de calor por zona
      interaction.py     # inferencia de interacción
      shelf_detector.py  # sugerencia heurística de góndolas (Canny+Hough)
  data/
    scapder.db           # SQLite
    uploads/             # MP4 subidos
    results/             # heatmaps, frames, overlays generados
  requirements.txt
  yolo11n.pt             # peso del detector (se descarga al instalar)

frontend/
  src/
    App.jsx              # Orquestación de pantallas y estado
    main.jsx             # Entrada React
    styles.css           # Estilos
    api/client.js        # Cliente HTTP (Bearer token, videoUrl, artifactUrl)
    lib/homography.js    # Solver de homografía (4 puntos) en JS
    auth/                # Autenticación del frontend
    components/
      ...                # Vistas del flujo + Digital Twin 3D
  vite.config.js         # Proxy /api y /media → 127.0.0.1:8000
  package.json

training/                # Dataset, anotaciones, scripts (train.py, export.py)
models/exported/         # Modelos aprobados para inferencia
.env.example             # Variables de entorno de ejemplo
```

---

## 10.  Definición de métricas

- **Presencias rastreadas**: tracks ByteTrack con al menos dos segundos de observaciones. No equivale a personas únicas cuando el tracker fragmenta una misma persona en varios IDs.
- **Tráfico**: tracks temporales únicos próximos a cada góndola.
- **Permanencia**: segundos observados calculados con el FPS real.
- **Trayectorias**: puntos inferiores-centro proyectados por homografía al piso en metros.
- **Interacción inferida**: proximidad, baja velocidad y tiempo mínimo configurado. No confirma contacto.
- **Segmento vertical**: proxy de baja confianza basado en geometría corporal hasta disponer del modelo propio.

> El sistema **no** realiza reconocimiento facial, identidad, emociones, edad, género ni biometría. Además, por diseño, no expone rostros: difumina las caras en fotogramas de evidencia, overlays y en el video que reproduce el frontend. Desactívalo con `SCAPDER_BLUR_FACES=0` solo para depuración interna.

---

## 11.  Editor de planograma & calibración

### Editor de planograma

Antes de cargar o analizar un MP4 puedes:

- Cambiar **ancho y fondo** de la tienda.
- Añadir o eliminar cualquier cantidad de **góndolas**.
- **Arrastrar y redimensionar** cada góndola (mouse o táctil).
- Ajustar coordenadas y medidas en **metros**.
- Configurar **nombre** y **9 segmentos de productos** por góndola (3 niveles × 3 columnas).
- **Dibujar** una góndola directamente sobre el frame del video.
- **Guardar** la geometría en la sede para reutilizarla.

SCAPDER vuelve a guardar el plano visible antes de iniciar cada análisis. Cambiar el número de góndolas no "genera" métricas: define **dónde** se relacionan las detecciones reales del video.

### Calibración de cámara

La homografía convierte píxeles del video en **metros del piso**. El editor muestra:

- Una **rejilla en metros** superpuesta en vivo a la imagen de la cámara.
- El **contorno del piso** y las **góndolas proyectadas** mientras arrastras los 4 puntos (P1–P4).
- Los 4 puntos corresponden a esquinas físicas del piso que debes conocer (p. ej. la esquina de una baldosa o el borde de un estante).

Para métricas físicas correctas, un administrador debe alinear los 4 puntos de cámara con **4 correspondencias físicas** medidas en la sede (se guardan con `PUT /api/sites/{site_id}/configuration`). La sede de demo incluye una homografía de demostración para que el flujo funcione de entrada.

---

## 12.  Notas de producción

- La demo persiste jobs en **SQLite** y ejecuta inferencia en un **hilo local**. Para múltiples usuarios o varias GPU, reemplaza ese dispatcher por **Celery/RQ + PostgreSQL** sin cambiar los módulos de `app/cv/`.
- Fuera de desarrollo, define una `SCAPDER_SECRET_KEY` fuerte y no la subas al repo.

---

## Hecho con

- **Backend**: Python · FastAPI · SQLAlchemy · OpenCV · Ultralytics (YOLO11) · ByteTrack · NumPy
- **Frontend**: React · Vite · Three.js · react-three-fiber/drei
- **Demo**: demo completa para retail analytics en tiempo y espacio

¿Dudas? Crea un issue en el repo o pregunta a @samu. 🚀
