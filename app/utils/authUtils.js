import crypto from "crypto";
import nodemailer from "nodemailer";
import "dotenv/config"


const createOpaqueToken = () => {
    return crypto.randomBytes(48).toString('hex');
};

export const generateEmailToken = (email) => {
  if (!process.env.EMAIL_SECRET) {
    console.error("ERRO: EMAIL_SECRET não definido na geração do token de e-mail.");
    throw new Error("EMAIL_SECRET não definido");
  }
  console.log(`[DEBUG] Gerando token de e-mail para: ${email}`);
  return crypto.createHmac("sha256", process.env.EMAIL_SECRET).update(email).digest("hex");
};

export const generatePasswordResetToken = () => {
  console.log(`[DEBUG] Gerando Token Opaco para redefinição de senha.`);
  return createOpaqueToken();
};

console.log(`[DEBUG] Configurando Nodemailer. Host: smtp.gmail.com. User: ${process.env.EMAIL_USER ? 'Definido' : 'NÃO DEFINIDO'}`);

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
    minVersion: "TLSv1.2",
  },
});

export const sendVerificationEmail = async (toEmail, nome, verificationLink) => {
  console.log(`[DEBUG] Tentando enviar e-mail de VERIFICAÇÃO para: ${toEmail}`);
  console.log(`[DEBUG] Link de verificação: ${verificationLink}`);

  try {
    const info = await transporter.sendMail({
      from: `"Suporte TCC" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: "Verifique seu e-mail - Dedicandos",
      html: `
        <p>Olá ${nome},</p>
        <p>Clique no link abaixo para confirmar seu cadastro:</p>
        <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verificar E-mail</a>
        <p>Se você não se cadastrou, ignore este e-mail.</p>
      `,
    });
    console.log("[DEBUG] E-mail de VERIFICAÇÃO enviado com sucesso!");
    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("[ERRO] Falha ao enviar e-mail de VERIFICAÇÃO:", error.message);
    if (error.code === 'EAUTH') {
        console.error("POSSÍVEL CAUSA: Falha na autenticação (EAUTH). Verifique EMAIL_USER e EMAIL_PASS (App Passwords do Gmail).");
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        console.error("POSSÍVEL CAUSA: Problema de conexão (Timeout ou Recusa). Verifique firewall ou configurações de rede/porta.");
    }
    throw new Error(`Falha ao enviar e-mail de verificação: ${error.message}`); 
  }
};

export const sendPasswordResetEmail = async (toEmail, resetLink) => {
  console.log(`[DEBUG] Tentando enviar e-mail de REDEFINIÇÃO DE SENHA para: ${toEmail}`);
  console.log(`[DEBUG] Link de redefinição: ${resetLink}`);

  try {
    const info = await transporter.sendMail({
      from: `"Suporte TCC" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: "Redefinição de Senha - Dedicandos",
      html: `
        <p>Olá,</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no link abaixo:</p>
        <a href="${resetLink}" style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Redefinir Senha</a>
        <p>Este link é válido por 1 hora. Se você não solicitou, ignore este e-mail.</p>
      `,
    });
    console.log("[DEBUG] E-mail de REDEFINIÇÃO enviado com sucesso!");
    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("[ERRO] Falha ao enviar e-mail de REDEFINIÇÃO:", error.message);
    if (error.code === 'EAUTH') {
        console.error("POSSÍVEL CAUSA: Falha na autenticação (EAUTH). Verifique EMAIL_USER e EMAIL_PASS (App Passwords do Gmail).");
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        console.error("POSSÍVEL CAUSA: Problema de conexão (Timeout ou Recusa). Verifique firewall ou configurações de rede/porta.");
    }
    throw new Error(`Falha ao enviar e-mail de redefinição: ${error.message}`);
  }
};
