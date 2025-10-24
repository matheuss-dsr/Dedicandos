import showdown from "showdown";
import fetch from "node-fetch";
import PDFDocument from "pdfkit";
import { parse } from "node-html-parser";

const disciplineMapping = {
  linguagens: "linguagens",
  humanas: "ciencias-humanas",
  natureza: "ciencias-natureza",
  matematica: "matematica",
};

function getValidanos() {
  const anos = [];
  for (let i = 2022; i >= 2009; i--) anos.push(i);
  return anos;
}

// Processar questão
function processQuestion(q, converter) {
  const enunciadoTexto = q.context || q.text || "";
  const enunciadoHTML = converter.makeHtml(enunciadoTexto);

  const alternativas = q.alternatives.map((alt) => ({
    letra: alt.letter,
    texto: converter.makeHtml(alt.text || ""),
    correta: alt.isCorrect,
  }));

  return {
    title: q.title || "Questão",
    enunciado: enunciadoTexto,
    enunciadoHTML: enunciadoHTML,
    alternativas,
    alternativaCorreta: q.correctAlternative,
    disciplina: q.discipline,
  };
}

// Mostrar formulário de geração
export async function mostrarFormularioGerarProva(req, reply) {
  const anos = getValidanos();
  return reply.view("provas/gerar_prova.ejs", {
    user: req.user,
    anos,
    ano: req.query.ano || null,
    quantity: null,
    disciplina: null,
    questoesOriginais: [],
    error: null,
    success: null,
  });
}

// Listar questões do ENEM
export async function listarQuestoesENEM(req, reply) {
  try {
    let { ano, disciplina } = req.query;
    ano = parseInt(ano);
    const anos = getValidanos();
    const converter = new showdown.Converter();
    const NUM_QUESTOES = 10; // Sempre mostrar 10 questões válidas

    if (!ano || isNaN(ano) || ano < 2009 || ano > 2022) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        anos,
        error: "Ano inválido (deve ser entre 2009 e 2022).",
        questoesOriginais: [],
        quantity: NUM_QUESTOES,
        disciplina,
        ano: req.query.ano || null,
        success: null,
      });
    }

    const baseUrl = `https://api.enem.dev/v1/exams/${ano}/questions`;
    const mappedDiscipline = disciplina ? disciplineMapping[disciplina] : null;

    const disciplinaOffsetMap = {
      linguagens: 0,
      "ciencias-humanas": 46,
      "ciencias-natureza": 91,
      matematica: 136,
    };

    let questoes = [];
    let offset = mappedDiscipline ? disciplinaOffsetMap[mappedDiscipline] : 0;
    let limit = NUM_QUESTOES;
    const maxLimit = 180;

    // Buscar até ter pelo menos NUM_QUESTOES válidas
    while (questoes.length < NUM_QUESTOES && limit <= maxLimit) {
      const url = `${baseUrl}?limit=${limit}&offset=${offset}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Erro HTTP ao buscar questões: ${response.status}`);

      const data = await response.json();
      let fetched = data.questions || [];
      if (mappedDiscipline) fetched = fetched.filter((q) => q.discipline === mappedDiscipline);

      // Filtrar questões válidas (enunciado e alternativas não null)
      fetched = fetched.filter(q => (q.context || q.text) && q.alternatives.every(alt => alt.text));

      questoes = questoes.concat(fetched);

      // Aumentar limit para próxima busca se necessário
      limit += NUM_QUESTOES;
      offset += limit; // Ajustar offset para não repetir questões
    }

    // Pegar apenas as primeiras NUM_QUESTOES válidas
    questoes = questoes.slice(0, NUM_QUESTOES);

    const questoesOriginais = questoes.map((q, i) => {
      const questaoProcessada = processQuestion(q, converter);
      questaoProcessada.index = i + 1;
      return questaoProcessada;
    });

    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      anos,
      ano,
      quantity: NUM_QUESTOES,
      disciplina,
      questoesOriginais,
      error: null,
      success: `${questoesOriginais.length} questões carregadas com sucesso!`,
    });

  } catch (err) {
    console.error("Erro geral na listagem de questões:", err.message);
    const anos = getValidanos();
    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      anos,
      error: `Ocorreu um erro: ${err.message}`,
      questoesOriginais: [],
      quantity: 10,
      disciplina: req.query.disciplina || null,
      ano: req.query.ano || null,
      success: null,
    });
  }
}

function limparHTML(html) {
  const root = parse(html);
  return root.text; // retorna apenas o texto
}

