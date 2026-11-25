# Pipeline de entrenamiento SCAPDER

El entrenamiento está aislado de la aplicación web.

## Flujo

1. Grabar videos controlados con autorización.
2. Cortar clips y anonimizar material de trabajo cuando corresponda.
3. Anotar estados `PASS`, `APPROACH`, `ENGAGED`, `INTERACTION`, `PICK_UP` y `PUT_BACK`.
4. Separar por sesión y participante en `train/val/test` para evitar fuga de datos.
5. Entrenar y evaluar por clase, cámara, oclusión y distancia.
6. Exportar ONNX solamente si supera los umbrales de validación.
7. Copiar el artefacto aprobado a `models/exported/` y registrar su versión.

Los IDs de tracking son temporales. El dataset no debe contener etiquetas de identidad, rostro, emoción, edad, género ni biometría.

## Estructura

- `dataset/`: clips organizados por split; los videos no se versionan en Git.
- `annotations/`: etiquetas de detección, secuencia y eventos.
- `configs/behavior.yaml`: clases y umbrales de aceptación.
- `scripts/train.py`: punto de entrada de entrenamiento.
- `scripts/export.py`: validación y exportación ONNX.
