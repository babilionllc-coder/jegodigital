const { GoogleGenerativeAI } = require("@google/generative-ai");
const functions = require('firebase-functions');

/*
 * Generates a "Brutal Honest" Executive Verdict using Gemini 1.5 Flash.
 * Focuses on business pain points: Lost Revenue, Invisible SEO, Competitor Dominance.
 */
async function getExecutiveVerdict(url, auditData, pageContent) {
  try {
    // Prioritize gemini.key for AI, fallback to others
    // Prioritize gemini.key for AI, fallback to others
    // const apiKey = functions.config().gemini?.key || functions.config().psi?.key || process.env.GEMINI_API_KEY;
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) return { verdict: "Error: Sin API Key Configurada.", fixes: null };

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
            Actúa como un Consultor SEO Senior y Estratega de Negocios.
            Analiza este sitio web: ${url}
            
            CONTEXTO DEL NEGOCIO:
            - Título Actual: "${pageContent.title}"
            - Descripción Actual: "${pageContent.description}"
            - H1 Actual: "${pageContent.h1}"
            - Contenido (extracto): "${pageContent.text.substring(0, 500)}..."
            
            DATOS TÉCNICOS:
            - Competidores: ${auditData.market_data.competitors.join(', ') || "No detectados"}
            - Velocidad: ${auditData.psi.performance}/100
            - WAR ROOM (Inteligencia Competitiva): ${JSON.stringify(auditData.war_room)}
            
            TU TAREA (Devuelve JSON puro):
            1. "verdict": Un veredicto ejecutivo brutal de 3 oraciones sobre por qué están perdiendo dinero.
            2. "fixes": Genera 3 variantes OPTIMIZADAS para title_tags, meta_descriptions, h1_headlines.
            3. "attack_plan": Estrategia para destruir a la competencia:
               - "topics": 3 Títulos de Artículos/Landing Pages para robar tráfico a estos competidores (basado en sus keywords).
               - "weakness": Una frase sobre la debilidad detectada en ellos.

            FORMATO JSON REQUERIDO:
            {
              "verdict": "Texto...",
              "fixes": {
                "title_tags": [],
                "meta_descriptions": [],
                "h1_headlines": []
              },
              "attack_plan": {
                "topics": ["Tema 1", "Tema 2", "Tema 3"],
                "weakness": "Debilidad..."
              }
            }
        `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text());

  } catch (error) {
    console.error("Gemini Verdict Error:", error);
    return {
      verdict: "El análisis profundo de IA no pudo completarse.",
      fixes: null
    };
  }
}

module.exports = { getExecutiveVerdict };
