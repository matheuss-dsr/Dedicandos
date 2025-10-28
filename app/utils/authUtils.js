import crypto from "crypto";
import nodemailer from "nodemailer";
import "dotenv/config"


const createOpaqueToken = () => {
    return crypto.randomBytes(48).toString('hex');
};

export const generateEmailToken = (email) => {
  if (!process.env.EMAIL_SECRET) {
    throw new Error("EMAIL_SECRET não definido");
  }
  return crypto.createHmac("sha256", process.env.EMAIL_SECRET).update(email).digest("hex");
};

export const generatePasswordResetToken = () => {
  return createOpaqueToken();
};


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
  } catch (error) {
    if (error.code === 'EAUTH') {
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
    }
    throw new Error(`Falha ao enviar e-mail de verificação: ${error.message}`); 
  }
};

export const sendPasswordResetEmail = async (toEmail, resetLink) => {

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
  } catch (error) {
    if (error.code === 'EAUTH') {
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
    }
    throw new Error(`Falha ao enviar e-mail de redefinição: ${error.message}`);
  }
};
