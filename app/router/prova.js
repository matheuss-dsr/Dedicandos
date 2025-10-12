import fetch from "node-fetch";
// ✅ Novo import para o tradutor
import translate from '@iamtraction/google-translate'; 
import showdown from 'showdown';

export async function listarQuestoesENEM(req, reply) {
  try {
    let { year, quantity, disciplina } = req.query;
    quantity = parseInt(quantity);

    if (!year || !quantity) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        error: "Ano e quantidade são obrigatórios.",
        questoesOriginais: [],
        quantity: null,
        disciplina: null,
      });
    }

    const questoesOriginais = [];
    const urlBase = `https://api.enem.dev/v1/exams/${year}/questions`;

    const disciplinaOffsetMap = {
      linguagens: 0,
      humanas: 45,
      natureza: 90,
      matematica: 135,
    };

    let offset = disciplina ? disciplinaOffsetMap[disciplina] || 0 : 0;
    const maxTentativas = 10;
    let tentativas = 0;

    const urlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif))/i;
    const converter = new showdown.Converter();

    while (questoesOriginais.length < quantity && tentativas < maxTentativas) {
      const url = `${urlBase}?limit=${quantity}&offset=${offset}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);

      const data = await response.json();
      if (!data.questions || data.questions.length === 0) break;

      for (const q of data.questions) {
        if (!q || (!q.text && !q.context) || !q.correctAlternative || !q.alternatives || q.alternatives.length === 0) {
          continue;
        }

        if (disciplina && q.discipline !== disciplina) continue;

        let enunciado = (q.text || q.context || "").replace(urlRegex, "").trim();
        const validAlternatives = q.alternatives.filter(a => a && a.text && a.letter);

        if (!enunciado || validAlternatives.length === 0) continue;

        // Tradução se necessário
        if (q.language && !["pt", "pt-BR"].includes(q.language)) {
          try {
            const textsToTranslate = [enunciado, ...validAlternatives.map(a => a.text)];

            // --- INÍCIO DA TRADUÇÃO ---
            const translatedResults = await Promise.all(
              textsToTranslate.map(text =>
                translate(text, { from: q.language, to: "pt" }).then(res => res.text)
              )
            );

            enunciado = translatedResults[0];
            const translatedAlternativeTexts = translatedResults.slice(1);
            for (let i = 0; i < validAlternatives.length; i++) {
              validAlternatives[i].text = translatedAlternativeTexts[i];
            }
            // --- FIM DA TRADUÇÃO ---
          } catch (err) {
            console.warn("⚠️ Erro ao traduzir:", err);
            continue;
          }
        }

        // Converte Markdown para HTML
        enunciado = converter.makeHtml(enunciado);

        const alternativas = validAlternatives.map(a => ({ letra: a.letter, texto: a.text }));

        let imageHTML = null;
        if (q.files && q.files.length > 0) {
          imageHTML = `<img src="${q.files[0]}" alt="Imagem da Questão" style="max-width:100%; margin-top:10px;">`;
        } else {
          const match = (q.text?.match(urlRegex) || q.context?.match(urlRegex));
          if (match) imageHTML = `<img src="${match[0]}" alt="Imagem da Questão" style="max-width:100%; margin-top:10px;">`;
        }

        questoesOriginais.push({
          title: q.title || "Questão",
          enunciado,
          alternativas,
          alternativaCorreta: q.correctAlternative,
          imageHTML,
          ano: year,
          disciplina: q.discipline,
          idioma: q.language,
          number: q.number, // Mantém o número da questão
        });

        if (questoesOriginais.length >= quantity) break;
      }

      offset += data.questions.length;
      tentativas++;
    }

    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      error: questoesOriginais.length === 0 ? "Nenhuma questão válida encontrada para esses filtros." : null,
      questoesOriginais,
      quantity,
      disciplina,
    });
  } catch (err) {
    console.error("🚨 Erro ao buscar questões ENEM:", err);
    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      error: "Erro ao buscar questões do ENEM. Tente novamente.",
      questoesOriginais: [],
      quantity: null,
      disciplina: null,
    });
  }
}
export async function salvarProva(req, reply, db) { // <-- Recebe a instância do DB
    const id_usuario = req.user.id_usuario; 
    const { titulo, ano, disciplina, questoes_selecionadas } = req.body;
    
    // Você deve garantir que 'db' (instância de DatabasePostgres) está disponível aqui.
    if (!db) {
        console.error("🚨 Erro: Instância do banco de dados não fornecida.");
        return reply.code(500).send({ error: "Erro interno: Serviço de banco de dados indisponível." });
    }

    try {
        const id_prova = await db.salvarProva({ 
            titulo, 
            id_usuario, 
            ano, 
            disciplina, 
            questoes_selecionadas 
        });
        
        return reply.redirect(`/prova/${id_prova}`); 

    } catch (err) {
        // Trata a exceção lançada pelo método do banco de dados (que já lidou com ROLLBACK)
        console.error("🚨 Erro ao salvar prova:", err);
        const errorMessage = err.message.includes("obrigatórios") 
            ? err.message 
            : "Erro interno ao salvar a prova. Tente novamente.";
            
        return reply.code(400).send({ error: errorMessage });
    }
}
export async function exibirProva(req, reply, db) {
  const id_prova = req.params.prova_id;
  const user = req.user;

  if (!id_prova || !db) {
    return reply.code(400).send({ error: "ID da prova ou serviço de banco de dados não encontrado." });
  }

  try {
    const provaData = await db.getProvaComQuestoes(id_prova);

    if (!provaData || !provaData.questoes || provaData.questoes.length === 0) {
      return reply.view("provas/visualizar_prova.ejs", {
        user,
        error: "Prova não encontrada ou sem questões salvas.",
        prova: null,
        questoesDetalhes: []
      });
    }

    // Busca os detalhes das questões em paralelo
    const promessasQuestoes = provaData.questoes.map(qId =>
      db.buscarQuestaoENEMPorIndex(qId.enem_year, qId.enem_index)
    );

    const questoesDetalhes = (await Promise.all(promessasQuestoes)).filter(q => q !== null);

    return reply.view("provas/visualizar_prova.ejs", {
      user,
      prova: provaData.metadata,
      questoesDetalhes,
      error: null
    });

  } catch (err) {
    console.error("🚨 Erro ao exibir prova:", err);
    return reply.code(500).send({ error: "Erro ao carregar os detalhes da prova." });
  }
}