import { createTransport } from "nodemailer";
import "./env.ts";

const host = process.env.BREVO_SMTP_HOST ?? "smtp-relay.brevo.com";
const port = Number(process.env.BREVO_SMTP_PORT ?? 587);
const user = process.env.BREVO_SMTP_USER ?? "";
const key = process.env.BREVO_SMTP_KEY ?? "";
const from = process.env.EMAIL_FROM_ADDRESS || user || "baithak@localhost";

export function mailConfigured() {
  return Boolean(user && key);
}

export function publicUrl() {
  return (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function send(to: string, subject: string, html: string) {
  if (!mailConfigured()) {
    console.log(`[mail:dev] to=${to} subject=${subject}`);
    return true;
  }
  const transport = createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: key },
  });
  await transport.sendMail({ from, to, subject, html });
  return true;
}

export async function sendAccessApproved(email: string, name: string) {
  const signup = `${publicUrl()}/signup?email=${encodeURIComponent(email)}`;
  const who = escapeHtml(name || email.split("@")[0]);
  const safeEmail = escapeHtml(email);
  const html = `
    <div style="font-family:Georgia,serif;background:#071014;color:#f4e8c8;padding:32px;">
      <p style="letter-spacing:.2em;text-transform:uppercase;color:#c9a227;font-size:12px;">Baithak</p>
      <h1 style="font-size:28px;margin:8px 0 16px;">You're in.</h1>
      <p>Hi ${who}, your request to sit at Baithak has been approved.</p>
      <p>Use this email (<strong>${safeEmail}</strong>) to finish signing up. We'll send a six-digit code next.</p>
      <p style="margin:28px 0;">
        <a href="${signup}" style="background:#c9a227;color:#071014;padding:12px 22px;text-decoration:none;font-weight:700;">Take a seat</a>
      </p>
      <p style="font-size:13px;color:#8ba3a0;">Or paste: ${escapeHtml(signup)}</p>
    </div>`;
  await send(email, "Your Baithak access request has been approved", html);
}

export async function sendSignupOtp(email: string, otp: string) {
  const html = `
    <div style="font-family:Georgia,serif;background:#071014;color:#f4e8c8;padding:32px;">
      <p style="letter-spacing:.2em;text-transform:uppercase;color:#c9a227;font-size:12px;">Baithak</p>
      <h1 style="font-size:28px;margin:8px 0 16px;">Verify your email</h1>
      <p>Your code expires in <strong>10 minutes</strong>. Tap and hold (or double-click) to copy it.</p>
      <p style="margin:24px 0;text-align:center;">
        <span style="display:inline-block;border:2px solid #c9a227;padding:16px 28px;font-family:'Courier New',monospace;font-size:30px;letter-spacing:10px;font-weight:700;user-select:all;-webkit-user-select:all;">${otp}</span>
      </p>
      <p style="font-size:13px;color:#8ba3a0;">Requested for ${escapeHtml(email)}. If this wasn't you, ignore this note.</p>
    </div>`;
  await send(email, "Verify your email — Baithak", html);
}

export async function sendPasswordResetOtp(email: string, otp: string) {
  const html = `
    <div style="font-family:Georgia,serif;background:#071014;color:#f4e8c8;padding:32px;">
      <p style="letter-spacing:.2em;text-transform:uppercase;color:#c9a227;font-size:12px;">Baithak</p>
      <h1 style="font-size:28px;margin:8px 0 16px;">Reset your password</h1>
      <p>Your code expires in <strong>10 minutes</strong>. Tap and hold (or double-click) to copy it.</p>
      <p style="margin:24px 0;text-align:center;">
        <span style="display:inline-block;border:2px solid #c9a227;padding:16px 28px;font-family:'Courier New',monospace;font-size:30px;letter-spacing:10px;font-weight:700;user-select:all;-webkit-user-select:all;">${otp}</span>
      </p>
      <p style="font-size:13px;color:#8ba3a0;">Requested for ${escapeHtml(email)}. If this wasn't you, ignore this note — your password stays as it is.</p>
    </div>`;
  await send(email, "Reset your password — Baithak", html);
}
