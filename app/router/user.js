import nodemailer from "nodemailer";
import crypto from "crypto";
import bcrypt from "bcrypt";

function generateEmailToken(email) {
  if (!process.env.EMAIL_SECRET) throw new Error("EMAIL_SECRET não definido");
  return crypto.createHmac("sha256", process.env.EMAIL_SECRET)
               .update(email)
               .digest("hex");
}

export async function criarUsuario(req, reply, database) {
  const { nome, email, senha, data_nascimento } = req.body;
  const role = "usuario";

  try {
    const hashedPassword = await bcrypt.hash(senha, 12);

    const user = await database.createUser({
      nome,
      email,
      senha: hashedPassword,
      role,
      data_nascimento,
      email_verificado: false,
    });

    const token = generateEmailToken(user.email);
    const verificationLink = `https://dedicandos.onrender.com/verificar-email?email=${encodeURIComponent(user.email)}&token=${token}`;


    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Suporte TCC" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Verifique seu e-mail",
      html: `<p>Olá ${nome}, clique no link abaixo para confirmar seu cadastro:</p>
             <a href="${verificationLink}">${verificationLink}</a>`,
    });

    return reply.view("user/cadastro.ejs", { success: "Cadastro realizado! Verifique seu e-mail.", error: null });

  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return reply.view("user/cadastro.ejs", { error: "Esse e-mail já está em uso.", success: null });
    }
    return reply.view("user/cadastro.ejs", { error: "Erro ao criar usuário", success: null });
  }
}

export async function verificarEmail(req, reply, database) {
  const { email, token } = req.query;

  if (!email || !token) return reply.status(400).send("Parâmetros inválidos.");

  try {
    const user = await database.getUserByEmail(email);
    if (!user) return reply.view("user/login.ejs", { error: "Usuário não encontrado." });

    const validToken = generateEmailToken(user.email);
    if (token !== validToken) return reply.view("user/login.ejs", { error: "Token inválido ou expirado." });

    await database.verifyUserEmail(user.id_usuario);
    return reply.view("user/login.ejs", { success: "E-mail verificado com sucesso! Agora você pode logar." });

  } catch (err) {
    console.error(err);
    return reply.view("user/login.ejs", { error: "Erro ao verificar e-mail." });
  }
}


// Mostra formulário de cadastro
export async function mostrarFormularioCriarUsuario(req, reply) {
  return reply.view('user/cadastro.ejs', { error: null });
}

// Mostra formulário de edição
export async function mostrarFormularioEditarUsuario(req, reply, database) {
  const { id_usuario } = req.params;
  try {
    const usuario = await database.getUserById(id_usuario);
    if (!usuario) {
      return reply.view("user/edit_user.ejs", { error: "Usuário não encontrado", usuario: null });
    }
    return reply.view("user/edit_user.ejs", { error: null, usuario });
  } catch (err) {
    console.error(err);
    return reply.view("user/edit_user.ejs", { error: "Erro ao buscar usuário", usuario: null });
  }
}

// Edita usuário
export async function editarUsuario(req, reply, database) {
  const { id_usuario } = req.params;
  const { nome, email, senha, role } = req.body;

  try {
    let updateData = { nome, email, role };
    if (senha) updateData.senha = await bcrypt.hash(senha, 12);

    await database.updateUser(id_usuario, updateData);
    return reply.redirect('/');
  } catch (err) {
    console.error(err);
    return reply.view("user/edit_user.ejs", { error: "Erro ao editar usuário", usuario: { id_usuario, nome, email, role } });
  }
}

// Exclui usuário
export async function excluirUsuario(req, reply, database) {
  const { id_usuario } = req.params;
  try {
    await database.deleteUser(id_usuario);
    return reply.redirect('/');
  } catch (err) {
    console.error(err);
    return reply.view("user/perfil.ejs", { error: "Erro ao excluir usuário" });
  }
}
