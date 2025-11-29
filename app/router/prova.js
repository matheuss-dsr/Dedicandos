import showdown from "showdown";
import fetch from "node-fetch";
import PDFDocument from "pdfkit";
import { parse } from "node-html-parser";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import { DatabasePostgres } from "../infra/database_postgres.js";

const database = new DatabasePostgres();

function getValid_provaanos() {
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
  altura += doc.heightOfString(`Questão #${q.index}: ${q.title}`, {
    wid_provath: doc.page.wid_provath - 100,
    fontSize: 14,
  });
  const enunciado = limparHTML(q.enunciadoHTML || q.enunciado);
  altura += doc.heightOfString(enunciado, {
    wid_provath: doc.page.wid_provath - 140,
    fontSize: 12,
  });
  const imgRegex = /!\[.*?\]\((.*?)\)/g;
  const numImagens = (q.enunciado.match(imgRegex) || []).length;
  altura += numImagens * (300 + 20);
  const alternativasTexto = q.alternativas
    .map((a) => `${a.letra}) ${limparHTML(a.texto)}`)
    .join("\n");
  altura += doc.heightOfString(alternativasTexto, {
    wid_provath: doc.page.wid_provath - 180,
    fontSize: 12,
  });
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

      for (let id_provax = 0; id_provax < questoes.length; id_provax++) {
        const q = questoes[id_provax];
        const alturaQuestao = estimarAlturaQuestao(doc, q);
        const espacoDisponivel =
          doc.page.height - doc.page.margins.bottom - doc.y;
        if (id_provax > 0 && alturaQuestao > espacoDisponivel) doc.addPage();

        doc.fontSize(14).text(`Questão #${q.index}: ${q.title}`, { bold: true });
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
            doc.image(imgBuffer, { wid_provath: 300, align: "center" });
            doc.moveDown(0.5);
          } catch {}
        }

        const alternativasTexto = q.alternativas
          .map((a) => `${a.letra}) ${limparHTML(a.texto)}`)
          .join("\n");
        doc.fontSize(12).text(alternativasTexto, { indent: 40 });
        doc.moveDown(1);
        doc
          .moveTo(doc.x, doc.y)
          .lineTo(doc.page.wid_provath - doc.page.margins.right, doc.y)
          .stroke();
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
  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: tituloProva,
            heading: HeadingLevel.TITLE,
            spacing: { after: 200 },
          }),
          new Paragraph({ text: `Nome: ${nome || "_____________________"}` }),
          new Paragraph({
            text: `Sala: ${sala || "________"}     Data: ${dataAtual}`,
          }),
          new Paragraph({
            text: `Escola: ${
              escola || "__________________________"
            }     Nota: ${nota || "_____"}`.trim(),
            spacing: { after: 300 },
          }),

          ...questoes.flatMap((q, id_provax) => {
            const enunciadoLimpo = limparHTML(q.enunciadoHTML || q.enunciado);
            const alternativasTexto = q.alternativas
              .map((a) => `${a.letra}) ${limparHTML(a.texto)}`)
              .join("\n");

            return [
              new Paragraph({
                text: `Questão #${q.index}: ${q.title}`,
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 100 },
              }),
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

export async function salvarProva(req, reply) {
  try {
    const { nomeArquivo, todasQuestoes, questoesSelecionadas, tipoArquivo } = req.body;

    const user = req.user;
    const id_usuario = user?.id_usuario;

    if (!id_usuario) {
      return reply.code(401).send({ error: "Usuário não autenticado." });
    }

    if (!nomeArquivo || nomeArquivo.trim() === "" || !todasQuestoes) {
      return reply.code(400).send({ error: "Nome ou questões não fornecidos." });
    }

    const todas = JSON.parse(todasQuestoes);

    let questoesIndices = [];
    if (Array.isArray(questoesSelecionadas)) {
      questoesIndices = questoesSelecionadas.map(Number);
    } else if (typeof questoesSelecionadas === "string") {
      questoesIndices = [Number(questoesSelecionadas)];
    }

    const selecionadas = questoesIndices.map((i) => todas[i]).filter(Boolean);
    if (selecionadas.length === 0) {
      return reply.code(400).send({ error: "Nenhuma questão selecionada." });
    }

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

    const fileName = nomeArquivo.toString().trim().replace(/\s+/g, "_");

    if (tipoArquivo === "pdf") {
      const buffer = await gerarPDFBuffer(questoesNormalizadas, `Prova - ${fileName}`);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${fileName}.pdf"`)
        .send(buffer);
    }

    if (tipoArquivo === "docx") {
      const { nome, sala, escola, nota } = req.body;
      const infoAluno = { nome, sala, escola, nota };
      const buffer = await gerarDOCXBuffer(questoesNormalizadas, `Prova - ${fileName}`, infoAluno);
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        .header("Content-Disposition", `attachment; filename="${fileName}.docx"`)
        .send(buffer);
    }

    if (tipoArquivo === "nuvem") {
    const fileName = nomeArquivo.toString().trim().replace(/\s+/g, "_");
    const apiURL = req.body.apiUrl?.trim();
    const ano = Number(req.body.ano);
    const disciplina = req.body.disciplina?.trim();
    const quantidade = Number(req.body.quantidade) || 0;

    if (!apiURL || !ano || !disciplina || quantidade <= 0) {
        return reply.code(400).send({ error: "Dados insuficientes para salvar na nuvem." });
    }

    const apiUrlCorrigida = apiURL.replace(/limit=\d+/i, `limit=${quantidade}`);
    const disciplinaDigitada = disciplina.trim();
    const apiUrl = apiUrlCorrigida.trim();

    try {
        await database.query(
            `INSERT INTO provas (id_usuario, titulo, api_url, ano, disciplina, quantidade)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id_usuario, fileName, apiUrl, ano, disciplinaDigitada, quantidade]
        );

        const anos = getValid_provaanos();
        const disciplinas = ["natureza", "humanas", "linguagens", "matematica"];

        return reply.view("provas/gerar_prova.ejs", {
            success: "Prova salva na nuvem com sucesso!",
            error: null,
            user: req.user,
            anos,
            disciplinas,
            ano,
            quantity: quantidade,
            disciplina: disciplinaDigitada,
            questoesOriginais: questoesNormalizadas,
            apiUrlUsada: apiUrl
        });
    } catch (err) {
        console.error("Erro ao salvar prova na nuvem:", err);
        return reply.code(500).send({ error: "Erro ao salvar prova na nuvem." });
    }
}

    return reply.code(400).send({ error: "Tipo de arquivo inválido." });
  } catch (error) {
    console.error("Erro em salvarProva:", error);
    return reply.code(500).send({ error: "Erro ao processar sua solicitação: " + error.message });
  }
}


export async function mostrarFormularioGerarProva(req, reply) {
  const anos = getValid_provaanos();
  const disciplinas = ["natureza", "humanas", "linguagens", "matematica"];

  let { ano, disciplina, quantity, apiUrl, id_prova } = req.query;
  console.log("Parâmetros recebidos:", { ano, disciplina, quantity, apiUrl, id_prova });
  if (id_prova) {
    try {
      const result = await database.query(
        "SELECT * FROM provas WHERE id_prova = $1",
        [id_prova]
      );

      if (result.rows.length > 0) {
        const prova = result.rows[0];
        apiUrl = prova.api_url;
        ano = prova.ano;
        disciplina = prova.disciplina;
        quantity = prova.quantidade || 10;
      }
    } catch (err) {
      console.error("Erro ao buscar prova:", err);
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        anos,
        disciplinas,
        error: "Erro ao carregar a prova do banco.",
        questoesOriginais: [],
        quantity: quantity || 10,
        disciplina,
        ano,
        success: null,
        apiUrlUsada: null,
      });
    }
    console.log("Carregando prova com ID:", id_prova, "API URL:", apiUrl);
  }

  if (apiUrl) {
    try {
      const fixedUrl = apiUrl.replace(/limit=\d+/i, `limit=${quantity}`);
      const response = await fetch(fixedUrl);

      if (!response.ok) {
        return reply.view("provas/gerar_prova.ejs", {
          user: req.user,
          anos,
          disciplinas,
          error: "Não foi possível carregar a prova salva.",
          questoesOriginais: [],
          quantity,
          disciplina,
          ano,
          success: null,
          apiUrlUsada: fixedUrl,
        });
      }

      const data = await response.json();
      const converter = new showdown.Converter();
      const desired = Math.max(0, Number(quantity) || 0);

      const questionsArray = Array.isArray(data.questions)
        ? data.questions.slice(0, desired)
        : [];

      const questoesOriginais = questionsArray.map((q, i) => {
        const proc = processQuestion(q, converter);
        proc.index = i + 1;
        return proc;
      });

      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        anos,
        disciplinas,
        ano,
        quantity,
        disciplina,
        questoesOriginais,
        error: null,
        success: "Prova carregada com sucesso!",
        apiUrlUsada: fixedUrl,
      });
    } catch (err) {
      console.error("Erro ao carregar API da prova:", err);
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        anos,
        disciplinas,
        error: "Erro ao carregar prova salva: " + err.message,
        questoesOriginais: [],
        quantity,
        disciplina,
        ano,
        success: null,
        apiUrlUsada: apiUrl,
      });
    }
  }
  return reply.view("provas/gerar_prova.ejs", {
    user: req.user,
    anos,
    disciplinas,
    ano: ano || null,
    quantity: quantity || 10,
    disciplina: disciplina || null,
    questoesOriginais: [],
    error: null,
    success: null,
  });
}

export async function deletarProva(req, reply, database) {
  try {
    const { prova_id } = req.params;

    if (!prova_id) {
      return reply.code(400).send({ error: "ID da prova não informado." });
    }

    const user = req.user;

    const consulta = await database.query(
      "SELECT id_usuario FROM provas WHERE id_prova = $1 AND ativo = true",
      [prova_id]
    );

    if (consulta.rowCount === 0) {
      return reply.code(404).send({ error: "Prova não encontrada." });
    }

    if (consulta.rows[0].id_usuario !== user.id_usuario) {
      return reply.code(403).send({ error: "Você não pode excluir provas de outro usuário." });
    }

    await database.deleteProva(prova_id);

    return reply.redirect("/home?success=Prova+excluída+com+sucesso");

  } catch (err) {
    console.error("Erro ao excluir prova:", err);
    return reply.code(500).send({ error: "Erro interno ao excluir prova." });
  }
}

export async function listarQuestoesENEM(req, reply) {
  const disciplinaOffsetMap = {
    linguagens: 0,
    humanas: 46,
    natureza: 91,
    matematica: 136,
  };

  try {
    function gerarApiUrl(ano, limit, offset) {
      return `https://api.enem.dev/v1/exams/${ano}/questions?limit=${limit}&offset=${offset}`;
    }

    let { ano, disciplina, quantity } = req.query;
    const anos = getValid_provaanos();
    const converter = new showdown.Converter();

    ano = parseInt(ano);
    const numQuestoes = parseInt(quantity) || 10;

    if (!ano || ano < 2009 || ano > 2023) {
      return reply.view("provas/gerar_prova.ejs", {
        user: req.user,
        anos,
        error: "Ano inválid_provao (deve ser entre 2009 e 2023).",
        questoesOriginais: [],
        quantity: numQuestoes,
        disciplina: disciplina || null,
        ano: req.query.ano || null,
        success: null,
        apiUrlUsada: null,
      });
    }

    let offset = disciplinaOffsetMap[disciplina] ?? 0;
    const limit = 45;

    let questoes = [];
    const BROKEN_IMAGE = "broken-image.svg";

    let apiUrlUsada = null;

    while (questoes.length < numQuestoes && offset < 180) {
      const apiUrl = gerarApiUrl(ano, limit, offset);

      if (!apiUrlUsada) apiUrlUsada = apiUrl;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        return reply.view("provas/gerar_prova.ejs", {
          user: req.user,
          anos,
          error: `Erro ao buscar API (${response.status}): ${response.statusText}`,
          questoesOriginais: [],
          quantity: numQuestoes,
          disciplina,
          ano,
          success: null,
          apiUrlUsada,
        });
      }

      const data = await response.json();

      if (!data.questions || !Array.isArray(data.questions)) {
        return reply.view("provas/gerar_prova.ejs", {
          user: req.user,
          anos,
          error: "A API retornou um formato inesperado.",
          questoesOriginais: [],
          quantity: numQuestoes,
          disciplina,
          ano,
          success: null,
          apiUrlUsada,
        });
      }

      const blocoFiltrado = data.questions.filter((q) => {
        const ctx = q.context || q.text || "";
        const alternativasInvalid_provaas =
          !q.alternatives || !q.alternatives.every((alt) => alt.text);
        const imagemQuebrada = ctx.includes(BROKEN_IMAGE);
        if (alternativasInvalid_provaas || imagemQuebrada) {
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
      proc.index = i;
      return proc;
    });

    if (req.user && apiUrlUsada) {
      try {
        await database.salvarURLRequisitada(
          req.user.id_prova,
          apiUrlUsada,
          ano,
          disciplina || null,
          numQuestoes
        );
      } catch {}
    }

    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      anos,
      ano,
      quantity: numQuestoes,
      disciplina,
      questoesOriginais,
      error: null,
      success: `${questoesOriginais.length} questões carregadas com sucesso!`,
      apiUrlUsada,
    });

  } catch (err) {
    const anos = getValid_provaanos();
    return reply.view("provas/gerar_prova.ejs", {
      user: req.user,
      anos,
      error: "Erro inesperado: " + err.message,
      questoesOriginais: [],
      quantity: req.query.quantity || 10,
      disciplina: req.query.disciplina || null,
      ano: req.query.ano || null,
      success: null,
      apiUrlUsada: null,
    });
  }
}
