CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    senha TEXT NOT NULL,
    nome VARCHAR(255),
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE provas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    id_usuario INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE questoes (
    id SERIAL PRIMARY KEY,
    id_prova INTEGER REFERENCES provas(id) ON DELETE CASCADE,
    enunciado TEXT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE alternativas (
    id SERIAL PRIMARY KEY,
    id_questao INTEGER REFERENCES questoes(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    correta BOOLEAN DEFAULT FALSE
);
