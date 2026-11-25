from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

NAVY = colors.HexColor("#1f2a5c")
def S(name, **kw):
    kw.setdefault("fontName", "Helvetica"); kw.setdefault("fontSize", 10); kw.setdefault("leading", 13)
    return ParagraphStyle(name, **kw)
title = S("t", fontName="Helvetica-Bold", fontSize=15, leading=19, alignment=TA_CENTER, textColor=colors.black)
auth = S("a", fontSize=10, alignment=TA_CENTER, leading=13)
aff = S("af", fontSize=7.5, alignment=TA_CENTER, leading=10)
h = S("h", fontName="Helvetica-Bold", fontSize=12, alignment=TA_CENTER, spaceBefore=14, spaceAfter=8)
body = S("b", alignment=TA_JUSTIFY, fontName="Helvetica-Oblique")
kw = S("k", alignment=TA_JUSTIFY)
cap = S("c", fontSize=9.5, alignment=TA_CENTER)
ref = S("r", fontName="Helvetica-Oblique", fontSize=10, leading=14, leftIndent=22, firstLineIndent=-22, spaceAfter=6)

def diagram():
    d = Drawing(480, 150)
    boxes = ["Video MP4", "YOLO11\n(personas)", "ByteTrack\n(tracking)", "Homografía\n(píxel→metros)", "Zonas /\nGóndolas", "Métricas +\nDigital Twin 3D"]
    w, gap, y = 68, 14, 70
    for i, t in enumerate(boxes):
        x = 2 + i * (w + gap)
        d.add(Rect(x, y, w, 46, rx=6, ry=6, fillColor=colors.HexColor("#e8edf7"), strokeColor=NAVY, strokeWidth=1))
        for j, line in enumerate(t.split("\n")):
            n = len(t.split("\n"))
            d.add(String(x + w/2, y + 23 + (n-1)*6 - j*12 - 3, line, fontSize=7.5, textAnchor="middle", fontName="Helvetica-Bold", fillColor=NAVY))
        if i < len(boxes) - 1:
            ax = x + w
            d.add(Line(ax, y+23, ax+gap-2, y+23, strokeColor=NAVY))
            d.add(Polygon([ax+gap-2, y+26, ax+gap+1, y+23, ax+gap-2, y+20], fillColor=NAVY, strokeColor=NAVY))
    d.add(Rect(2, 8, 476, 40, rx=6, ry=6, fillColor=colors.HexColor("#f4f6fb"), strokeColor=colors.grey))
    d.add(String(240, 33, "Frontend React + Three.js  |  API FastAPI + SQLite  |  Desenfoque automático de rostros", fontSize=8, textAnchor="middle", fillColor=colors.black))
    d.add(String(240, 18, "Tráfico · Permanencia · Trayectorias · Interacción inferida · Mapas de calor", fontSize=8, textAnchor="middle", fillColor=colors.black))
    return d

resumen = (
"En el comercio minorista, las decisiones sobre la disposición de góndolas y productos suelen tomarse sin evidencia objetiva "
"del comportamiento real de los compradores, mientras que las soluciones comerciales de analítica en tienda son costosas, "
"requieren hardware especializado y plantean riesgos de privacidad. Este proyecto presenta SCAPDER (Spatial Intelligence), "
"un prototipo que une la configuración física de una tienda (planograma) con inteligencia calculada a partir de videos "
"reales. El objetivo es medir de forma automática el tráfico, la permanencia y la interacción por góndola, protegiendo la "
"identidad de las personas. La metodología emplea visión por computadora: detección de personas con YOLO11, seguimiento "
"multiobjeto con ByteTrack y proyección de los puntos de apoyo al piso mediante homografía calibrada con cuatro "
"correspondencias físicas, lo que permite expresar trayectorias en metros. La interacción se infiere por proximidad, baja "
"velocidad y tiempo mínimo de permanencia, y se complementa con mapas de calor por zona. El sistema se implementó con un "
"backend en Python (FastAPI, OpenCV, SQLAlchemy), un frontend en React con un gemelo digital 3D en Three.js y un asistente "
"conversacional que interpreta los resultados. Por diseño, no realiza reconocimiento facial ni estima identidad, emociones, "
"edad o género, y difumina los rostros en todos los artefactos generados. Como resultado, el prototipo funcional recorre el "
"flujo completo (carga del video, calibración, análisis y visualización 3D) y entrega métricas por góndola, trayectorias y "
"mapas de calor; la validación cuantitativa (precisión del conteo y de la interacción) con un modelo propio entrenado "
"queda como trabajo futuro. Se concluye que la solución ofrece a pequeños y medianos comercios una alternativa accesible y "
"respetuosa de la privacidad para optimizar la distribución de espacios y productos con base en datos."
)

