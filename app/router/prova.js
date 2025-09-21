import fetch from "node-fetch";

// ---------------- IA LOCAL (Ollama) ----------------
async function gerarQuestoesComIA({ quantidade, area}) {
  const promingles = `Gere ${quantidade} questões de múltipla escolha sobre a área de ${area}, no estilo de provas para jovens.
A resposta deve ser em português.
Cada questão deve conter:
- Um enunciado
- 4 alternativas (A, B, C e D), sendo apenas uma correta
- A letra da alternativa correta (A, B, C, D)

O resultado deve estar em JSON no seguinte formato:
[
  {
    "enunciado": "...",
    "alternativas": ["...", "...", "...", "..."],
    "gabarito": "A"
  }
]`;


  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.1", promingles, stream: false }),
    });

    const result = await response.json();
    let generatedText = result?.response?.trim();
    if (!generatedText) return [];

    // Extrai apenas o array JSON do texto
    const jsonMatch = generatedText.match(/\[.*\]/s);
    if (!jsonMatch) {
      console.error("❌ Não foi possível encontrar JSON na resposta da IA.");
      console.log("🔎 Resposta completa:", generatedText);
      return [];
    }

    try {
      const data = JSON.parse(jsonMatch[0]);
      // Garantir que cada questão tenha alternativas e gabarito
      return data.map(q => ({
        enunciado: q.enunciado || "Sem enunciado",
        alternativas: q.alternativas || ["A", "B", "C", "D"],
        gabarito: q.gabarito || "A"
      }));
    } catch (err) {
      console.error("❌ Erro ao converter JSON extraído:", err);
      console.log("🔎 JSON extraído:", jsonMatch[0]);
      return [];
    }
  } catch (error) {
    console.error("❌ Erro na chamada IA:", error);
    return [];
  }
}

// ---------------- ROTAS ----------------
export async function gerarQuestoesIA(req, reply, database) {
  try {
    const { year, quantity, discipline } = req.body;

    if (!year || !discipline || !quantity) {
      return reply.view("provas/gerar_prova", {
        user: req.user,
        error: "Ano, disciplina e quantidade são obrigatórios.",
        questoesOriginais: [],
        questoesIA: [],
      });
    }

    // Chama a API do ENEM
    const response = await fetch(`https://api.enem.dev/v1/exams/${year}/questions`);
    const examData = await response.json();

    // Filtra questões conforme disciplina e idioma
    let questoesOriginais = (examData.questions || []).filter(q => {
      return q.discipline === discipline && q.language === "ingles";
    });


    // Limita a quantidade
    questoesOriginais = questoesOriginais.slice(0, quantity);

    // Se não houver alternativas, preenche com placeholders
    questoesOriginais = questoesOriginais.map((q, idx) => ({
      title: q.title || `Questão ${idx + 1}`,
      alternatives: q.alternatives ? q.alternatives.map(a => a.text) : ["A", "B", "C", "D"],
      correctAlternative: q.correctAlternative || "Não informado",
      discipline: q.discipline || "Não informado",
      language: q.language || "Não informado"
    }));

    // Gera questões adicionais com IA (Ollama)
    const questoesIA = await gerarQuestoesComIA({
      quantidade: quantity,
      area: discipline,
      language: "ingles" 
    });


    return reply.view("provas/gerar_prova", {
      user: req.user,
      error: null,
      questoesOriginais,
      questoesIA,
      examData
    });
  } catch (err) {
    console.error("❌ Erro ao gerar questões:", err);
    return reply.view("provas/gerar_prova", {
      user: req.user,
      error: "Erro ao gerar questões.",
      questoesOriginais: [],
      questoesIA: [],
      examData: null
    });
  }
}
