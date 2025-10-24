import showdown from "showdown";
import fetch from "node-fetch";

// !!! NOVOS IMPORTS NECESSÁRIOS PARA A FUNÇÃO salvarPDF !!!
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
// ----------------------------------------------------

// Importa a função do arquivo de utilidades da AI. 
// Certifique-se de que gerarResolucao em '../utils/aiUtils.js'
// está usando o import e o cliente corretos (@google/genai).
import { gerarResolucao } from "../utils/aiUtils.js";


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


// Processar questão
function processQuestion(q, converter) {
 // Tratamento para garantir que o enunciado seja sempre uma string
 const enunciadoTexto = q.context || q.text || "";
 const enunciadoHTML = converter.makeHtml(enunciadoTexto);

 const alternativas = q.alternatives.map((alt) => ({
  letra: alt.letter,
  // Tratamento para garantir que o texto da alternativa seja sempre uma string
  texto: converter.makeHtml(alt.text || ""), 
  correta: alt.isCorrect,
 }));

 return {
  title: q.title || "Questão",
  // Retorna o texto bruto para a Gemini API, e não o HTML
  enunciado: enunciadoTexto, 
  enunciadoHTML: enunciadoHTML, // Mantém o HTML para renderização na view
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
  ano: null,
  quantity: null,
  disciplina: null,
  questoesOriginais: [],
  error: null,
  resolucao: null,
  success: null,
 });
}

// Listar questões do ENEM
export async function listarQuestoesENEM(req, reply) {
 try {
  let { ano, quantity, disciplina } = req.query;
  ano = parseInt(ano);
  quantity = parseInt(quantity);
  const anos = getValidanos();
  const converter = new showdown.Converter();

  // --- Validações de entrada ---
  if (!ano || isNaN(ano) || ano < 2009 || ano > 2023) {
   return reply.view("provas/gerar_prova.ejs", {
    user: req.user,
    anos,
    error: "Ano inválido (deve ser entre 2009 e 2023).",
    questoesOriginais: [],
    quantity,
    disciplina,
    resolucao: null,
    success: null,
   });
  }

  if (!quantity || isNaN(quantity) || quantity <= 0) {
   return reply.view("provas/gerar_prova.ejs", {
    user: req.user,
    anos,
    error: "Quantidade inválida (deve ser um número positivo).",
    questoesOriginais: [],
    quantity,
    disciplina,
    resolucao: null,
    success: null,
   });
  }
  // -------------------------------

  const baseUrl = `https://api.enem.dev/v1/exams/${ano}/questions`;
  const mappedDiscipline = disciplina ? disciplineMapping[disciplina] : null;

  const disciplinaOffsetMap = {
   linguagens: 0,
   "ciencias-humanas": 46,
   "ciencias-natureza": 91,
   matematica: 136,
  };

  const offset = mappedDiscipline ? disciplinaOffsetMap[mappedDiscipline] : 0;
  const maxLimit = 180;
  // Garante que a quantidade não ultrapasse o limite da prova
  if (quantity + offset > maxLimit) quantity = maxLimit - offset;

  const url = `${baseUrl}?limit=${quantity}&offset=${offset}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro HTTP ao buscar questões: ${response.status}`);

  const data = await response.json();
  let questoes = data.questions || [];
  
  // A filtragem deve ser feita APENAS se o mappedDiscipline não for nulo
  // Se a API já estiver filtrando (o que é o caso com o offset), esta linha pode ser redundante, 
  // mas é mantida por segurança.
  if (mappedDiscipline)
   questoes = questoes.filter((q) => q.discipline === mappedDiscipline);

  // Processa questões e gera resolução automaticamente
  const questoesOriginais = [];
  for (let i = 0; i < questoes.length; i++) {
   // Passa o converter para processQuestion
   const q = processQuestion(questoes[i], converter); 
   q.index = i + 1;
   
   // O enunciado passado para gerarResolucao é o texto BRUTO, não o HTML.
   try {
    // Concatena a questão para dar mais contexto ao Gemini
    const promptCompleto = `ENEM ${ano} | Disciplina: ${q.disciplina} | Questão ${q.index}:\n${q.enunciado}`;
    q.resolucao = await gerarResolucao(promptCompleto);
   } catch (err) {
    console.error(`Erro ao gerar resolução para questão ${q.index}:`, err.message);
    q.resolucao = "Não foi possível gerar a resolução.";
   }
   questoesOriginais.push(q);
  }

  return reply.view("provas/gerar_prova.ejs", {
   user: req.user,
   anos,
   ano,
   quantity,
   disciplina,
   questoesOriginais,
   error: null,
   resolucao: null,
   success: `Resoluções geradas automaticamente para ${questoesOriginais.length} questões!`,
  });
 } catch (err) {
  console.error("Erro geral na listagem de questões:", err.message);
  const anos = getValidanos();
  return reply.view("provas/gerar_prova.ejs", {
   user: req.user,
   anos,
   error: `Ocorreu um erro: ${err.message}`,
   questoesOriginais: [],
   quantity: req.query.quantity || null,
   disciplina: req.query.disciplina || null,
   resolucao: null,
   success: null,
  });
 }
}

// Gerar resolução da questão
export async function gerarResolucaoQuestao(req, reply) {
 try {
  const { questao } = req.body;
  
  if (!questao) throw new Error("O corpo da requisição não contém a questão.");
  

  const resolucao = await gerarResolucao(questao);

  const anos = getValidanos();
  console.log("Resolução gerada:", resolucao);
  return reply.view("provas/gerar_prova.ejs", {
   user: req.user,
   anos,
   questoesOriginais: [],
   ano: null,
   quantity: null,
   disciplina: null,
   error: null,
   resolucao,
   success: "Resolução gerada com sucesso!",
  });
 } catch (err) {
  console.error("Erro em gerarResolucaoQuestao:", err.message);
  const anos = getValidanos();
  return reply.view("provas/gerar_prova.ejs", {
   user: req.user,
   anos,
   questoesOriginais: [],
   ano: null,
   quantity: null,
   disciplina: null,
   error: "Erro ao gerar resolução: " + err.message,
   resolucao: null,
   success: null,
  });
 }
}

export async function salvarPDF(req, reply) {
 try {
  const { resolucao } = req.body;
  if (!resolucao) return reply.code(400).send({ error: "Nenhuma resolução recebida." });

  const doc = new PDFDocument();
  
  const filePath = path.join(process.cwd(), "app", "static", "pdfs"); 
  fs.mkdirSync(filePath, { recursive: true });
  const fileName = `resolucao-${Date.now()}.pdf`;
  const outputPath = path.join(filePath, fileName);

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(18).text("Resolução da Questão", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(resolucao, { align: "left" });
  doc.end();

  stream.on("finish", () => {
   reply.download(outputPath, fileName); 
  });

  // Trata o caso em que o download não é iniciado imediatamente (erro ou time-out)
  stream.on("error", (err) => {
   console.error("Erro no stream do PDF:", err);
   reply.code(500).send({ error: "Erro ao escrever o arquivo PDF." });
  });

 } catch (err) {
  console.error("Erro em salvarPDF:", err.message);
  return reply.code(500).send({ error: "Erro ao gerar PDF: " + err.message });
 }
}