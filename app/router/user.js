import * as authUtils from "../utils/authUtils.js";
import * as cryptoUtils from "../utils/cryptoUtils.js";
import * as database from "../infra/database_postgres.js";
import bcrypt from 'bcrypt';

const dbClient = new database.DatabasePostgres();

const dbFor = (database) => database || dbClient;

export async function reenviarEmailVerificacao(req, reply, database) {
  const db = dbFor(database);

  try {
    const email = req.body?.email || req.query?.email;
    if (!email) {
      console.log("[ERRO FLUXO] E-mail não fornecido para reenviarEmailVerificacao.");
      return reply.view("user/reenviar_email.ejs", {
        error: "Informe o e-mail para reenviar a verificação.",
        success: null,
      });
    }

    const emailHash = cryptoUtils.hashForLookup(email);

    const user = await db.getUserByEmailHash(emailHash);

    if (!user) {
      return reply.view("user/login.ejs", {
        success:
          "Se o e-mail informado estiver em nosso sistema, você receberá instruções para verificar seu e-mail.",
        error: null,
      });
    }

    if (user.email_verificado) {
      return reply.view("user/login.ejs", { error: "E-mail já verificado.", success: null });
    }

    let rawEmail = email;
    
    try {
        rawEmail = cryptoUtils.decrypt(user.email);
    } catch (e) {

    }
    
    const token = authUtils.generateEmailToken(rawEmail);

    const verificationLink = `${process.env.APP_URL}/verificar-email?email=${encodeURIComponent(
      rawEmail
    )}&token=${token}`;

    await authUtils.sendVerificationEmail(rawEmail, user.nome, verificationLink);

    return reply.view("user/login.ejs", {
      success: "E-mail de verificação reenviado com sucesso!",
      error: null,
    });
  } catch (err) {
    return reply.view("user/login.ejs", {
      error: "Erro ao reenviar e-mail de verificação. Tente novamente mais tarde.",
      success: null,
    });
  }
}

export async function mostrarFormularioCriarUsuario(req, reply) {
  return reply.view("user/cadastro.ejs", { error: null, success: null });
}

