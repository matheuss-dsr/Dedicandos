import showdown from "showdown";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { parse } from "node-html-parser";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";

const disciplineMapping = {
  linguagens: "linguagens",
  humanas: "ciencias-humanas",
  natureza: "ciencias-natureza",
  matematica: "matematica",
};

function getValidanos() {
  const anos = [];
  for (let i = 2023; i >= 2009; i--) anos.push(i);
  return anos;
}

function limparHTML(html) {
  const root = parse(html);
  return root.text;
}

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
    enunciadoHTML,
    alternativesIntroduction: q.alternativesIntroduction || "",
    alternativas,
    alternativaCorreta: q.correctAlternative,
    disciplina: q.discipline,
  };
}

async function fetchImagemBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Erro ao baixar imagem: " + url);
  return Buffer.from(await response.arrayBuffer());
}

function estimarAlturaQuestao(doc, q) {
  let altura = 0;
  altura += doc.heightOfString(`Questão #${q.index}: ${q.title}`, { width: doc.page.width - 100, fontSize: 14 });
  const enunciado = limparHTML(q.enunciadoHTML || q.enunciado);
  altura += doc.heightOfString(enunciado, { width: doc.page.width - 140, fontSize: 12 });
  const imgRegex = /!\[.*?\]\((.*?)\)/g;
  const numImagens = (q.enunciado.match(imgRegex) || []).length;
  altura += numImagens * (300 + 20);
  const alternativasTexto = q.alternativas.map(a => `${a.letra}) ${limparHTML(a.texto)}`).join('\n');
  altura += doc.heightOfString(alternativasTexto, { width: doc.page.width - 180, fontSize: 12 });
  altura += 50;
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

      doc.fontSize(20).text(tituloProva, { align: "center" });
      doc.moveDown();

      for (let idx = 0; idx < questoes.length; idx++) {
        const q = questoes[idx];
        const alturaQuestao = estimarAlturaQuestao(doc, q);
        const espacoDisponivel = doc.page.height - doc.page.margins.bottom - doc.y;
        if (idx > 0 && alturaQuestao > espacoDisponivel) doc.addPage();

        doc.fontSize(14).text(`Questão #${idx + 1}: ${q.title}`, { bold: true });
        doc.moveDown(0.5);

        const enunciado = limparHTML(q.enunciadoHTML || q.enunciado);
        doc.fontSize(12).text(enunciado, { indent: 20, align: "justify" });
        doc.moveDown(0.5);

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

async function gerarDOCXBuffer(questoes, tituloProva, infoAluno) {
  const { nome, sala, escola, nota } = infoAluno;
  const dataAtual = new Date().toLocaleDateString("pt-BR", { year: "numeric", month: "2-digit", day: "2-digit" });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: tituloProva, heading: HeadingLevel.TITLE, spacing: { after: 200 } }),
          new Paragraph({ text: `Nome: ${nome || "_____________________"}` }),
          new Paragraph({ text: `Sala: ${sala || "________"}     Data: ${dataAtual}` }),
          new Paragraph({ text: `Escola: ${escola || "__________________________"}     Nota: ${nota || "_____"}`, spacing: { after: 300 } }),

          ...questoes.flatMap((q, idx) => {
            const enunciadoLimpo = limparHTML(q.enunciadoHTML || q.enunciado);
            const alternativasTexto = q.alternativas.map(a => `${a.letra}) ${limparHTML(a.texto)}`).join("\n");

            return [
              new Paragraph({ text: `Questão #${idx + 1}: ${q.title}`, heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }),
              new Paragraph({ text: enunciadoLimpo, spacing: { after: 150 } }),
              new Paragraph({ text: alternativasTexto, spacing: { after: 200 } }),
            ];
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

export async function salvarPDF(req, reply) {
  try {
    const { nomePDF, todasQuestoes, questoesSelecionadas } = req.body;
    if (!nomePDF || !todasQuestoes)
      return reply.code(400).send({ error: "Nome do PDF ou questões não fornecidos." });

    const todas = JSON.parse(todasQuestoes);
    const selecionadas = Array.isArray(questoesSelecionadas)
      ? questoesSelecionadas.map(i => todas[i])
      : [todas[questoesSelecionadas]];

    if (selecionadas.length === 0)
      return reply.code(400).send({ error: "Nenhuma questão selecionada." });

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

export async function salvarDOCX(req, reply) {
  try {
    const { nomeArquivo, todasQuestoes, questoesSelecionadas, nome, sala, escola, nota } = req.body;

    if (!nomeArquivo || !todasQuestoes)
      return reply.code(400).send({ error: "Nome ou questões não fornecidos." });

    const todas = JSON.parse(todasQuestoes);
    const selecionadas = Array.isArray(questoesSelecionadas)
      ? questoesSelecionadas.map(i => todas[i])
      : [todas[questoesSelecionadas]];

    if (selecionadas.length === 0)
      return reply.code(400).send({ error: "Nenhuma questão selecionada." });

    const infoAluno = { nome, sala, escola, nota };
    const buffer = await gerarDOCXBuffer(selecionadas, `Prova - ${nomeArquivo}`, infoAluno);
    const fileName = nomeArquivo.toString().trim().replace(/\s+/g, "_") + ".docx";

    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buffer);

  } catch (err) {
    console.error("Erro em salvarDOCX:", err);
    return reply.code(500).send({ error: "Erro ao gerar DOCX: " + err.message });
  }
}

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

export async function listarQuestoesENEM(req, reply) {
  try {
    let { ano, disciplina } = req.query;
    ano = parseInt(ano);
    const anos = getValidanos();
    const converter = new showdown.Converter();
    const NUM_QUESTOES = 10;

    if (!ano || isNaN(ano) || ano < 2009 || ano > 2023) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        anos,
        error: "Ano inválido (deve ser entre 2009 e 2023).",
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

    while (questoes.length < NUM_QUESTOES && limit <= maxLimit) {
      const url = `${baseUrl}?limit=${limit}&offset=${offset}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

      const data = await response.json();
      let fetched = data.questions || [];
      if (mappedDiscipline) fetched = fetched.filter((q) => q.discipline === mappedDiscipline);

      fetched = fetched.filter(q => (q.context || q.text) && q.alternatives.every(alt => alt.text));

      questoes = questoes.concat(fetched);
      limit += NUM_QUESTOES;
      offset += limit;
    }

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
