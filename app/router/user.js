import bcrypt from "bcrypt";
import { 
  generateEmailToken, 
  generatePasswordResetToken, 
  validatePasswordResetToken, 
  sendVerificationEmail, 
  sendPasswordResetEmail 
} from "../utils/authUtils.js";
import { encrypt, decrypt } from "../utils/cryptoUtils.js";
import path from "path";
import crypto from "crypto";
import fs from "fs/promises";

export async function mostrarFormularioCriarUsuario(req, reply) {
  return reply.view("user/cadastro.ejs", { error: null, success: null });
}

export async function criarUsuario(req, reply, database) {
  const { nome, email, senha, data_nascimento } = req.body;
  const role = "usuario";

  try {
    const hashedPassword = await bcrypt.hash(senha, 12);

    // Criptografa os dados sensíveis
    const encryptedNome = encrypt(nome);
    const encryptedEmail = encrypt(email);
    const encryptedNascimento = encrypt(data_nascimento);

    const user = await database.createUser({
      nome: encryptedNome,
      email: encryptedEmail,
      senha: hashedPassword,
      role,
      data_nascimento: encryptedNascimento,
      email_verificado: false,
    });

    // Gera token de verificação
    const token = generateEmailToken(email);
    const verificationLink = `${process.env.APP_URL}/verificar-email?email=${encodeURIComponent(email)}&token=${token}`;
    await sendVerificationEmail(email, nome, verificationLink);

    return reply.view("user/cadastro.ejs", { 
      success: "Cadastro realizado! Verifique seu e-mail para ativar sua conta.", 
      error: null 
    });

  } catch (err) {
    console.error("Erro ao criar usuário:", err);
    if (err.code === "23505") {
      return reply.view("user/cadastro.ejs", { error: "Esse e-mail já está em uso.", success: null });
    }
    if (err.message.includes("Falha ao enviar e-mail")) {
      return reply.view("user/cadastro.ejs", { 
        success: "Cadastro realizado, mas houve um problema ao enviar o e-mail de verificação. Tente reenviar após o login.", 
        error: null 
      });
    }
    return reply.view("user/cadastro.ejs", { error: "Erro ao criar usuário. Tente novamente mais tarde.", success: null });
  }
}

export async function mostrarFormularioEsqueciSenha(req, reply) {
  return reply.view("user/esqueci_senha.ejs", { error: null, success: null });
}