// Função auxiliar para baixar imagem e retornar buffer
async function fetchImagemBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Erro ao baixar imagem: " + url);
  return Buffer.from(await response.arrayBuffer());
}

// Função para estimar a altura de uma questão
function estimarAlturaQuestao(doc, q) {
  let altura = 0;

  // Título da questão
  altura += doc.heightOfString(`Questão #${q.index}: ${q.title}`, { width: doc.page.width - 100, fontSize: 14 });

  // Enunciado
  const enunciado = limparHTML(q.enunciadoHTML || q.enunciado);
  altura += doc.heightOfString(enunciado, { width: doc.page.width - 140, fontSize: 12 }); // indent 20*2 = 40, mais margem

  // Imagens: assumir altura fixa de 300 + margens
  const imgRegex = /!\[.*?\]\((.*?)\)/g;
  const numImagens = (q.enunciado.match(imgRegex) || []).length;
  altura += numImagens * (300 + 20); // 300 altura imagem + 20 margem

  // Alternativas - estimar como bloco único
  const alternativasTexto = q.alternativas.map(a => `${a.letra}) ${limparHTML(a.texto)}`).join('\n');
  altura += doc.heightOfString(alternativasTexto, { width: doc.page.width - 180, fontSize: 12 }); // indent 40*2 = 80, mais margem

  // Espaços e linha
  altura += 50; // moveDowns aproximados

  return altura;
}

async function gerarPDFBuffer(questoes, tituloProva) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      // Leve espaçamento no topo
      doc.moveDown(0.5);

      for (let idx = 0; idx < questoes.length; idx++) {
        const q = questoes[idx];

        // Estimar altura da questão
        const alturaQuestao = estimarAlturaQuestao(doc, q);

        // Verificar se cabe na página atual (exceto para a primeira questão, para evitar página em branco)
        const espacoDisponivel = doc.page.height - doc.page.margins.bottom - doc.y;
        if (idx > 0 && alturaQuestao > espacoDisponivel) {
          doc.addPage();
        }

        // Questão
        doc.fontSize(14).fillColor("black").text(`Questão #${idx + 1}: ${q.title}`, { bold: true });
        doc.moveDown(0.5);

        // Enunciado - limpar HTML
        let enunciado = limparHTML(q.enunciadoHTML || q.enunciado);
        doc.fontSize(12).text(enunciado, { indent: 20, align: "justify" });
        doc.moveDown(0.5);

        // Buscar e inserir imagens se houver links de imagem no enunciado
        const imgRegex = /!\[.*?\]\((.*?)\)/g;
        const matches = [...(q.enunciado.matchAll(imgRegex))];
        for (const match of matches) {
          const url = match[1];
          try {
            const imgBuffer = await fetchImagemBuffer(url);
            doc.moveDown(0.5);
            doc.image(imgBuffer, { width: 300, align: "center" });
            doc.moveDown(0.5);
          } catch (e) {
            console.warn("Imagem não carregou:", url, e.message);
          }
        }

        // Alternativas - exibir como bloco único para melhor formatação
        const alternativasTexto = q.alternativas.map(a => `${a.letra}) ${limparHTML(a.texto)}`).join('\n');
        doc.fontSize(12).text(alternativasTexto, { indent: 40 });

        doc.moveDown(1);
        doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
        doc.moveDown(1);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function salvarPDF(req, reply) {
  try {
    const { nomePDF, todasQuestoes, questoesSelecionadas } = req.body;
    if (!nomePDF || !todasQuestoes) {
      return reply.code(400).send({ error: "Nome do PDF ou questões não fornecidos." });
    }

    const todas = JSON.parse(todasQuestoes);
    let selecionadas = [];

    if (questoesSelecionadas) {
      if (Array.isArray(questoesSelecionadas)) {
        selecionadas = questoesSelecionadas.map(i => todas[i]);
      } else {
        selecionadas = [todas[questoesSelecionadas]];
      }
    }

    if (selecionadas.length === 0) {
      return reply.code(400).send({ error: "Nenhuma questão selecionada." });
    }

    const buffer = await gerarPDFBuffer(selecionadas, `Prova - ${nomePDF}`);
    const fileName = nomePDF.toString().trim().replace(/\s+/g, "_") + ".pdf";

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buffer);

  } catch (err) {
    console.error("Erro em salvarPDF:", err);
    return reply.code(500).send({ error: "Erro ao gerar PDF: " + err.message });
  }
}
