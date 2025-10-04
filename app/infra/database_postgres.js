import pg from "pg";
import dotenv from "dotenv";
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

  /* USERS */
  async createUser({ nome, email, senha, role, data_nascimento, email_verificado = false }) {
    const sql = `
      INSERT INTO usuarios (nome, email, senha, role, data_nascimento, ativo, email_verificado)
      VALUES ($1, $2, $3, $4, $5, true, $6)
      RETURNING *;
    `;
    const result = await this.query(sql, [nome, email, senha, role, data_nascimento, email_verificado]);
    return result.rows[0];
  }

  async getUserByEmail(email) {
    const result = await this.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return result.rows[0];
  }

  async verifyUserEmail(userId) {
    const result = await this.query(
      'UPDATE usuarios SET email_verificado = true WHERE id_usuario = $1 RETURNING *',
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
      await this.query('UPDATE usuarios SET ativo = false WHERE id_usuario = $1', [id]);
    }
    
    async reactivateUser(id) {
        const sql = 'UPDATE usuarios SET ativo = true WHERE id_usuario = $1';
        const params = [id];
        await this.query(sql, params);
    }

    async savePasswordResetToken(email, token, expiresAt) {
      return this.query(
        `INSERT INTO password_resets (email, token, expires_at) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (email) DO UPDATE 
        SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at`,
        [email, token, expiresAt]
      );
    }

    async findPasswordResetByToken(token) {
      const result = await this.query(
        `SELECT * FROM password_resets 
        WHERE token = $1 AND expires_at > NOW()`,
        [token]
      );
      return result.rows[0];
    }

    async updateUserPassword(email, hashedPassword) {
      return this.query(
        `UPDATE usuarios SET senha = $1 WHERE email = $2`,
        [hashedPassword, email]
      );
    }

  /* ---------------- PROVAS ---------------- */
  async listarProvas() {
    const result = await this.query(`SELECT * FROM provas WHERE ativo = true ORDER BY id_prova ASC`)
    return result.rows
  }

  async prova_create({ titulo, descricao, id_usuario }) {
    const result = await this.query(
      `INSERT INTO provas (titulo, descricao, id_usuario, ativo) VALUES ($1, $2, $3, true) RETURNING id_prova`,
      [titulo, descricao, id_usuario]
    )
    return result.rows[0].id_prova
  }

  async createQuestao({ id_prova, enunciado }) {
  const result = await this.query(
    `INSERT INTO questoes (id_prova, enunciado) VALUES ($1, $2) RETURNING id_questao`,
    [id_prova, enunciado]
  );
    return result.rows[0].id_questao;
  }

  async createAlternativa({ id_questao, texto, correta }) {
    await this.query(
      `INSERT INTO alternativas (id_questao, texto, correta) VALUES ($1, $2, $3)`,
      [id_questao, texto, correta]
    );
  }


  async questao_create({ id_prova, enunciado }) {
    const result = await this.query(
      `INSERT INTO questoes (id_prova, enunciado, ativo) VALUES ($1, $2, true) RETURNING id_prova`,
      [id_prova, enunciado]
    )
    return result.rows[0].id
  }

  async alternativa_create({ id_questao, texto, correta }) {
    await this.query(
      `INSERT INTO alternativas (id_questao, texto, correta) VALUES ($1, $2, $3)`,
      [id_questao, texto, correta]
    )
  }

  async updateProva(id, { titulo, descricao, ativo }) {
    await this.query(
      `UPDATE provas SET titulo = $1, descricao = $2, ativo = $3 WHERE id_prova = $4`,
      [titulo, descricao, ativo, id]
    )
  }

  async deleteProva(id) {
    await this.query(`UPDATE provas SET ativo = false WHERE id_prova = $1`, [id_prova])
  }
}
