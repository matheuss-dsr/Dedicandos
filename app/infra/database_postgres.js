import pg from "pg";
import dotenv from "dotenv";
import fetch from "node-fetch";
import showdown from "showdown";

dotenv.config();
const { Pool } = pg;

export class DatabasePostgres {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
  }

  async query(sql, params) {
    const client = await this.pool.connect();
    try {
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  /* ---------------- USUÁRIOS ---------------- */
  async listarUsuarios(search = "", status = "ativos") {
    const ativo = status === "ativos";
    const sql = `
      SELECT *
      FROM usuarios
      WHERE (nome ILIKE $1 OR email ILIKE $1)
        AND ativo = $2
      ORDER BY id_usuario ASC
    `;
    const params = [`%${search}%`, ativo];
    const result = await this.query(sql, params);
    return result.rows;
  }

  async createUser({ nome, email, senha, role, data_nascimento, email_verificado = false, email_hash = null }) {
  const sql = `
    INSERT INTO usuarios (nome, email, senha, role, data_nascimento, ativo, email_verificado, email_hash)
    VALUES ($1, $2, $3, $4, $5, true, $6, $7)
    RETURNING *;
  `;
  const result = await this.query(sql, [nome, email, senha, role, data_nascimento, email_verificado, email_hash]);
  return result.rows[0];
}

  async getUserByEmailHash(hash) {
    const result = await this.query("SELECT * FROM usuarios WHERE email_hash = $1", [hash]);
    return result.rows[0];
  }

  async getUserByEmail(email) {
    const result = await this.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    return result.rows[0];
  }

  async getUserById(id) {
    const userId = parseInt(id, 10);
    if (isNaN(userId)) return null;
    const result = await this.query("SELECT * FROM usuarios WHERE id_usuario = $1", [userId]);
    return result.rows[0] || null;
  }

  async verifyUserEmail(userId) {
    const result = await this.query(
      "UPDATE usuarios SET email_verificado = true WHERE id_usuario = $1 RETURNING *",
      [userId]
    );
    return result.rows[0];
  }

  async updateUser(id, { nome, email, senha, role, avatar_url, data_nascimento }) {
    const fields = [];
    const params = [];
    let i = 1;

    if (nome) fields.push(`nome = $${i++}`), params.push(nome);
    if (email) fields.push(`email = $${i++}`), params.push(email);
    if (senha) fields.push(`senha = $${i++}`), params.push(senha);
    if (role) fields.push(`role = $${i++}`), params.push(role);
    if (avatar_url) fields.push(`avatar_url = $${i++}`), params.push(avatar_url);
    if (data_nascimento) fields.push(`data_nascimento = $${i++}`), params.push(data_nascimento);

    if (!fields.length) return;
    const sql = `UPDATE usuarios SET ${fields.join(", ")} WHERE id_usuario = $${i}`;
    params.push(id);
    await this.query(sql, params);
  }

  async deleteUser(id) {
    await this.query("UPDATE usuarios SET ativo = false WHERE id_usuario = $1", [id]);
  }

  async reactivateUser(id) {
    await this.query("UPDATE usuarios SET ativo = true WHERE id_usuario = $1", [id]);
  }

  /* ---------------- AUTENTICAÇÃO/TOKENS ---------------- */
  
  async savePasswordResetToken(email, token, expiresAt) {
    if (!email || !token || !expiresAt) {
      throw new Error("ERRO CRÍTICO DE PARÂMETROS: E-mail, token ou expiração ausentes ao salvar o token.");
    }

    const sql = `INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at`;

    return this.query(sql, [email, token, expiresAt]);
  }

  async findPasswordResetByToken(token) {
  const result = await this.query("SELECT * FROM password_resets WHERE token = $1", [token]);

  const resetRecord = result.rows[0];
  if (!resetRecord) {
    console.log("[DEBUG] Nenhum registro encontrado.");
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(resetRecord.expires_at);

  if (now <= expiresAt) {
    return resetRecord;
  } else {
    await this.deletePasswordResetToken(token);
    return null;
  }
}

  async deletePasswordResetToken(token) {
      await this.query(
        `DELETE FROM password_resets WHERE token = $1`,
        [token]
      );
  }

  async updateUserPassword(emailHash, hashedPassword) {
    return this.query(`UPDATE usuarios SET senha = $1 WHERE email_hash = $2`, [hashedPassword, emailHash]);
  }

 /* ---------------- PROVAS ---------------- */
  async listarProvas() {
    const result = await this.query("SELECT * FROM provas WHERE ativo = true ORDER BY id_prova ASC");
    return result.rows;
  }

  async getProvaComQuestoes(id_prova) {
    const resultProva = await this.query(
      `SELECT * FROM provas WHERE id_prova = $1 AND ativo = true`,
      [id_prova]
    );

    const resultQuestoes = await this.query(
      `SELECT enem_year, enem_index 
       FROM questoes_prova 
       WHERE id_prova = $1`,
      [id_prova]
    );

    return {
      metadata: resultProva.rows[0],
      questoes: resultQuestoes.rows,
    };
  }

  async updateProva(id_prova, { titulo, disciplina, ativo }) {
    const fields = [];
    const params = [];
    let i = 1;

    if (titulo) fields.push(`titulo = $${i++}`), params.push(titulo);
    if (disciplina) fields.push(`disciplina = $${i++}`), params.push(disciplina);
    if (typeof ativo === "boolean") fields.push(`ativo = $${i++}`), params.push(ativo);

    if (!fields.length) return;

    const sql = `UPDATE provas SET ${fields.join(", ")} WHERE id_prova = $${i}`;
    params.push(id_prova);
    await this.query(sql, params);
  }

  async deleteProva(id_prova) {
    await this.query(
      `UPDATE provas SET ativo = false WHERE id_prova = $1`,
      [id_prova]
    );
  }

 async buscarQuestaoENEMPorIndex(year, index) {
    const url = `https://api.enem.dev/v1/exams/${year}/questions/${index}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro ao buscar questão ${index} do ENEM ${year}: HTTP ${response.status}`);
    
    const q = await response.json();
    if (!q || (!q.text && !q.context)) return null;

    const converter = new showdown.Converter();
    let enunciado = converter.makeHtml((q.text || q.context).trim());

    const validAlternatives = q.alternatives.filter(a => a && a.text && a.letter);
    const alternativas = validAlternatives.map(a => ({ letra: a.letter, texto: a.text }));

    let imageHTML = null;
    if (q.files && q.files.length > 0) {
      imageHTML = `<img src="${q.files[0]}" alt="Imagem da Questão" style="max-width:100%; margin-top:10px;">`;
    }

    return {
      title: q.title || `Questão ${index}`,
      enunciado,
      alternativas,
      alternativaCorreta: q.correctAlternative,
      imageHTML,
      ano: year,
      disciplina: q.discipline,
      numero: q.number
    };
  }

  async salvarProva({ titulo, id_usuario, ano, disciplina, questoes_selecionadas }) {
      const indicesSelecionados = Array.isArray(questoes_selecionadas)
        ? questoes_selecionadas.map(Number)
        : questoes_selecionadas
        ? [Number(questoes_selecionadas)]
        : [];

      if (!titulo || indicesSelecionados.length === 0) {
        throw new Error("Título e pelo menos uma questão são obrigatórios.");
      }

      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");

        const insertProvaQuery = `
          INSERT INTO provas
            (titulo, id_usuario, ano, quantidade_questoes, disciplina)
          VALUES
            ($1, $2, $3, $4, $5)
          RETURNING id_prova;
        `;
        const resultProva = await client.query(insertProvaQuery, [
          titulo,
          id_usuario,
          parseInt(ano),
          indicesSelecionados.length,
          disciplina || "Todas",
        ]);
        const id_prova = resultProva.rows[0].id_prova;

        const insertQuestaoQuery = `
          INSERT INTO questoes_prova
            (id_prova, enem_year, enem_index)
          VALUES
            ($1, $2, $3);
        `;

        const inserts = indicesSelecionados.map((index) =>
          client.query(insertQuestaoQuery, [id_prova, parseInt(ano), index])
        );

        await Promise.all(inserts);
        await client.query("COMMIT");

        return id_prova;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
}