export async function esqueciSenha(req, reply, database) {
  const { email } = req.body;

  if (!email) {
    return reply.view("user/esqueci_senha.ejs", { error: "Informe o e-mail.", success: null });
  }

  try {
    const encryptedEmail = encrypt(email);
    const user = await database.getUserByEmail(encryptedEmail);

    if (!user) {
      return reply.view("user/esqueci_senha.ejs", {
        success: "Se o e-mail informado estiver em nosso sistema, você receberá instruções para redefinir sua senha.",
        error: null,
      });
    }

    const token = generatePasswordResetToken(email);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    await database.savePasswordResetToken(encryptedEmail, token, expiresAt);

    const resetLink = `${process.env.APP_URL}/resetar-senha?token=${token}`;
    await sendPasswordResetEmail(email, resetLink);

    return reply.view("user/esqueci_senha.ejs", {
      success: "Se o e-mail informado estiver em nosso sistema, você receberá instruções para redefinir sua senha.",
      error: null,
    });
  } catch (err) {
    console.error("Erro ao enviar e-mail de redefinição:", err);
    if (err.message.includes("Falha ao enviar e-mail")) {
      return reply.view("user/esqueci_senha.ejs", {
        success: "Se o e-mail informado estiver em nosso sistema, você receberá instruções para redefinir sua senha (o e-mail pode ter sido enviado com atraso).",
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

export async function verificarEmail(req, reply, database) {
  const { email, token } = req.query;

  if (!email || !token) {
    return reply.status(400).view("user/login.ejs", { 
      error: "Parâmetros de verificação inválidos.", 
      success: null
    });
  }

  try {
    const encryptedEmail = encrypt(email);
    const user = await database.getUserByEmail(encryptedEmail);

    if (!user) {
      return reply.view("user/login.ejs", { 
        error: "Usuário não encontrado.", 
        success: null 
      });
    }

    const validToken = generateEmailToken(email);
    if (token !== validToken) {
      return reply.view("user/login.ejs", { 
        error: "Token de verificação inválido ou expirado.", 
        success: null
      });
    }

    await database.verifyUserEmail(user.id_usuario);
    return reply.view("user/login.ejs", { 
      success: "E-mail verificado com sucesso! Agora você pode logar.", 
      error: null 
    });

  } catch (err) {
    console.error("Erro ao verificar e-mail:", err);
    return reply.view("user/login.ejs", { 
      error: "Erro ao verificar e-mail. Tente novamente mais tarde.", 
      success: null 
    });
  }
}

export async function resetarSenha(req, reply, database) {
  const { token, senha } = req.body;

  if (!token || !senha) {
    return reply.view("user/resetar_senha.ejs", { 
      token, 
      error: "Informe o token e a nova senha.", 
      success: null
    });
  }

  const email = validatePasswordResetToken(token);
  if (!email) {
    return reply.view("user/resetar_senha.ejs", { 
      token, 
      error: "Link de redefinição inválido ou expirado. Por favor, solicite um novo.", 
      success: null
    });
  }

  try {
    const encryptedEmail = encrypt(email);
    const dbToken = await database.findPasswordResetByToken(token);

    if (!dbToken || dbToken.email !== encryptedEmail) {
      return reply.view("user/resetar_senha.ejs", { 
        token, 
        error: "Link de redefinição inválido ou já utilizado. Por favor, solicite um novo.", 
        success: null
      });
    }

    const hashedPassword = await bcrypt.hash(senha, 12);
    await database.updateUserPassword(encryptedEmail, hashedPassword);

    return reply.view("user/login.ejs", {
      success: "Senha redefinida com sucesso! Agora você pode logar com sua nova senha.",
      error: null 
    });
  } catch (err) {
    console.error("Erro ao redefinir a senha:", err);
    return reply.view("user/resetar_senha.ejs", { 
      token, 
      error: "Erro ao redefinir a senha. Tente novamente mais tarde.", 
      success: null  
    });
  }
}

export async function mostrarPerfil(req, reply, database) {
  const formatDate = (date) => {
    if (!date) return "Não informado";
    return new Intl.DateTimeFormat("pt-BR").format(new Date(date));
  };

  try {
    const encryptedEmail = encrypt(req.user.email);
    const userFromDb = await database.getUserByEmail(encryptedEmail);

    if (!userFromDb) {
      return reply.status(404).send("Usuário não encontrado.");
    }

    const user = {
      id_usuario: userFromDb.id_usuario,
      nome: decrypt(userFromDb.nome),
      email: decrypt(userFromDb.email),
      avatar_url: userFromDb.avatar_url,
      data_nascimento: decrypt(userFromDb.data_nascimento),
      data_cadastro: formatDate(userFromDb.data_cadastro),
      role: userFromDb.role,
      email_verificado: userFromDb.email_verificado,
    };

    return reply.view("user/perfil.ejs", { user, error: null, success: null });
  } catch (err) {
    req.log.error("Erro ao carregar perfil:", err);
    return reply.status(500).send("Erro ao carregar o perfil do usuário.");
  }
}

export async function mostrarFormularioEditarUsuario(req, reply, database) {
  const id_usuario = parseInt(req.params.id_usuario, 10);
  try {
    const usuario = await database.getUserById(id_usuario);
    if (!usuario) {
      return reply.status(404).view("user/edit_user.ejs", { error: "Usuário não encontrado.", usuario: null });
    }
    usuario.nome = decrypt(usuario.nome);
    usuario.email = decrypt(usuario.email);
    usuario.data_nascimento = decrypt(usuario.data_nascimento);

    if (usuario.data_nascimento) {
      usuario.data_nascimento = new Date(usuario.data_nascimento).toISOString().split("T")[0];
    }

    return reply.view("user/edit_user.ejs", { error: null, success: null, usuario });
  } catch (err) {
    req.log.error("Erro ao buscar usuário para edição:", err);
    return reply.status(500).view("user/edit_user.ejs", { error: "Erro ao buscar usuário.", usuario: null });
  }
}

export async function editarUsuario(req, reply, database) {
  const { id_usuario } = req.params;
  const { nome, email, senha, role, data_nascimento } = req.body;

  try {
    let updateData = {};
    if (nome) updateData.nome = encrypt(nome);
    if (email) updateData.email = encrypt(email);
    if (data_nascimento) updateData.data_nascimento = encrypt(data_nascimento);
    if (role) updateData.role = role;
    if (senha) updateData.senha = await bcrypt.hash(senha, 12);

    await database.updateUser(id_usuario, updateData);

    if (req.user && req.user.id_usuario === parseInt(id_usuario)) { 
      const updatedUser = await database.getUserById(id_usuario);
      const newToken = reply.server.jwt.sign(
        { id_usuario: updatedUser.id_usuario, email: decrypt(updatedUser.email), nome: decrypt(updatedUser.nome), role: updatedUser.role },
        { expiresIn: "6h" }
      );
      reply.setCookie("token", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 6,
      });
    }
    return reply.redirect("/perfil");
  } catch (err) {
    req.log.error("Erro ao editar usuário:", err);
    if (err.code === "23505") {
      return reply.view("user/edit_user.ejs", { error: "Esse e-mail já está em uso por outro usuário.", usuario: { id_usuario, nome, email, role, data_nascimento } });
    }
    return reply.view("user/edit_user.ejs", { error: "Erro ao editar usuário. Tente novamente mais tarde.", usuario: { id_usuario, nome, email, role, data_nascimento } });
  }
}

export async function excluirUsuario(req, reply, database) {
  const { id_usuario } = req.params;
  try {
    await database.deleteUser(id_usuario);
    if (req.user && req.user.id_usuario === parseInt(id_usuario)) {
      reply.clearCookie("token", { path: "/" });
      return reply.redirect("/");
    }
    return reply.redirect("/users");
  } catch (err) {
    req.log.error("Erro ao excluir usuário:", err);
    return reply.status(500).send("Erro ao excluir usuário.");
  }
}

export async function reativarUsuario(req, reply, database) {
  const { id_usuario } = req.params;
  try {
    await database.reactivateUser(id_usuario);
    return reply.redirect("/users?status=inativos");
  } catch (err) {
    req.log.error("Erro ao reativar usuário:", err);
    return reply.status(500).send("Erro ao reativar usuário.");
  }
}

export async function uploadAvatar(req, reply, database) {
  const { id_usuario } = req.params;
  
  try {
    const file = await req.file({ fieldName: "avatar" });
    if (!file) {
      return reply.status(400).view("user/perfil.ejs", { user: req.user, error: "Nenhuma imagem enviada.", success: null });
    }

    const ext = path.extname(file.filename).toLowerCase();
    const allowedExtensions = [".png", ".jpg", ".jpeg", ".gif"];
    if (!allowedExtensions.includes(ext)) {
      return reply.status(400).view("user/perfil.ejs", { user: req.user, error: "Formato de arquivo inválido. Apenas PNG, JPG, JPEG e GIF são permitidos.", success: null });
    }

    const fileName = crypto.randomBytes(16).toString("hex") + ext;
    const uploadDir = path.join(process.cwd(), "app", "static", "uploads");
    const uploadPath = path.join(uploadDir, fileName);

    await fs.mkdir(uploadDir, { recursive: true });
    const buffer = await file.toBuffer();
    await fs.writeFile(uploadPath, buffer);

    const user = await database.getUserById(id_usuario);
    if (user && user.avatar_url && user.avatar_url !== "default-avatar.png") {
      const oldAvatarPath = path.join(uploadDir, user.avatar_url);
      try {
        await fs.unlink(oldAvatarPath);
      } catch (unlinkErr) {
        req.log.warn(`Não foi possível remover o avatar antigo ${user.avatar_url}: ${unlinkErr.message}`);
      }
    }

    await database.updateUser(id_usuario, { avatar_url: fileName });

    if (req.user && req.user.id_usuario === parseInt(id_usuario)) {
      const updatedUser = await database.getUserById(id_usuario);
      const newToken = reply.server.jwt.sign(
        { id_usuario: updatedUser.id_usuario, email: decrypt(updatedUser.email), nome: decrypt(updatedUser.nome), role: updatedUser.role },
        { expiresIn: "6h" }
      );
      reply.setCookie("token", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 6,
      });
    }

    return reply.redirect("/perfil");
  } catch (err) {
    req.log.error("Erro ao fazer upload do avatar:", err);
    return reply.status(500).view("user/perfil.ejs", { user: req.user, error: "Erro ao fazer upload do avatar. Tente novamente mais tarde.", success: null });
  }
}

export async function listarUsuarios(req, reply, database) {
  const search = req.query.search || "";
  const status = req.query.status || "ativos";

  try {
    const users = (await database.listarUsers(search, status)).map(u => ({
      ...u,
      nome: decrypt(u.nome),
      email: decrypt(u.email),
      data_nascimento: decrypt(u.data_nascimento),
    }));

    return reply.view("user/list_users.ejs", { search, status, users, user: req.user });
  } catch (err) {
    req.log.error("Erro ao listar usuários:", err);
    return reply.status(500).send("Erro ao carregar a lista de usuários.");
  }
}
