# Modelos de inferencia

Esta carpeta recibe únicamente modelos evaluados y exportados. La API busca `people-yolo11n.pt` aquí y, durante desarrollo, usa `backend/yolo11n.pt` como fallback.

Modelos futuros previstos:

- `people-yolo11n.pt`: detección de personas.
- `shelf-behavior.onnx`: estados PASS, APPROACH, ENGAGED e INTERACTION.
- `shelf-actions.onnx`: PICK_UP y PUT_BACK cuando el dataset alcance calidad suficiente.

Nunca se entrena desde FastAPI ni desde una carga del cliente.