def hf(c, doc):
    c.saveState(); c.setFont("Helvetica", 8); c.setFillColor(colors.grey)
    c.drawCentredString(letter[0]/2, 1.2*cm, "Universidad Santo Tomás, Tunja · CEDETS · Semillero SYNTHESIS")
    c.setStrokeColor(NAVY); c.setLineWidth(3); c.line(0, letter[1]-0.6*cm, letter[0], letter[1]-0.6*cm); c.restoreState()

doc = SimpleDocTemplate("docs/ResumenIESIA_SCAPDER.pdf", pagesize=letter, leftMargin=2.5*cm, rightMargin=2.5*cm, topMargin=1.6*cm, bottomMargin=1.8*cm,
                        title="SCAPDER: analítica espacial de tiendas con visión por computadora", author="Semillero SYNTHESIS")
st = [
 Paragraph("SCAPDER: INTELIGENCIA ESPACIAL PARA RETAIL MEDIANTE VISIÓN POR COMPUTADORA Y GEMELO DIGITAL 3D", title),
 Spacer(1, 10),
 Paragraph("<u>[Nombre y Apellidos del Autor 1]<super>1</super>*, [Nombre y Apellidos del Autor 2]<super>1</super>, [Nombre y Apellidos del Docente Tutor/Líder]<super>2</super></u>", auth),
 Paragraph("<super>1</super> Semillero de Investigación: SYNTHESIS, Universidad Santo Tomás, Sede Principal / Facultad [por definir], Tunja, Colombia", aff),
 Paragraph("<super>2</super> Grupo de Investigación: [Nombre del Grupo o Dependencia], Universidad Santo Tomás, Tunja, Colombia", aff),
 Paragraph("* Correo de contacto del ponente principal: [correo_electronico@usantoto.edu.co]", aff),
 Paragraph("Resumen", h),
 Paragraph(resumen, body),
 Spacer(1, 10),
 Paragraph("<b>Palabras clave:</b> visión por computadora, detección de personas, seguimiento multiobjeto, homografía, analítica de retail, gemelo digital.", kw),
 Paragraph("Elemento Gráfico / Arquitectura", h),
 diagram(),
 Paragraph("<b>Figura 1.</b> <i>Pipeline de SCAPDER: del video de la tienda a las métricas por góndola y su visualización en el gemelo digital 3D.</i>", cap),
 PageBreak(),
 Paragraph("<b>Referencias</b>", S("rh", fontSize=12, leading=16, spaceAfter=8)),
 Paragraph("[1] J. Redmon, S. Divvala, R. Girshick and A. Farhadi, \"You Only Look Once: Unified, Real-Time Object Detection,\" in <i>Proc. IEEE Conf. Computer Vision and Pattern Recognition (CVPR)</i>, 2016.", ref),
 Paragraph("[2] G. Jocher and J. Qiu, \"Ultralytics YOLO11,\" Ultralytics, 2024. [Online]. Available: https://github.com/ultralytics/ultralytics", ref),
 Paragraph("[3] Y. Zhang <i>et al.</i>, \"ByteTrack: Multi-Object Tracking by Associating Every Detection Box,\" in <i>Proc. European Conf. Computer Vision (ECCV)</i>, 2022.", ref),
 Paragraph("[4] R. Hartley and A. Zisserman, <i>Multiple View Geometry in Computer Vision</i>, 2nd ed. Cambridge University Press, 2004.", ref),
 Paragraph("[5] S. Ramírez, \"FastAPI,\" 2018. [Online]. Available: https://fastapi.tiangolo.com", ref),
]
doc.build(st, onFirstPage=hf, onLaterPages=hf)
