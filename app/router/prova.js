import fetch from "node-fetch";
import showdown from "showdown";

const disciplineMapping = {
  linguagens: 'linguagens',
  humanas: 'ciencias-humanas',
  natureza: 'ciencias-natureza',
  matematica: 'matematica',
};

// Objeto global para rastrear o último tempo de busca por ID de usuário
const lastSearchTimes = {};  // { userId: timestamp }

// Função para processar questões (mantida igual)
function processarQuestao(q, converter) {
  const enunciadoOriginal = q.context || q.text || "";
  const enunciadoHTML = converter.makeHtml(enunciadoOriginal);
  
  const alternativas = q.alternatives.map((alt) => ({
    letra: alt.letter,
    texto: converter.makeHtml(alt.text),
    correta: alt.isCorrect,
    imageHTML: alt.file ? `<img src="${alt.file}" alt="Imagem da Alternativa" style="max-width:100%; margin-top:10px;">` : null,
  }));

  const imageHTML = q.files?.length ? `<img src="${q.files[0]}" alt="Imagem da Questão" style="max-width:100%; margin-top:10px;">` : null;

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

/**
 * Função para listar questões de um ano específico com cooldown.
 */
export async function listarQuestoesENEM(req, reply) {
  if (req.user && req.user.id) {
    const now = Date.now();
    if (lastSearchTimes[req.user.id] && (now - lastSearchTimes[req.user.id] < 60000)) {  // 60000 ms = 1 minuto
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Aguarde 1 minuto para buscar mais questões.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }
    // Atualiza o timestamp após a verificação (será sobrescrito no final se a busca for bem-sucedida)
    lastSearchTimes[req.user.id] = now;
  }

  try {
    let { year, quantity, disciplina } = req.query;
    year = parseInt(year);
    quantity = parseInt(quantity);

    const disciplinasSelect = ["linguagens", "humanas", "natureza", "matematica"];
    if (!year || isNaN(year) || year < 2009) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Ano inválido. Deve ser um número maior ou igual a 2009.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }
    if (!quantity || isNaN(quantity) || quantity <= 0) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Quantidade deve ser um número positivo.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }
    if (disciplina && !disciplinasSelect.includes(disciplina)) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Disciplina inválida. Opções: linguagens, humanas, natureza, matematica.",
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

    let hasMore = true;

    while (questoesOriginais.length < quantity && hasMore) {
      const url = `${baseUrl}?limit=${quantity}&offset=${offset}`;
      console.log(`Buscando questões: ${url}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      hasMore = data.metadata?.hasMore || false;
      const questoes = data.questions || [];

      for (const q of questoes) {
        if (mappedDiscipline && q.discipline !== mappedDiscipline) {
          console.log(`Ignorando questão ${q.index}: disciplina não corresponde (${q.discipline})`);
          continue;
        }

        const questaoProcessada = processarQuestao(q, converter);
        questoesOriginais.push(questaoProcessada);

        if (questoesOriginais.length >= quantity) break;
      }

      offset += questoes.length;
    }

    if (req.user && req.user.id) {
      lastSearchTimes[req.user.id] = Date.now();
    }

    if (questoesOriginais.length < quantity) {
      const errorMsg = `Apenas ${questoesOriginais.length} questões encontradas para os filtros.`;
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        questoesOriginais,
        quantity,
        disciplina,
        error: errorMsg,
      });
    }

    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      questoesOriginais,
      quantity,
      disciplina,
      error: null,
    });
  } catch (err) {
    console.error("🚨 Erro ao buscar questões ENEM:", err);
    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      questoesOriginais: [],
      error: `Erro ao buscar questões do ENEM: ${err.message}`,
      quantity: null,
      disciplina: null,
    });
  }
}

/**
 * Função para buscar 10 questões de anos diferentes com cooldown.
 */
export async function listarQuestoesDisciplinaVariosAnos(req, reply) {
  if (req.user && req.user.id) {
    const now = Date.now();
    if (lastSearchTimes[req.user.id] && (now - lastSearchTimes[req.user.id] < 60000)) {  // 60000 ms = 1 minuto
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Aguarde 1 minuto para buscar mais questões.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }
    // Atualiza o timestamp após a verificação
    lastSearchTimes[req.user.id] = now;
  }

  try {
    let { disciplina } = req.query;
    const disciplinasSelect = ["linguagens", "humanas", "natureza", "matematica"];
    if (!disciplina || !disciplinasSelect.includes(disciplina)) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Disciplina inválida ou não fornecida. Opções: linguagens, humanas, natureza, matematica.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }

    const mappedDiscipline = disciplineMapping[disciplina];
    const disciplinaOffsetMap = {
      linguagens: 0,
      "ciencias-humanas": 45,
      "ciencias-natureza": 90,
      matematica: 135,
    };
    const years = [2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009];
    const converter = new showdown.Converter();
    const questoesOriginais = [];
    const totalQuestioesDesejadas = 10;

    for (const year of years) {
      if (questoesOriginais.length >= totalQuestioesDesejadas) break;
      const baseUrl = `https://api.enem.dev/v1/exams/${year}/questions?limit=10&offset=${disciplinaOffsetMap[mappedDiscipline] || 0}`;
      console.log(`Buscando questões para o ano ${year}: ${baseUrl}`);
      const response = await fetch(baseUrl);
      
      if (!response.ok) {
        console.error(`Erro ao buscar questões do ano ${year}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const questoes = data.questions || [];

      for (const q of questoes) {
        if (q.discipline === mappedDiscipline && questoesOriginais.length < totalQuestioesDesejadas) {
          const questaoProcessada = processarQuestao(q, converter);
          questaoProcessada.ano = year;
          questoesOriginais.push(questaoProcessada);
          if (questoesOriginais.length >= totalQuestioesDesejadas) break;
        }
      }
    }

    if (req.user && req.user.id) {
      lastSearchTimes[req.user.id] = Date.now(); 
    }

    if (questoesOriginais.length < totalQuestioesDesejadas) {
      const errorMsg = `Apenas ${questoesOriginais.length} questões encontradas de anos diferentes para a disciplina ${disciplina}.`;
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        questoesOriginais,
        quantity: totalQuestioesDesejadas,
        disciplina,
        error: errorMsg,
      });
    }

    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      questoesOriginais,
      quantity: totalQuestioesDesejadas,
      disciplina,
      error: null,
    });
  } catch (err) {
    console.error("🚨 Erro ao buscar questões de anos diferentes:", err);
    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      questoesOriginais: [],
      error: `Erro ao buscar questões: ${err.message}`,
      quantity: null,
      disciplina: null,
    });
  }
}

export async function mostrarFormularioGerarProva(req, reply) {
  return reply.view("provas/gerar_prova.ejs", {
    user: req.user,
    error: null,
    questoesOriginais: [],
    quantity: null,
    disciplina: null,
  });
}
