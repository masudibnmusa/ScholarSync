import "server-only";

type Mail = { to: string; subject: string; text: string; html: string };

const mailpit = process.env.MAILPIT_URL ?? (process.env.NODE_ENV === "development" ? "http://127.0.0.1:54324" : undefined);

/** Sends through Resend when RESEND_API_KEY is set, else to the local Mailpit inbox in development. Returns false if not sent. */
export async function sendEmail(m: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "ScholarSync <noreply@scholarsync.local>";
  let res: Response;
  if (key) {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    });
  } else if (mailpit) {
    res = await fetch(`${mailpit}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ From: { Email: "noreply@scholarsync.local", Name: "ScholarSync" }, To: [{ Email: m.to }], Subject: m.subject, Text: m.text, HTML: m.html }),
    });
  } else {
    console.warn("[email] no RESEND_API_KEY or MAILPIT_URL; skipped:", m.subject);
    return false;
  }
  if (!res.ok) console.error("[email] send failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}