export async function criarUsuario(req, reply, database) {
  const db = dbFor(database);

  try {
    const { nome, email, senha, data_nascimento } = req.body;
    if (!nome || !email || !senha) {
      return reply.view("user/cadastro.ejs", {
        error: "Nome, e-mail e senha são obrigatórios.",
        success: null,
      });
    }

    const encryptedEmail = cryptoUtils.encrypt(email);
    const encryptedBirth = data_nascimento ? cryptoUtils.encrypt(data_nascimento) : null;
    const emailHash = cryptoUtils.hashForLookup(email);
    const hashedPassword = await bcrypt.hash(senha, 10);

    await db.query(
      `INSERT INTO usuarios (nome, email, senha, role, data_nascimento, email_verificado, email_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nome, encryptedEmail, hashedPassword, 'usuario', encryptedBirth, false, emailHash]
    );

    console.log(`[DB] Usuário criado com sucesso no banco: ${email}`);


    const token = authUtils.generateEmailToken(email);
    const verificationLink = `${process.env.APP_URL}/verificar-email?email=${encodeURIComponent(
      email
    )}&token=${token}`;

    await authUtils.sendVerificationEmail(email, nome, verificationLink);

    return reply.view("user/login.ejs", {
      success: "Conta criada com sucesso! Verifique seu e-mail para ativar a conta.",
      error: null,
    });
  } catch (error) {
    if (error?.code === "23505") {
      return reply.view("user/cadastro.ejs", {
        error: "Esse e-mail já está em uso.",
        success: null,
      });
    }
    return reply.view("user/cadastro.ejs", {
      error: "Erro ao criar conta. Tente novamente." + error.message,
      success: null,
    });
  }
}

export async function verificarEmail(req, reply, database) {
  const db = dbFor(database);
  const { email, token } = req.query; 
  console.log(`[FLUXO] Iniciando verificarEmail para: ${email}.`);

  if (!email || !token) {
    console.log("[ERRO FLUXO] Parâmetros de verificação inválidos (email ou token ausente).");
    return reply.status(400).view("user/login.ejs", {
      error: "Parâmetros de verificação inválidos.",
      success: null,
    });
  }

  try {
    const emailHash = cryptoUtils.hashForLookup(email);
    const user = await db.getUserByEmailHash(emailHash); 

    if (!user) {
      return reply.view("user/login.ejs", { error: "Usuário não encontrado ou link inválido.", success: null });
    }

    const validToken = authUtils.generateEmailToken(email);

    if (token !== validToken) {
      return reply.view("user/login.ejs", {
        error: "Token de verificação inválido ou expirado.",
        success: null,
      });
    }

    if (user.email_verificado) {
        return reply.view("user/login.ejs", { error: "E-mail já verificado.", success: null });
    }
    await db.verifyUserEmail(user.id_usuario);

    return reply.view("user/login.ejs", {
      success: "E-mail verificado com sucesso! Agora você pode logar.",
      error: null,
    });
  } catch (err) {
    return reply.view("user/login.ejs", {
      error: "Erro ao verificar e-mail. Tente novamente mais tarde.",
      success: null,
    });
  }
}

export async function mostrarFormularioEsqueciSenha(req, reply) {
  return reply.view("user/esqueci_senha.ejs", { error: null, success: null });
}

export async function esqueciSenha(req, reply, database) {
  const db = dbFor(database);
  const { email } = req.body; 
  console.log(`[FLUXO] Iniciando esqueciSenha para: ${email}`);

  if (!email) {
    console.log("[ERRO FLUXO] E-mail não fornecido para esqueciSenha.");
    return reply.view("user/esqueci_senha.ejs", { error: "Informe o e-mail.", success: null });
  }

  try {
    const emailHash = cryptoUtils.hashForLookup(email); 
    console.log(`[DB] Buscando usuário pelo Hash para redefinição: ${emailHash.substring(0, 10)}...`);

    const user = await db.getUserByEmailHash(emailHash); 
    console.log(`[DB] Busca concluída. Encontrado: ${!!user}`);

    if (!user) {
      console.log("[FLUXO] Usuário não encontrado, retornando mensagem genérica.");
      return reply.view("user/esqueci_senha.ejs", {
        success:
          "Se o e-mail informado estiver em nosso sistema, você receberá instruções para redefinir sua senha.",
        error: null,
      });
    }

    let rawEmail = email;
    try {
        rawEmail = cryptoUtils.decrypt(user.email);
    } catch (e) {
        console.warn("[WARN] Falha ao descriptografar email do DB. Usando o email de entrada.");
    }
    
    const token = authUtils.generatePasswordResetToken(rawEmail);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.savePasswordResetToken(rawEmail, token, expiresAt);
    console.log(`[DB] Token de redefinição salvo para: ${rawEmail}.`);

    const resetLink = `${process.env.APP_URL}/resetar-senha?token=${token}`;
    
    console.log(`[EMAIL] Chamando sendPasswordResetEmail para: ${rawEmail}`);
    await authUtils.sendPasswordResetEmail(rawEmail, resetLink);
    console.log(`[EMAIL] sendPasswordResetEmail chamada concluída para: ${rawEmail}`);

    return reply.view("user/esqueci_senha.ejs", {
      success:
        "Se o e-mail informado estiver em nosso sistema, você receberá instruções para redefinir sua senha.",
      error: null,
    });
  } catch (err) {
    console.error("Erro CRÍTICO ao enviar e-mail de redefinição:", err.message, err.stack);
    if (err.message?.includes("Falha ao enviar e-mail")) {
      return reply.view("user/esqueci_senha.ejs", {
        success:
          "Se o e-mail informado estiver em nosso sistema, você receberá instruções para redefinir sua senha (o e-mail pode ter sido enviado com atraso).",
        error: null,
      });
    }
    return reply.view("user/esqueci_senha.ejs", {
      error: "Erro ao processar sua solicitação de redefinição de senha. Tente novamente mais tarde.",
      success: null,
    });
  }
}

export async function mostrarFormularioResetarSenha(req, reply) {
  const { token } = req.query;
  if (!token) {
    return reply.redirect("/esqueci-senha");
  }
  return reply.view("user/resetar_senha.ejs", { token, error: null, success: null });
}

export async function resetarSenha(req, reply, database) {
  const db = dbFor(database);
  const { token, senha } = req.body;
  console.log("[FLUXO] Iniciando resetarSenha. Token recebido:", token ? token.substring(0, 10) + '...' : 'Nulo');

  try {
    const dbToken = await db.findPasswordResetByToken(token);
    console.log(`[DB] Resultado da busca por token no DB. Encontrado: ${!!dbToken}`);

    if (!dbToken) {
      console.log("[ERRO FLUXO] Token não encontrado ou expirado no DB.");
      return reply.view("user/resetar_senha.ejs", {
        token,
        error: "Link de redefinição inválido ou expirado. Por favor, solicite um novo.",
        success: null,
      });
    }

    const email = dbToken.email;
    const emailHash = cryptoUtils.hashForLookup(email);
    const hashedPassword = await bcrypt.hash(senha, 12);

    await db.updateUserPassword(emailHash, hashedPassword);
    console.log(`[DB] Senha atualizada com sucesso para: ${email}`);

    await db.deletePasswordResetToken(token);

    return reply.view("user/login.ejs", {
      success: "Senha redefinida com sucesso! Agora você pode logar com sua nova senha.",
      error: null,
    });
  } catch (err) {
    console.error("Erro CRÍTICO ao redefinir a senha:", err.message, err.stack);
    return reply.view("user/resetar_senha.ejs", {
      token,
      error: "Erro ao redefinir a senha. Tente novamente mais tarde.",
      success: null,
    });
  }
}

export async function mostrarPerfil(req, reply, database) {
  const db = dbFor(database);

  const formatDate = (date) => {
    if (!date) return "Não informado";
    try {
      return new Intl.DateTimeFormat("pt-BR").format(new Date(date));
    } catch {
      return "Não informado";
    }
  };

  try {
    if (!req.user || !req.user.email) {
      return reply.status(401).send("Não autorizado.");
    }

    const lookupEmail = cryptoUtils.encrypt(req.user.email);
    const userFromDb = await db.getUserByEmail(lookupEmail);

    if (!userFromDb) {
      return reply.status(404).send("Usuário não encontrado.");
    }

    let decryptedEmail = userFromDb.email;
    let decryptedBirth = userFromDb.data_nascimento;

    try {
      decryptedEmail = cryptoUtils.decrypt(userFromDb.email);
    } catch (e) {
    }

    try {
      decryptedBirth = userFromDb.data_nascimento ? cryptoUtils.decrypt(userFromDb.data_nascimento) : null;
    } catch (e) {
    }

    const user = {
      id_usuario: userFromDb.id_usuario,
      nome: userFromDb.nome,
      email: decryptedEmail,
      avatar_url: userFromDb.avatar_url,
      data_nascimento: formatDate(decryptedBirth),
      data_cadastro: formatDate(userFromDb.data_cadastro),
      role: userFromDb.role,
      email_verificado: userFromDb.email_verificado,
    };

    return reply.view("user/perfil.ejs", { user, error: null, success: null });
  } catch (err) {
    req.log?.error("Erro ao carregar perfil:", err);
    return reply.status(500).send("Erro ao carregar o perfil do usuário.");
  }
}

export async function mostrarFormularioEditarUsuario(req, reply, database) {
  const db = dbFor(database);
  const id_usuario = parseInt(req.params.id_usuario, 10);

  try {
    const usuario = await db.getUserById(id_usuario);
    if (!usuario) {
      return reply.status(404).view("user/edit_user.ejs", {
        error: "Usuário não encontrado.",
        usuario: null,
      });
    }

    if (usuario.email) {
      try {
        usuario.email = cryptoUtils.decrypt(usuario.email);
      } catch (e) {
        console.error("Erro ao descriptografar o e-mail:", e);
        usuario.email = "";
      }
    }

    if (usuario.data_nascimento) {
      const data = new Date(usuario.data_nascimento);
      usuario.data_nascimento = !isNaN(data.getTime())
        ? data.toISOString().split("T")[0]
        : "";
    } else {
      usuario.data_nascimento = "";
    }

    return reply.view("user/edit_user.ejs", { error: null, success: null, usuario });
  } catch (err) {
    req.log?.error("Erro ao buscar usuário para edição:", err);
    return reply.status(500).view("user/edit_user.ejs", {
      error: "Erro ao buscar usuário.",
      usuario: null,
    });
  }
}

export async function editarUsuario(req, reply, database) {
  const db = dbFor(database);
  const { id_usuario } = req.params;
  const { nome, email, senha, role, data_nascimento } = req.body;

  try {
    const updateData = {};
    if (nome) updateData.nome = nome;
    if (email) updateData.email = cryptoUtils.encrypt(email);
    if (role) updateData.role = role;
    if (data_nascimento) updateData.data_nascimento = cryptoUtils.encrypt(data_nascimento);
    if (senha) updateData.senha = awaitbcrypt.hash(senha, 12);

    await db.updateUser(id_usuario, updateData);

    if (req.user && req.user.id_usuario === parseInt(id_usuario, 10)) {
      const updatedUser = await db.getUserById(id_usuario);
      const newToken = reply.server?.jwt.sign?.(
        {
          id_usuario: updatedUser.id_usuario,
          email: updatedUser.email,
          nome: updatedUser.nome,
          role: updatedUser.role,
        },
        { expiresIn: "6h" }
      );

      if (newToken) {
        reply.setCookie("token", newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 6,
        });
      }
    }

    return reply.redirect("/perfil");
  } catch (err) {
    req.log?.error("Erro ao editar usuário:", err);
    if (err?.code === "23505") {
      return reply.view("user/edit_user.ejs", {
        error: "Esse e-mail já está em uso por outro usuário.",
        usuario: { id_usuario, nome, email, role, data_nascimento },
      });
    }
    return reply.view("user/edit_user.ejs", {
      error: "Erro ao editar usuário. Tente novamente mais tarde.",
      usuario: { id_usuario, nome, email, role, data_nascimento },
    });
  }
}

export async function excluirUsuario(req, reply, database) {
  const db = dbFor(database);
  const { id_usuario } = req.params;
  try {
    await db.deleteUser(id_usuario);

    if (req.user && req.user.id_usuario === parseInt(id_usuario, 10)) {
      reply.clearCookie("token", { path: "/" });
      return reply.redirect("/");
    }
    return reply.redirect("/users");
  } catch (err) {
    req.log?.error("Erro ao excluir usuário:", err);
    return reply.status(500).send("Erro ao excluir usuário.");
  }
}

export async function reativarUsuario(req, reply, database) {
  const db = dbFor(database);
  const { id_usuario } = req.params;
  try {
    await db.reactivateUser(id_usuario);
    return reply.redirect("/users?status=inativos");
  } catch (err) {
    req.log?.error("Erro ao reativar usuário:", err);
    return reply.status(500).send("Erro ao reativar usuário.");
  }
}

export async function uploadAvatar(req, reply, database) {
  const db = dbFor(database);
  const { id_usuario } = req.params;

  try {
    const file = await req.file({ fieldName: "avatar" });
    if (!file) {
      return reply.status(400).view("user/perfil.ejs", {
        user: req.user,
        error: "Nenhuma imagem enviada.",
        success: null,
      });
    }

    const ext = path.extname(file.filename || file.hapi?.filename || "").toLowerCase();
    const allowedExtensions = [".png", ".jpg", ".jpeg", ".gif"];
    if (!allowedExtensions.includes(ext)) {
      return reply.status(400).view("user/perfil.ejs", {
        user: req.user,
        error: "Formato de arquivo inválido. Apenas PNG, JPG, JPEG e GIF são permitidos.",
        success: null,
      });
    }

    const fileName = crypto.randomBytes(16).toString("hex") + ext;
    const uploadDir = path.join(process.cwd(), "app", "static", "uploads");
    const uploadPath = path.join(uploadDir, fileName);

    await fs.mkdir(uploadDir, { recursive: true });

    const buffer = await file.toBuffer();
    await fs.writeFile(uploadPath, buffer);

    const user = await db.getUserById(id_usuario);
    if (user && user.avatar_url && user.avatar_url !== "default-avatar.png") {
      const oldAvatarPath = path.join(uploadDir, user.avatar_url);
      try {
        await fs.unlink(oldAvatarPath);
      } catch (unlinkErr) {
        req.log?.warn?.(`Não foi possível remover o avatar antigo ${user.avatar_url}: ${unlinkErr.message}`);
      }
    }

    await db.updateUser(id_usuario, { avatar_url: fileName });

    if (req.user && req.user.id_usuario === parseInt(id_usuario, 10)) {
      const updatedUser = await db.getUserById(id_usuario);
      const newToken = reply.server?.jwt.sign?.(
        {
          id_usuario: updatedUser.id_usuario,
          email: updatedUser.email,
          nome: updatedUser.nome,
          role: updatedUser.role,
        },
        { expiresIn: "6h" }
      );

      if (newToken) {
        reply.setCookie("token", newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 6,
        });
      }
    }

    return reply.redirect("/perfil");
  } catch (err) {
    req.log?.error("Erro ao fazer upload do avatar:", err);
    return reply.status(500).view("user/perfil.ejs", {
      user: req.user,
      error: "Erro ao fazer upload do avatar. Tente novamente mais tarde.",
      success: null,
    });
  }
}

export async function listarUsuarios(req, reply, database) {
  const db = dbFor(database);
  const search = req.query?.search || "";
  const status = req.query?.status || "ativos";

  try {
    const users = await db.listarUsers(search, status);
    return reply.view("user/list_users.ejs", { search, status, users, user: req.user });
  } catch (err) {
    req.log?.error("Erro ao listar usuários:", err);
    return reply.status(500).send("Erro ao carregar a lista de usuários.");
  }
}