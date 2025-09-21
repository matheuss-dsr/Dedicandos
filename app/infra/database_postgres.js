import pg from "pg"
import dotenv from "dotenv"

dotenv.config()
const { Pool } = pg

export class DatabasePostgres {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    })
  }

  async query(sql, params) {
    const client = await this.pool.connect()
    try {
      const result = await client.query(sql, params)
      return result
    } finally {
      client.release()
    }
  }

  /* ---------------- USERS ---------------- */
  async listarUsers(search = '', status = 'ativos') {
        let sql = 'SELECT * FROM usuarios';
        const params = [];

        if (status === 'ativos') {
            sql += ' WHERE ativo = true';
        } else if (status === 'inativos') {
            sql += ' WHERE ativo = false';
        }

        if (search) {
            sql += params.length ? ' AND ' : ' WHERE ';
            sql += 'username ILIKE $' + (params.length + 1);
            params.push(`%${search}%`);
        }

        sql += ' ORDER BY id_usuario ASC';

        const result = await this.query(sql, params);
        return result.rows;
    }
    async createUser({ nome, email, senha, role, data_nascimento, email_verificado = false, email_token = null }) {
      const sql = `
        INSERT INTO usuarios (nome, email, senha, role, data_nascimento, ativo, email_verificado, email_token)
        VALUES ($1, $2, $3, $4, $5, true, $6, $7)
        RETURNING *;
      `;
      const params = [nome, email, senha, role, data_nascimento, email_verificado, email_token];
      const result = await this.query(sql, params);
      return result.rows[0];
    }

    async getUserByEmail(email) {
      const sql = 'SELECT * FROM usuarios WHERE email = $1';
      const params = [email];
      const result = await this.query(sql, params);
      return result.rows[0];
    } 


    async getUserById(id) {
      const sql = 'SELECT * FROM usuarios WHERE id_usuario = $1';
      const params = [id];
      const result = await this.query(sql, params);
      return result.rows[0];
    }

    async getUserByToken(token) {
      const sql = 'SELECT * FROM usuarios WHERE email_token = $1';
      const result = await this.query(sql, [token]);
      return result.rows[0];
    }

    async verifyUserEmail(userId) {
      const sql = `
        UPDATE usuarios
        SET email_verificado = true,
            email_token = NULL
        WHERE id_usuario = $1
      `;
      await this.query(sql, [userId]);
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

      if (fields.length === 0) return;

      const sql = `UPDATE usuarios SET ${fields.join(", ")} WHERE id_usuario = $${i}`;
      params.push(id);

      await this.query(sql, params);
    }

    
    async deleteUser(id) {
        const sql = 'UPDATE usuarios SET ativo = false WHERE id_usuario = $1';
        const params = [id];
        await this.query(sql, params);
    }

    async reactivateUser(id) {
        const sql = 'UPDATE usuarios SET ativo = true WHERE id_usuario = $1';
        const params = [id];
        await this.query(sql, params);
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
