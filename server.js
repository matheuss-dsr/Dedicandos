import { DatabasePostgres } from './app/infra/database_postgres.js'
import { fastify } from 'fastify'
import { registerPlugins } from './config/fastify.js'
import * as userController from './app/router/user.js'
import * as provaController from './app/router/prova.js'
import bcrypt from 'bcrypt'
import "dotenv/config"
import path from "path";
import crypto from "crypto";
import fs from 'fs/promises';

const server = fastify({ logger: true })
const database = new DatabasePostgres()

await registerPlugins(server)

// ---------------- MIDDLEWARES ----------------
server.decorate("authenticate", async (req, reply) => {
  if (!req.user) return reply.redirect('/login');
});

// Middleware para checar se o email está verificado
server.decorate("checkEmailVerified", async (req, reply) => {
  if (!req.user) return reply.redirect('/login');

  const userFromDb = await database.getUserByEmail(req.user.email);
  if (!userFromDb) return reply.redirect('/login');

  if (!userFromDb.email_verificado) return reply.redirect('/email-nao-verificado');

  req.user = userFromDb;
});

server.addHook('preHandler', async (req, reply) => {
  try {
    if (req.cookies.token) {
      const decoded = await req.jwtVerify();
      req.user = decoded;
    } else {
      req.user = null;
    }
  } catch {
    req.user = null;
  }
  reply.locals.user = req.user;
});

// ---------------- ROTAS PÚBLICAS ----------------
server.get('/', async (req, reply) => reply.view('index.ejs'))

server.get('/login', (req, reply) => {
  return reply.view('user/login.ejs', { 
    error: null, 
    success: null
  });
});

server.post('/login', async (req, reply) => {
  const { email, senha } = req.body;
  const user = await database.getUserByEmail(email);

  if (!user) return reply.view('user/login.ejs', { error: 'Usuário ou senha incorretos', success: null });

  const senhaValida = await bcrypt.compare(senha, user.senha);
  if (!senhaValida) return reply.view('user/login.ejs', { error: 'Usuário ou senha incorretos', success: null });

  const token = reply.server.jwt.sign(
    { id_usuario: user.id_usuario, email: user.email, nome: user.nome, role: user.role },
    { expiresIn: '6h' }
  );

  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 6
  });

  return reply.redirect('/home');
});


// ---------------- ROTAS DE USUÁRIOS ----------------
server.get('/cadastro', (req, reply) => userController.mostrarFormularioCriarUsuario(req, reply))
server.post('/cadastro', (req, reply) => userController.criarUsuario(req, reply, database))
server.get('/home', { preHandler: [server.authenticate, server.checkEmailVerified] }, async (req, reply) => {
  try {
    // Busca as provas do usuário logado
    const provas = await database.query(
      'SELECT * FROM provas WHERE id_usuario = $1 AND ativo = true ORDER BY id_prova DESC',
      [req.user.id_usuario]
    );

    return reply.view('home.ejs', { user: req.user, provas: provas.rows });
  } catch (err) {
    console.error(err);
    return reply.status(500).send('Erro ao carregar a página inicial');
  }
});


server.get('/logout', (req, reply) => {
  reply.clearCookie('token', { path: '/' })
  return reply.redirect('/')
})

// ---------------- ROTAS PROVAS ----------------
server.get(
  '/prova/gerar',
  { preHandler: [server.authenticate, server.checkEmailVerified] },
  (req, reply) => provaController.listarQuestoesENEM(req, reply)
);

server.get(
  '/prova/gerar/form',
  { preHandler: [server.authenticate, server.checkEmailVerified] },
  (req, reply) => provaController.mostrarFormularioGerarProva(req, reply)
);

server.post(
  '/prova/salvar',
  { preHandler: [server.authenticate, server.checkEmailVerified] },
  (req, reply) => provaController.salvarProva(req, reply, database)
);

server.get(
  '/prova/:prova_id',
  { preHandler: [server.authenticate, server.checkEmailVerified] },
  (req, reply) => provaController.exibirProva(req, reply, database)
);

