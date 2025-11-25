import showdown from "showdown";
import fetch from "node-fetch";
import PDFDocument from "pdfkit";
import { parse } from "node-html-parser";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import { DatabasePostgres } from "../infra/database_postgres.js";
const database = new DatabasePostgres();

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
          new Paragraph({ text: `Sala: ${sala || "________"}     Data: ${dataAtual}` }),
          new Paragraph({ text: `Escola: ${escola || "__________________________"}     Nota: ${nota || "_____"}`, spacing: { after: 300 } }),

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
    const { nomeArquivo, todasQuestoes, questoesSelecionadas } = req.body;
    if (!nomeArquivo || !todasQuestoes)
      return reply.code(400).send({ error: "Nome do PDF ou questões não fornecidos." });

    const todas = JSON.parse(todasQuestoes);

    const selecionadas = Array.isArray(questoesSelecionadas)
      ? questoesSelecionadas.map(i => todas[i])
      : [todas[questoesSelecionadas]];

    if (selecionadas.length === 0)
      return reply.code(400).send({ error: "Nenhuma questão selecionada." });

    const questoesNormalizadas = selecionadas.map((q, idx) => ({
      index: idx + 1,
      title: q.title || "Questão",
      enunciado: q.enunciado || "",
      enunciadoHTML: q.enunciadoHTML || q.enunciado || "",
      alternativas: q.alternativas || [],
      alternativaCorreta: q.alternativaCorreta || "",
      disciplina: q.disciplina || "",
      alternativesIntroduction: q.alternativesIntroduction || "",
    }));

    const buffer = await gerarPDFBuffer(questoesNormalizadas, `Prova - ${nomeArquivo}`);
    const fileName = nomeArquivo.toString().trim().replace(/\s+/g, "_") + ".pdf";

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

export async function salvarNuvem(req, reply, database) { 
    const { titulo, ano, disciplina, questoes_selecionadas } = req.body;
    const user = req.user;
    if (!titulo || !questoes_selecionadas || questoes_selecionadas.length === 0) {
        return reply.code(400).send({ error: "Título e pelo menos uma questão são obrigatórios." });
    }
    try {
        if (!database) {
            return reply.code(500).send({ error: "Serviço de banco de dados indisponível." });
        }
        
        const resultado = await database.salvarProva(user.id, titulo, ano, disciplina, questoes_selecionadas);

        return reply.code(200).send({ 
            success: "Prova salva na nuvem com sucesso!", 
            prova_id: resultado.id 
        });

    } catch (err) {
        console.error("Erro ao salvar prova no DB:", err);
        return reply.code(500).send({ error: "Erro ao salvar prova na nuvem: " + err.message });
    }
}


export async function salvarProva(req, reply, database) {
  console.log("DADOS RECEBIDOS:", req.body);
  try {
    const { 
            nomeArquivo, 
            todasQuestoes, 
            questoesSelecionadas, 
            tipoArquivo,
            nome, 
            sala, 
            escola, 
            nota,
            ano, 
            disciplina
        } = req.body;

    if (!nomeArquivo || nomeArquivo.trim() === '' || !todasQuestoes)
      return reply.code(400).send({ error: "Nome ou questões não fornecidos." });

    const todas = JSON.parse(todasQuestoes);

    let selecionadas = [];
    let questoesIndices = [];
    if (Array.isArray(questoesSelecionadas)) {
      questoesIndices = questoesSelecionadas.map(Number);
    } else if (typeof questoesSelecionadas === "string") {
      questoesIndices = [Number(questoesSelecionadas)];
    }
    
    selecionadas = questoesIndices.map(i => todas[i]).filter(q => q);

    if (selecionadas.length === 0)
      return reply.code(400).send({ error: "Nenhuma questão selecionada." });

    const fileName = nomeArquivo.toString().trim().replace(/\s+/g, "_");

    if (tipoArquivo === "pdf") {
      const buffer = await gerarPDFBuffer(selecionadas, `Prova - ${fileName}`);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${fileName}.pdf"`)
        .send(buffer);

    } else if (tipoArquivo === "docx") {
      const infoAluno = { nome, sala, escola, nota };
      const buffer = await gerarDOCXBuffer(selecionadas, `Prova - ${fileName}`, infoAluno);
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        .header("Content-Disposition", `attachment; filename="${fileName}.docx"`)
        .send(buffer);

    } else if (tipoArquivo === "database") {
            
            if (!database) {
                return reply.code(500).send({ error: "Serviço de banco de dados indisponível." });
            }

            if (!ano || ano.toString().trim() === '' || !disciplina || disciplina.toString().trim() === '') {
                console.error("Falha na validação de ano/disciplina:", { ano, disciplina });
                return reply.code(400).send({ error: "O ano e a disciplina devem ser selecionados para salvar na nuvem." });
            }

            const reqParaNuvem = {
                user: req.user,
                body: {
                    titulo: nomeArquivo,
                    ano: ano.toString().trim(),
                    disciplina: disciplina.toString().trim(),
                    questoes_selecionadas: questoesIndices 
                }
            };

            return await salvarNuvem(reqParaNuvem, reply, database);

        } else {
            return reply.code(400).send({ error: "Tipo de arquivo inválido." });
        }

    } catch (err) {
        console.error("Erro em salvarProva:", err);
        return reply.code(500).send({ error: "Erro ao gerar arquivo: " + err.message });
    }
}


