import crypto from "crypto";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";

// Função para gerar token de verificação de e-mail
export function generateEmailToken(email) {
  if (!process.env.EMAIL_SECRET) throw new Error("EMAIL_SECRET não definido");
  return crypto.createHmac("sha256", process.env.EMAIL_SECRET)
               .update(email)
               .digest("hex");
}

// Função para gerar token de redefinição de senha
export function generatePasswordResetToken(email) {
  if (!process.env.EMAIL_SECRET) throw new Error("EMAIL_SECRET não definido");

  const expires = Date.now() + 60 * 60 * 1000; // 1 hora
  const data = `${email}.${expires}`;
  const signature = crypto
    .createHmac("sha256", process.env.EMAIL_SECRET)
    .update(data)
    .digest("hex");

  return `${data}.${signature}`;
}

// Função para validar token de redefinição de senha
export function validatePasswordResetToken(token) {
  if (!process.env.EMAIL_SECRET) throw new Error("EMAIL_SECRET não definido");

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [email, expires, signature] = parts;

  if (Date.now() > parseInt(expires, 10)) return null;

  const data = `${email}.${expires}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.EMAIL_SECRET)
    .update(data)
    .digest("hex");

  if (signature !== expectedSignature) return null;

  return email;
}

// Transporter seguro e compatível com Gmail (ou outro SMTP)
export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_sUSER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
    minVersion: "TLSv1.2",
  },
  connectionTimeout: 15000,
  greetingTimeout: 5000,
  socketTimeout: 15000,
  // Logs só em ambiente de desenvolvimento
  logger: process.env.NODE_ENV === "development",
  debug: process.env.NODE_ENV === "development",
});

// Função helper para enviar e-mail de verificação
export async function sendVerificationEmail(toEmail, nome, verificationLink) {
  try {
    await transporter.sendMail({
      from: `"Suporte TCC" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: "Verifique seu e-mail - Dedicandos",
      html: `
        <p>Olá ${nome},</p>
        <p>Clique no link abaixo para confirmar seu cadastro:</p>
        <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verificar E-mail</a>
        <p>Se você não se cadastrou, ignore este e-mail.</p>
        <p>Atenciosamente,<br>Equipe Dedicandos</p>
      `,
    });
    console.log(`✅ E-mail de verificação enviado para: ${toEmail}`);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("❌ Erro detalhado ao enviar e-mail de verificação:", err);
    }
    throw new Error(`Falha ao enviar e-mail de verificação: ${err.message}. Verifique suas credenciais SMTP e configurações TLS.`);
  }
}

// Função helper para enviar e-mail de redefinição de senha
export async function sendPasswordResetEmail(toEmail, resetLink) {
  try {
    await transporter.sendMail({
      from: `"Suporte TCC" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: "Redefinição de Senha - Dedicandos",
      html: `
        <p>Olá,</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no link abaixo para criar uma nova senha:</p>
        <a href="${resetLink}" style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Redefinir Senha</a>
        <p>Este link é válido por 1 hora. Se você não solicitou isso, ignore este e-mail.</p>
        <p>Atenciosamente,<br>Equipe Dedicandos</p>
      `,
    });
    console.log(`✅ E-mail de redefinição enviado para: ${toEmail}`);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("❌ Erro detalhado ao enviar e-mail de redefinição:", err);
    }
    throw new Error(`Falha ao enviar e-mail de redefinição: ${err.message}. Verifique suas credenciais SMTP e configurações TLS.`);
  }
}
