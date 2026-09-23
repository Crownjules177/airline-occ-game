/**
 * Channel adapters (principle 6). The engine never talks to a messaging platform directly.
 *
 * Phase 1: WhatsApp is reached through share links the participant or host taps (no API).
 * Phase 2: email via Resend when RESEND_API_KEY is set; otherwise messages are logged.
 */

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<{ delivered: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email not configured] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    return { delivered: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) {
    console.error(`Email to ${msg.to} failed: ${res.status} ${await res.text()}`);
    return { delivered: false };
  }
  return { delivered: true };
}
