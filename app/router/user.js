import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";

export async function criarUsuario(req, reply, database) {
  const { nome, email, senha, data_nascimento } = req.body;
  const role = "usuario";

  try {
    const bcrypt = (await import("bcrypt")).default;
    const hashedPassword = await bcrypt.hash(senha, 12);

    // gera token antes de criar o usuário
    const token = uuidv4();

    // cria usuário com email_verificado = false e token
    const user = await database.createUser({
      nome,
      email,
      senha: hashedPassword,
      role,
      data_nascimento,
      email_verificado: false,
      email_token: token,
    });

    // envia email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const verificationLink = `https://dedicandos.onrender.com/verificar-email?token=${token}`;

    await transporter.sendMail({
      from: `"Suporte TCC" <${process.env.EMAIL_USER}>`,
      to: email,
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
  const { token } = req.query;

  try {
    // busca usuário pelo token
    const usuario = await database.getUserByToken(token);

    if (!usuario) {
      return reply.view("user/login.ejs", { error: "Token inválido ou expirado." });
    }

    // marca e-mail como verificado
    await database.verifyUserEmail(usuario.id_usuario);

    return reply.view("user/login.ejs", { success: "E-mail verificado com sucesso! Agora você pode logar." });

  } catch (err) {
    console.error(err);
    return reply.view("user/login.ejs", { error: "Erro ao verificar e-mail." });
  }
}



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

export async function editarUsuario(req, reply, database) {
  const { id_usuario } = req.params;
  const { nome, email, senha, role } = req.body;

  try {
    let updateData = { nome, email, role };
    if (senha) {
      const bcrypt = (await import("bcrypt")).default;
      updateData.senha = await bcrypt.hash(senha, 12);
    }
    await database.updateUser (id_usuario, updateData);
    return reply.redirect('/');
  } catch (err) {
    console.error(err);
    return reply.view("user/edit_user.ejs", { error: "Erro ao editar usuário", usuario: { id_usuario, nome, email, role } });
  }
}

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