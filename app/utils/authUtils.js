import crypto from "crypto";
import nodemailer from "nodemailer";

// ----------------------
// Funções de Token
// ----------------------

// Gera token de verificação de e-mail
export const generateEmailToken = (email) => {
  if (!process.env.EMAIL_SECRET) throw new Error("EMAIL_SECRET não definido");
  return crypto.createHmac("sha256", process.env.EMAIL_SECRET).update(email).digest("hex");
};

// Gera token de redefinição de senha (válido 1 hora)
export const generatePasswordResetToken = (email) => {
  if (!process.env.EMAIL_SECRET) throw new Error("EMAIL_SECRET não definido");

  const expires = Date.now() + 60 * 60 * 1000; // 1 hora
  const data = `${email}.${expires}`;
  const signature = crypto.createHmac("sha256", process.env.EMAIL_SECRET).update(data).digest("hex");

  return `${data}.${signature}`;
};

// Valida token de redefinição de senha
export const validatePasswordResetToken = (token) => {
  if (!process.env.EMAIL_SECRET) throw new Error("EMAIL_SECRET não definido");

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [email, expires, signature] = parts;
  if (Date.now() > parseInt(expires, 10)) return null;

  const expected = crypto.createHmac("sha256", process.env.EMAIL_SECRET).update(`${email}.${expires}`).digest("hex");
  return signature === expected ? email : null;
};

// ----------------------
// Configuração do Nodemailer
// ----------------------

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true para 465, false para 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
    minVersion: "TLSv1.2",
  },
});

// ----------------------
// Funções de Envio de E-mail
// ----------------------

// E-mail de verificação
export const sendVerificationEmail = async (toEmail, nome, verificationLink) => {
  await transporter.sendMail({
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
};

// E-mail de redefinição de senha
export const sendPasswordResetEmail = async (toEmail, resetLink) => {
  await transporter.sendMail({
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
};
