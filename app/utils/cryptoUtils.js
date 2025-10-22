import crypto from "crypto";

const algorithm = "aes-256-cbc";
let key = process.env.ENCRYPTION_KEY || null;

if (key && key.length === 44 && key.includes('=')) {
  key = Buffer.from(key, 'base64');
} else if (key) {
  key = Buffer.from(key, 'utf8');
}

if (!key) {
  throw new Error("ENCRYPTION_KEY must be set in environment.");
}
if (key.length < 32) {
  key = crypto.createHash('sha256').update(key).digest();
}

function deriveIv(text) {
  const h = crypto.createHmac('sha256', key).update(text).digest();
  return h.slice(0, 16);
}

export function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key.slice(0,32), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decrypt(text) {
  if (!text) return null;
  const [ivHex, encryptedText] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key.slice(0,32), iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// FUNÇÃO NOVA: hash fixo para lookup (256-bit hex)
export function hashForLookup(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
}