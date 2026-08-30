# SCAPDER Spatial Intelligence

Aplicación responsive que une una configuración física persistente con inteligencia calculada desde videos reales.

> La configuración crea el espacio. El video crea la inteligencia. SCAPDER une ambos.

## Arquitectura

```text
React → Login → Retailer → Site → MP4
                            ↓
FastAPI → SQLite → YOLO → ByteTrack → homografía → zonas
                                              ↓
                  trayectorias → dwell → interacción inferida → heatmaps → 3D
```

- `backend/app/routers/`: autenticación, retailers, sedes, análisis y artefactos protegidos.
- `backend/app/cv/`: detector, ByteTrack, proyección, interacción, heatmaps y pipeline.
- `backend/data/scapder.db`: usuarios, retailer, configuración de sede y resultados persistentes.
- `frontend/src/`: flujo de aplicación y Digital Twin responsive.
- `training/`: dataset, anotaciones, entrenamiento, evaluación y exportación separados.
- `models/exported/`: modelos aprobados para inferencia.

## Ejecución

Backend:

```powershell
cd backend
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`.

Credenciales locales iniciales:

- Admin: `admin@scapder.ai` / `Scapder2026!`
- Retailer: `analista@retail.co` / `Retail2026!`

Configura `SCAPDER_SECRET_KEY` fuera del entorno local.

## Definición de métricas

- Presencias rastreadas: tracks ByteTrack con al menos dos segundos de observaciones. No equivale a personas únicas cuando el tracker fragmenta una misma persona en varios IDs.
- Tráfico: tracks temporales únicos próximos a cada góndola.
- Permanencia: segundos observados calculados con el FPS real.
- Trayectorias: puntos inferiores-centro proyectados por homografía al piso en metros.
- Interacción inferida: proximidad, baja velocidad y tiempo mínimo configurado. No confirma contacto.
- Segmento vertical: proxy de baja confianza basado en geometría corporal hasta disponer del modelo propio.

El sistema no realiza reconocimiento facial, identidad, emociones, edad, género ni biometría.

## Editor de planograma

Antes de cargar o analizar un MP4, el usuario puede:

- Cambiar ancho y fondo de la tienda.
- Añadir o eliminar cualquier cantidad de góndolas.
- Arrastrar y redimensionar cada góndola con mouse o controles táctiles.
- Ajustar coordenadas y medidas en metros.
- Configurar nombre y nueve segmentos de productos.
- Guardar la geometría en la sede para reutilizarla.

SCAPDER vuelve a guardar el plano visible antes de iniciar cada análisis. Cambiar el número de góndolas no genera métricas: solamente define dónde se relacionarán las detecciones reales del video.

## Crear otra sede

En `Retailer → Sites`, pulsa `Nueva sede` y registra nombre, ciudad, cámara y dimensiones del piso. La sede se crea con cero góndolas para evitar copiar geometría de otro local. Después se abre directamente el editor de planograma.

Cada cámara nueva queda con estado `uncalibrated`. Su transformación inicial solo aproxima toda la imagen al piso completo; debe sustituirse por cuatro correspondencias físicas antes de utilizar resultados en metros para decisiones reales.

## Calibración

La sede inicial contiene una homografía de demostración guardada en SQLite. Para métricas físicas correctas, un administrador debe reemplazar los cuatro puntos de cámara por puntos medidos en la sede mediante `PUT /api/sites/{site_id}/configuration`.

## Producción

La demo persiste jobs en SQLite, pero ejecuta inferencia en un hilo local. Para múltiples usuarios o varias GPU, reemplaza ese dispatcher por Celery/RQ y PostgreSQL sin cambiar los módulos de `app/cv/`.