export async function exibirProva(req, reply, database) {
  const id_prova = req.params.prova_id;
  const user = req.user;

  if (!id_prova || !database) {
    return reply.code(400).send({ error: "ID da prova ou serviço de banco de dados não encontrado." });
  }

  try {
    const provaData = await database.getProvaComQuestoes(id_prova);

    if (!provaData || !provaData.questoes || provaData.questoes.length === 0) {
      return reply.view("provas/visualizar_prova.ejs", {
        user,
        error: "Prova não encontrada ou sem questões salvas.",
        prova: null,
        questoesDetalhes: []
      });
    }

    const promessasQuestoes = provaData.questoes.map(qId =>
      database.buscarQuestaoENEMPorIndex(qId.enem_year, qId.enem_index)
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

export async function mostrarFormularioGerarProva(req, reply) {
  const anos = getValidanos();
  return reply.view("provas/gerar_prova.ejs", {
    user: req.user,
    anos,
    ano: req.query.ano || null,
    quantity: 10,
    disciplina: req.query.disciplina || null,
    questoesOriginais: [],
    error: null,
    success: null,
  });
}

export async function listarQuestoesENEM(req, reply) {
  try {
    let { ano, disciplina, quantity } = req.query;

    const anos = getValidanos();
    const converter = new showdown.Converter();

    ano = parseInt(ano);
    const numQuestoes = parseInt(quantity) || 45;

    if (!ano || ano < 2009 || ano > 2023) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        anos,
        error: "Ano inválido (deve ser entre 2009 e 2023).",
        questoesOriginais: [],
        quantity: numQuestoes,
        disciplina: disciplina || null,
        ano: req.query.ano || null,
        success: null,
      });
    }

    const disciplinaOffsetMap = {
      linguagens: 0,
      humanas: 46,
      natureza: 91,
      matematica: 136,
    };

    let offset = disciplinaOffsetMap[disciplina] ?? 0;
    const limit = 45;

    console.log("📌 Disciplina:", disciplina);
    console.log("📌 Offset usado:", offset);

    let questoes = [];
    const BROKEN_IMAGE = "broken-image.svg";

    while (questoes.length < numQuestoes && offset < 180) {
      const apiUrl = `https://api.enem.dev/v1/exams/${ano}/questions?limit=${limit}&offset=${offset}`;

      console.log("📡 URL chamada:", apiUrl);

      const response = await fetch(apiUrl);

      if (!response.ok) {
        console.error("❌ Erro HTTP:", response.status, response.statusText);

        return reply.view("provas/gerar_prova.ejs", {
          user: req.user,
          anos,
          error: `Erro ao buscar API (${response.status}): ${response.statusText}`,
          questoesOriginais: [],
          quantity: numQuestoes,
          disciplina,
          ano,
          success: null,
        });
      }

      const data = await response.json();

      if (!data.questions || !Array.isArray(data.questions)) {
        console.error("❌ Resposta inesperada:", data);

        return reply.view("provas/gerar_prova.ejs", {
          user: req.user,
          anos,
          error: "A API retornou um formato inesperado.",
          questoesOriginais: [],
          quantity: numQuestoes,
          disciplina,
          ano,
          success: null,
        });
      }

      const blocoFiltrado = data.questions.filter((q) => {
        const ctx = q.context || q.text || "";

        const alternativasInvalidas =
          !q.alternatives || !q.alternatives.every((alt) => alt.text);

        const imagemQuebrada = ctx.includes(BROKEN_IMAGE);

        if (alternativasInvalidas || imagemQuebrada) {
          console.log(
            `⚠️ Questão removida (ID ${q.id}) Motivo: ${
              alternativasInvalidas ? "Alternativas inválidas" : ""
            } ${imagemQuebrada ? "Imagem quebrada" : ""}`
          );
          return false;
        }

        return true;
      });

      questoes = questoes.concat(blocoFiltrado);

      offset += limit;
    }

    const selecionadas = questoes.slice(0, numQuestoes);

    const questoesOriginais = selecionadas.map((q, i) => {
      const proc = processQuestion(q, converter);
      proc.index = i + 1;
      return proc;
    });

    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      anos,
      ano,
      quantity: numQuestoes,
      disciplina,
      questoesOriginais,
      error: null,
      success: `${questoesOriginais.length} questões carregadas com sucesso!`,
    });

  } catch (err) {
    console.error("🔥 ERRO GERAL:", err);

    const anos = getValidanos();
    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      anos,
      error: "Erro inesperado: " + err.message,
      questoesOriginais: [],
      quantity: req.query.quantity || 45,
      disciplina: req.query.disciplina || null,
      ano: req.query.ano || null,
      success: null,
    });
  }
}