import fetch from "node-fetch";

// ---------------- Controller de Provas ----------------
export async function mostrarFormularioGerarProva(req, reply) {
  return reply.view("provas/gerar_prova", {
    user: req.user,
    error: null,
    year: null,
    quantity: null,
    offset: 10,
    questoesOriginais: [],
  });
}

// ---------------- Função: Buscar questões do ENEM ----------------
export async function listarQuestoesENEM(req, reply) {
  try {
    const { year, quantity, offset = 0 } = req.query;

    if (!year || !quantity) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Ano e quantidade são obrigatórios.",
        questoesOriginais: [],
        quantity: null,
        offset: 0,
      });
    }

    const url = `https://api.enem.dev/v1/exams/${year}/questions?limit=${quantity}&offset=${offset}`;
    console.log("Chamando API ENEM com URL:", url);

    const response = await fetch(url);
    const data = await response.json();
    console.log("Resposta da API ENEM recebida:", data);

    if (!data.questions || data.questions.length === 0) {
      console.log("Nenhuma questão encontrada no retorno da API");
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Nenhuma questão encontrada.",
        questoesOriginais: [],
        quantity,
        offset,
      });
    }

    // Normalizar estrutura das questões
    const questoesOriginais = data.questions.map((q, idx) => {
      let imageHTML = null;

      // Regex simples para detectar links de imagem
      const urlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif))/i;
      const match = q.text?.match(urlRegex) || q.context?.match(urlRegex);

      if (match) {
        const imageUrl = match[0];
        imageHTML = `<img src="${imageUrl}" alt="Imagem da Questão ${idx + 1}" style="max-width:100%; margin-top:10px;">`;
      }

      // Remover o link de imagem do enunciado para não aparecer junto
      const enunciado = (q.text || q.context || "Enunciado não disponível").replace(urlRegex, '').trim();

      return {
        title: q.title || `Questão ${idx + 1}`,
        enunciado,
        alternatives: q.alternatives
          ? q.alternatives.map(a => `${a.letter}) ${a.text}`)
          : ["A", "B", "C", "D"],
        correctAlternative: q.correctAlternative || "Não informado",
        language: q.language || "Não informado",
        year: q.year || year,
        imageHTML
      };
    });


    console.log(questoesOriginais);

    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      error: null,
      questoesOriginais,
      quantity,
      offset,
    });

  } catch (err) {
    console.error("Erro ao buscar questões ENEM:", err);
    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      error: "Erro ao buscar questões.",
      questoesOriginais: [],
      quantity: null,
      offset: 10,
    });
  }
}