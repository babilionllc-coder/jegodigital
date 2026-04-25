"""
LISTA Checklist — Lead Magnet PDF
Branded JegoDigital dark theme (#0f1115 + #C5A059 gold)
Delivered via Brevo transactional after Sofia detects "LISTA" in DM
"""
from weasyprint import HTML, CSS
from pathlib import Path

OUT = Path(__file__).parent / "lista-checklist-jegodigital.pdf"

HTML_STR = r"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Check-list para Inmobiliarias — JegoDigital</title>
<style>
@page { size: Letter; margin: 0; }
html, body { margin: 0; padding: 0; background: #0a0a1a; color: #e8e8f0; font-family: "Helvetica", "Arial", sans-serif; }

.page {
  width: 8.5in;
  min-height: 11in;
  padding: 0.6in 0.7in;
  background: radial-gradient(ellipse at top, #1a1a2e 0%, #0a0a1a 70%);
  position: relative;
  page-break-after: always;
  box-sizing: border-box;
}
.page:last-child { page-break-after: auto; }

.logo {
  font-family: "Georgia", serif;
  font-size: 28pt;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin-bottom: 6pt;
}
.logo .g { color: #bf9b51; }
.logo .d { color: #ffffff; }

.tag {
  font-size: 9pt;
  color: #8a8aa0;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 40pt;
}

h1 {
  font-family: "Georgia", serif;
  font-size: 36pt;
  line-height: 1.1;
  color: #ffffff;
  margin: 0 0 14pt 0;
  font-weight: 700;
}
h1 .gold { color: #bf9b51; }

.lead {
  font-size: 12pt;
  line-height: 1.55;
  color: #c0c0d0;
  margin-bottom: 32pt;
  max-width: 6.5in;
}

.divider {
  height: 1px;
  background: linear-gradient(to right, transparent, #bf9b51, transparent);
  margin: 24pt 0;
}

.item {
  background: rgba(191, 155, 81, 0.05);
  border-left: 3px solid #bf9b51;
  padding: 18pt 20pt;
  margin-bottom: 20pt;
  border-radius: 4px;
  page-break-inside: avoid;
}
.item .num {
  display: inline-block;
  font-family: "Georgia", serif;
  font-size: 14pt;
  color: #bf9b51;
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 6pt;
}
.item h2 {
  font-size: 16pt;
  color: #ffffff;
  margin: 0 0 10pt 0;
  font-weight: 600;
}
.item p {
  font-size: 10.5pt;
  line-height: 1.6;
  color: #c8c8d8;
  margin: 0 0 10pt 0;
}
.item .action {
  display: block;
  background: rgba(191, 155, 81, 0.12);
  border: 1px solid rgba(191, 155, 81, 0.35);
  padding: 10pt 14pt;
  border-radius: 4px;
  font-size: 10pt;
  color: #f0e4c4;
  margin-top: 10pt;
}
.item .action strong { color: #bf9b51; }

.warning {
  background: rgba(180, 50, 50, 0.08);
  border-left: 3px solid #b43232;
  padding: 10pt 14pt;
  margin-top: 10pt;
  font-size: 10pt;
  color: #e0b0b0;
  border-radius: 2px;
}

.stat-row {
  display: flex;
  gap: 16pt;
  margin: 20pt 0;
}
.stat {
  flex: 1;
  text-align: center;
  padding: 18pt 12pt;
  background: rgba(191, 155, 81, 0.06);
  border: 1px solid rgba(191, 155, 81, 0.2);
  border-radius: 6px;
}
.stat .v {
  display: block;
  font-family: "Georgia", serif;
  font-size: 26pt;
  color: #bf9b51;
  font-weight: 700;
  line-height: 1;
}
.stat .l {
  display: block;
  font-size: 8.5pt;
  color: #a0a0b8;
  margin-top: 6pt;
  letter-spacing: 0.5px;
}

.cta {
  background: linear-gradient(135deg, rgba(191, 155, 81, 0.15), rgba(191, 155, 81, 0.05));
  border: 1px solid #bf9b51;
  border-radius: 8px;
  padding: 28pt;
  text-align: center;
  margin-top: 32pt;
}
.cta h3 {
  font-family: "Georgia", serif;
  font-size: 20pt;
  color: #ffffff;
  margin: 0 0 10pt 0;
}
.cta p {
  font-size: 11pt;
  color: #c8c8d8;
  line-height: 1.55;
  margin: 0 0 16pt 0;
}
.cta .btn {
  display: inline-block;
  background: #bf9b51;
  color: #0a0a1a;
  padding: 10pt 28pt;
  font-size: 11pt;
  font-weight: 700;
  text-decoration: none;
  border-radius: 4px;
  letter-spacing: 0.5px;
}
.cta .alt {
  display: block;
  font-size: 9.5pt;
  color: #8a8aa0;
  margin-top: 14pt;
}

footer {
  position: absolute;
  bottom: 0.4in;
  left: 0.7in;
  right: 0.7in;
  font-size: 8pt;
  color: #6a6a80;
  border-top: 1px solid rgba(191, 155, 81, 0.15);
  padding-top: 10pt;
  display: flex;
  justify-content: space-between;
}
</style>
</head>
<body>

<!-- ===== PAGE 1 — COVER + INTRO ===== -->
<div class="page">
  <div class="logo"><span class="g">Jego</span><span class="d">Digital</span></div>
  <div class="tag">CHECK-LIST GRATIS · 5 PUNTOS · INMOBILIARIAS 2026</div>

  <h1>5 cosas que revisar HOY<br>antes de pagar otro<br><span class="gold">mes de Meta Ads.</span></h1>

  <p class="lead">
    El 73% de las inmobiliarias en México están pagando Meta Ads mientras su sitio web y su Google Maps
    están invisibles. El resultado: gastan $15,000–$50,000 MXN al mes y reciben leads fríos que no convierten.
  </p>

  <p class="lead" style="color:#e0d0a0;">
    Esta lista te muestra los 5 puntos que debes revisar ANTES de gastar un peso más en publicidad.
    Todos son gratis. Toma 15 minutos. Cualquiera puede hacerlo.
  </p>

  <div class="stat-row">
    <div class="stat"><span class="v">+320%</span><span class="l">Tráfico orgánico · Flamingo Real Estate</span></div>
    <div class="stat"><span class="v">#1</span><span class="l">Google Maps · 90 días sin ads</span></div>
    <div class="stat"><span class="v">4.4×</span><span class="l">Visibilidad de búsqueda</span></div>
  </div>

  <div class="divider"></div>

  <p style="font-size:10pt; color:#a0a0b8; line-height:1.55;">
    Esta lista es la misma que usamos cuando entramos a una inmobiliaria nueva como cliente. Antes de cobrar
    un peso, auditamos estos 5 puntos. En 4 de cada 5 casos, arreglar estos 5 puntos sube los leads
    entre un 30% y un 200% — sin tocar la publicidad pagada.
  </p>

  <footer>
    <span>jegodigital.com · @alexjegodigital</span>
    <span>Alex Jego · Fundador</span>
  </footer>
</div>

<!-- ===== PAGE 2 — PUNTOS 1-3 ===== -->
<div class="page">
  <div class="logo"><span class="g">Jego</span><span class="d">Digital</span></div>
  <div class="tag">CHECK-LIST · PUNTOS 1–3</div>

  <h1 style="font-size:24pt;">Los primeros 3 puntos<br>que tu competencia<br><span class="gold">ya optimizó.</span></h1>

  <div class="item">
    <div class="num">01 / GOOGLE MAPS</div>
    <h2>Reseñas: mínimo 4.5★ y 20 reseñas</h2>
    <p>Si tu ficha de Google Maps tiene menos de 4.5 estrellas o menos de 20 reseñas, Google te
    esconde automáticamente de los resultados locales. No importa cuánto pagues en Ads — la ficha
    orgánica es lo primero que la gente mira.</p>
    <div class="action">
      <strong>ACCIÓN:</strong> Pide una reseña a cada cliente cerrado de los últimos 6 meses. Meta mínima:
      4 reseñas nuevas por semana durante 5 semanas. Responde a TODAS las reseñas (buenas y malas) en &lt;48h.
    </div>
  </div>

  <div class="item">
    <div class="num">02 / GOOGLE MAPS</div>
    <h2>Categorías: usa las 10 permitidas</h2>
    <p>La mayoría de inmobiliarias solo pone la categoría "Agencia Inmobiliaria". Google permite hasta
    10 categorías — y cada una es un canal de leads independiente. Los ganadores ponen: Inmobiliaria,
    Agente de Bienes Raíces, Servicio de Alquiler, Agencia de Rentas Vacacionales, Servicio de
    Valuación, Constructora, Desarrollador Inmobiliario, Asesoría de Inversión, y 2 más específicas
    de tu zona.</p>
    <div class="action">
      <strong>ACCIÓN:</strong> Entra a tu Google Business Profile → Editar perfil → Categorías → Agregar
      al menos 7 categorías relevantes. Tardas 3 minutos. Resultado: 2–3× más impresiones en 30 días.
    </div>
  </div>

  <div class="item">
    <div class="num">03 / GOOGLE MAPS</div>
    <h2>Publicaciones: 1 post semanal mínimo</h2>
    <p>Si no subes al menos 1 publicación semanal en tu ficha de Google Maps, Google asume que el
    negocio está inactivo. En 90 días te empieza a bajar en los resultados locales. Una publicación =
    una foto de propiedad + 2 líneas de texto + link a tu sitio. 5 minutos a la semana.</p>
    <div class="action">
      <strong>ACCIÓN:</strong> Programa 4 publicaciones de aquí a un mes usando "Google Business Profile
      Manager". Contenido fácil: nueva propiedad de la semana, testimonio de cliente, consejo del mercado,
      evento de puerta abierta.
    </div>
    <div class="warning">
      ⚠️ Si tienes más de 90 días sin publicar, Google ya te bajó. El único camino de regreso es
      publicar todos los días durante 14 días seguidos para "reactivar" la señal.
    </div>
  </div>

  <footer>
    <span>jegodigital.com · @alexjegodigital</span>
    <span>Check-list · Página 2/3</span>
  </footer>
</div>

<!-- ===== PAGE 3 — PUNTOS 4-5 + CTA ===== -->
<div class="page">
  <div class="logo"><span class="g">Jego</span><span class="d">Digital</span></div>
  <div class="tag">CHECK-LIST · PUNTOS 4–5 + SIGUIENTE PASO</div>

  <h1 style="font-size:24pt;">Los 2 puntos<br>que la mayoría<br><span class="gold">ni sabe que existen.</span></h1>

  <div class="item">
    <div class="num">04 / WHATSAPP</div>
    <h2>Velocidad de respuesta: menos de 5 minutos</h2>
    <p>Un lead contactado en menos de 5 minutos tiene 21× más probabilidad de cerrar que un lead
    contactado en 30 minutos. Si tu inmobiliaria tarda más de 5 minutos en responder un mensaje
    de WhatsApp, estás perdiendo entre el 60% y el 80% de tus leads — ANTES de que tu competencia
    los contacte.</p>
    <div class="action">
      <strong>ACCIÓN:</strong> Mide tu tiempo promedio de respuesta esta semana (cuenta los últimos
      10 leads). Si es &gt;5 min, activa el primer mensaje automático con el nombre del lead y una
      pregunta de calificación. Flamingo pasó de 6h a &lt;30 segundos con IA: automatizaron 88% de
      las respuestas.
    </div>
  </div>

  <div class="item">
    <div class="num">05 / IA (ChatGPT, Gemini, Perplexity)</div>
    <h2>AEO: apareces cuando te preguntan</h2>
    <p>En 2026, el 34% de las búsquedas inmobiliarias en México ya pasan por ChatGPT, Gemini y
    Perplexity. Para final de año va a ser el 50%. Estos buscadores NO usan Google Ads — usan
    contenido estructurado de tu sitio. Si tu sitio no tiene schema.org, Q&amp;A, y autoridad
    de dominio, eres invisible para la próxima generación de búsqueda.</p>
    <div class="action">
      <strong>ACCIÓN:</strong> Abre ChatGPT y escribe "cuál es la mejor inmobiliaria en [tu ciudad]".
      Si no apareces en la respuesta, necesitas AEO (Answer Engine Optimization). Es el servicio
      más importante para 2026, y nadie lo está haciendo todavía.
    </div>
  </div>

  <div class="cta">
    <h3>¿Quieres que auditemos tu agencia gratis?</h3>
    <p>Los 5 puntos de arriba los puedes hacer tú mismo en un fin de semana.<br>
    Si quieres el reporte completo (32 puntos, incluyendo AEO, SEO técnico, velocidad de sitio,<br>
    schema.org y automatización de WhatsApp), te lo hacemos gratis.</p>
    <a class="btn" href="https://calendly.com/jegoalexdigital/30min">AGENDA LLAMADA DE 15 MIN →</a>
    <span class="alt">O mándame un DM en Instagram: @alexjegodigital con la palabra "AUDIT"<br>
    o WhatsApp directo: +52 998 202 3263</span>
  </div>

  <footer>
    <span>jegodigital.com · @alexjegodigital · @jegodigital</span>
    <span>JegoDigital · Agencia #1 para Inmobiliarias México</span>
  </footer>
</div>

</body>
</html>"""

def main():
    HTML(string=HTML_STR).write_pdf(str(OUT))
    print(f"✅ Wrote: {OUT}")
    print(f"   Size: {OUT.stat().st_size / 1024:.1f} KB")

if __name__ == "__main__":
    main()
