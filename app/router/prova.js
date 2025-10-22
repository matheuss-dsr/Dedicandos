import fetch from "node-fetch";
import showdown from "showdown";

const disciplineMapping = {
  linguagens: "linguagens",
  humanas: "ciencias-humanas",
  natureza: "ciencias-natureza",
  matematica: "matematica",
};

const lastSearchTimes = {}; // controle de cooldown por usuário

// 🔹 Função auxiliar para gerar anos válidos
function getValidYears() {
  const years = [];
  for (let i = 2023; i >= 2009; i--) years.push(i);
  return years;
}

// 🔹 Função para processar questão
function processQuestion(q, converter) {
  const enunciadoOriginal = q.context || q.text || "";
  const enunciadoHTML = converter.makeHtml(enunciadoOriginal);

  const alternativas = q.alternatives.map((alt) => ({
    letra: alt.letter,
    texto: converter.makeHtml(alt.text),
    correta: alt.isCorrect,
    imageHTML: alt.file
      ? `<img src="${alt.file}" alt="Imagem da Alternativa" style="max-width:100%; margin-top:10px;">`
      : null,
  }));

  const imageHTML =
    q.files?.length > 0
      ? `<img src="${q.files[0]}" alt="Imagem da Questão" style="max-width:100%; margin-top:10px;">`
      : null;

  return {
    title: q.title || "Questão",
    index: q.index,
    disciplina: q.discipline,
    enunciado: enunciadoHTML,
    alternativas,
    alternativaCorreta: q.correctAlternative,
    imageHTML,
    ano: q.year,
  };
}

/* ============================================================
   🔸 MOSTRAR FORMULÁRIO DE GERAÇÃO DE PROVA
============================================================ */
export async function mostrarFormularioGerarProva(req, reply) {
  const years = getValidYears();
  return reply.view("provas/gerar_prova.ejs", {
    user: req.user,
    years,
    year, 
    error: null,
    questoesOriginais: [],
    quantity: null,
    disciplina: null,
  });
}

/* ============================================================
   🔸 LISTAR QUESTÕES DO ENEM (UM ANO)
============================================================ */
export async function listarQuestoesENEM(req, reply) {
  const years = getValidYears();

  if (req.user && req.user.id) {
    const now = Date.now();
    if (lastSearchTimes[req.user.id] && now - lastSearchTimes[req.user.id] < 60000) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        years,         
        year,
        questoesOriginais,
        quantity,
        disciplina,
        error: null,
      });

    }
    lastSearchTimes[req.user.id] = now;
  }

  try {
    let { year, quantity, disciplina } = req.query;
    year = parseInt(year);
    quantity = parseInt(quantity);

    const disciplinasSelect = ["linguagens", "humanas", "natureza", "matematica"];
    if (!year || isNaN(year) || year < 2009 || year > 2023) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        years,
        error: "Ano inválido. Escolha um entre 2009 e 2023.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }

    if (!quantity || isNaN(quantity) || quantity <= 0) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        years,
        error: "Quantidade deve ser um número positivo.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }

    if (disciplina && !disciplinasSelect.includes(disciplina)) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        years,
        year,
        error: "Disciplina inválida.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }

    const baseUrl = `https://api.enem.dev/v1/exams/${year}/questions`;
    const converter = new showdown.Converter();
    const questoesOriginais = [];
    const disciplinaOffsetMap = {
      linguagens: 0,
      "ciencias-humanas": 45,
      "ciencias-natureza": 90,
      matematica: 135,
    };

    let mappedDiscipline = disciplina ? disciplineMapping[disciplina] : null;
    let offset = mappedDiscipline ? disciplinaOffsetMap[mappedDiscipline] : 0;

    const url = `${baseUrl}?limit=${quantity}&offset=${offset}`;
    console.log(`Buscando questões: ${url}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);

    const data = await response.json();
    const questoes = data.questions || [];

    for (const q of questoes) {
      if (mappedDiscipline && q.discipline !== mappedDiscipline) continue;
      questoesOriginais.push(processQuestion(q, converter));
    }

    if (questoesOriginais.length === 0) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        years,
        year,
        questoesOriginais: [],
        quantity,
        disciplina,
        error: `Nenhuma questão encontrada para o ENEM ${year}.`,
      });
    }

    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      years,
      year,
      questoesOriginais,
      quantity,
      disciplina,
      error: null,
    });
  } catch (err) {
    console.error("🚨 Erro ao buscar questões ENEM:", err);
    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      years,
      year,
      questoesOriginais: [],
      error: `Erro ao buscar questões do ENEM: ${err.message}`,
      quantity: null,
      disciplina: null,
    });
  }
}

/* ============================================================
   🔸 SALVAR PROVA
============================================================ */
export async function salvarProva(req, reply, database) {
  try {
    const { titulo, ano, disciplina, questoes_selecionadas } = req.body;
    const id_usuario = req.user?.id_usuario;

    console.log("🟡 salvarProva - body recebido:", req.body);

    if (!titulo || !ano) {
      return reply.code(400).send({ error: "Título e ano são obrigatórios." });
    }

    const anoNumerico = Number(ano);
    if (isNaN(anoNumerico) || anoNumerico < 2009 || anoNumerico > 2023) {
      console.error("🚨 Ano inválido recebido:", ano);
      return reply.code(400).send({
        error: "Ano inválido. Deve ser um número entre 2009 e 2023.",
      });
    }

    let questoesArray = [];
    if (Array.isArray(questoes_selecionadas)) {
      questoesArray = questoes_selecionadas.map(Number).filter((n) => !isNaN(n));
    } else if (
      typeof questoes_selecionadas === "string" &&
      questoes_selecionadas.trim() !== ""
    ) {
      questoesArray = [Number(questoes_selecionadas)].filter((n) => !isNaN(n));
    }

    if (questoesArray.length === 0) {
      return reply.code(400).send({ error: "Nenhuma questão válida selecionada." });
    }

    const id_prova = await database.salvarProva({
      titulo,
      id_usuario,
      ano: anoNumerico,
      disciplina,
      questoes_selecionadas: questoesArray,
    });

    console.log(`✅ Prova salva com sucesso. ID: ${id_prova}`);
    return reply.redirect(`/prova/${id_prova}`);
  } catch (err) {
    console.error("🚨 Erro ao salvar prova:", err);
    return reply.code(500).send({ error: "Erro interno ao salvar a prova." });
  }
}

/* ============================================================
   🔸 EXIBIR PROVA
============================================================ */
export async function exibirProva(req, reply, database) {
  const id_prova = req.params.prova_id;
  const user = req.user;

  if (!id_prova || !database) {
    return reply.code(400).send({ error: "ID da prova ou banco não encontrado." });
  }

  try {
    const provaData = await database.getProvaComQuestoes(id_prova);

    if (!provaData || !provaData.questoes?.length) {
      return reply.view("provas/exibir_prova.ejs", {
        user,
        error: "Prova não encontrada ou sem questões.",
        prova: null,
        questoesDetalhes: [],
      });
    }

    const questoesDetalhes = (
      await Promise.all(
        provaData.questoes.map((qId) =>
          database.buscarQuestaoENEMPorIndex(qId.enem_year, qId.enem_index)
        )
      )
    ).filter(Boolean);

    return reply.view("provas/exibir_prova.ejs", {
      user,
      prova: provaData.metadata,
      questoesDetalhes,
      error: null,
    });
  } catch (err) {
    console.error("🚨 Erro ao exibir prova:", err);
    return reply.code(500).send({ error: "Erro ao carregar prova." });
  }
}