server.get(
  '/prova/:prova_id/editar',
  { preHandler: [server.authenticate, server.checkEmailVerified] },
  (req, reply) => provaController.mostrarFormularioEditarProva(req, reply, database)
);

server.post(
  '/prova/:prova_id',
  { preHandler: [server.authenticate, server.checkEmailVerified] },
  (req, reply) => provaController.atualizarProva(req, reply, database)
);

server.post(
  '/prova/:prova_id/delete',
  { preHandler: [server.authenticate, server.checkEmailVerified] },
  (req, reply) => provaController.deletarProva(req, reply, database)
);


// ---------------- ROTAS USUÁRIOS ----------------
server.get('/users', { preHandler: [server.authenticate, server.checkEmailVerified] }, async (req, reply) => {
  const search = req.query.search || ''
  const status = req.query.status || 'ativos'
  const users = await database.listarUsuarios(search, status)

  return reply.view('user/list_users.ejs', { search, status, users, user: req.user })
})


server.get('/verificar-email', async (req, reply) => {
  return userController.verificarEmail(req, reply, database);
});



server.get('/perfil', { preHandler: [server.authenticate, server.checkEmailVerified] }, async (req, reply) => {
  try {
    const formatDate = (date) => date ? new Intl.DateTimeFormat('pt-BR').format(new Date(date)) : 'Não informado';

    // req.user já vem do middleware atualizado
    const user = {
      id_usuario: req.user.id_usuario,
      nome: req.user.nome,
      email: req.user.email,
      avatar_url: req.user.avatar_url || 'default-avatar.png',
      data_nascimento: formatDate(req.user.data_nascimento),
      data_cadastro: formatDate(req.user.data_cadastro),
      role: req.user.role,
      email_verificado: req.user.email_verificado
    };

    return reply.view('user/perfil.ejs', { user, error: null, success: null });
  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
    return reply.status(500).send('Erro ao carregar perfil do usuário');
  }
});



server.get('/users/:id_usuario/editar', { preHandler: [server.authenticate,  server.checkEmailVerified] } , (req, reply) => {
  return userController.mostrarFormularioEditarUsuario(req, reply, database)
})

server.post('/users/:id_usuario/editar', { preHandler: [server.authenticate,  server.checkEmailVerified] } , (req, reply) => {
  return userController.editarUsuario(req, reply, database)
})

server.post('/users/:id_usuario/upload-avatar', async (req, reply) => {
  const { id_usuario } = req.params;
  
  const file = await req.file({ fieldName: 'avatar' });
  if (!file) return reply.status(400).send("Nenhuma imagem enviada.");

  const ext = path.extname(file.filename) || ".png";
  const fileName = crypto.randomBytes(16).toString("hex") + ext;
  const uploadDir = path.join(process.cwd(), "app", "static", "uploads");
  const uploadPath = path.join(uploadDir, fileName);

  await fs.mkdir(uploadDir, { recursive: true });

  const buffer = await file.toBuffer();
  await fs.writeFile(uploadPath, buffer);

  await database.updateUser(id_usuario, { avatar_url: fileName });

  return reply.redirect('/perfil');
});

server.get('/email-nao-verificado', async (req, reply) => {
  return reply.view('user/email_nao_verificado.ejs');
});

server.get("/esqueci-senha", async (req, reply) => {
  return reply.view("user/esqueci_senha.ejs", { error: null, success: null });
});

server.post("/esqueci-senha", async (req, reply) => {
  return userController.esqueciSenha(req, reply, database);
});


server.get("/resetar-senha", async (req, reply) => {
  const { token } = req.query;

  if (!token) {
    return reply.redirect("/login");
  }

  return reply.view("user/resetar_senha.ejs", { token, error: null, success: null });
});

server.post("/resetar-senha", async (req, reply) => {
  const { token } = req.body;
  return reply.view("user/resetar_senha.ejs", { token, error: "Token inválido ou expirado", success: null });
});

// ---------------- START ----------------
server.listen({
  host: '0.0.0.0',
  port: process.env.PORT ?? 3333,
}, (err, address) => {
  if (err) {
    server.log.error(err)
    process.exit(1)
  }
  server.log.info(`Servidor rodando em ${address}`)
})
