import type { VercelRequest, VercelResponse } from "@vercel/node";
import { serviceClient } from "./_lib/openai.js";

/**
 * Dopo l'invio del modulo «Diventa partner» il sito chiama questa funzione con l'id della richiesta:
 * manda un'email di avviso a info@ecodispensa.it, una sola volta per richiesta.
 * Chi chiama non sceglie né il testo né il destinatario: si legge tutto dal database.
 */

const TO = "info@ecodispensa.it";
const FROM = "EcoDispensa <notifiche@ecodispensa.it>";

const KIND: Record<string, string> = { comune: "Comune", azienda: "Azienda", scuola: "Scuola", altro: "Altro" };

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const id = String(req.body?.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "BAD_ID" });

  const apiKey = process.env.RESEND_API_KEY;
  const db = serviceClient();
  // senza chiave o senza database la richiesta è comunque salvata: si vede nella dashboard
  if (!apiKey || !db) return res.status(200).json({ ok: true, sent: false });

  // solo richieste appena arrivate e non ancora avvisate
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: r, error } = await db
    .from("partner_requests")
    .select("id, created_at, kind, organization, contact_name, role, email, phone, city, families, message, notified_at")
    .eq("id", id)
    .is("notified_at", null)
    .gte("created_at", since)
    .maybeSingle();
  if (error) {
    console.error("partner-notify read error:", error);
    return res.status(200).json({ ok: true, sent: false });
  }
  if (!r) return res.status(200).json({ ok: true, sent: false });

  // segna subito come avvisata, così due chiamate insieme non mandano due email
  const { data: claimed } = await db
    .from("partner_requests")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id)
    .is("notified_at", null)
    .select("id");
  if (!claimed?.length) return res.status(200).json({ ok: true, sent: false });

  const rows: Array<[string, unknown]> = [
    ["Tipo", KIND[r.kind] ?? r.kind],
    ["Ente o azienda", r.organization],
    ["Città", r.city],
    ["Referente", r.contact_name],
    ["Ruolo", r.role],
    ["Email", r.email],
    ["Telefono", r.phone],
    ["Famiglie o alunni", r.families],
  ];
  const table = rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5F6A5C;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#1F2A1E;font-weight:600">${esc(v)}</td></tr>`
    )
    .join("");
  const message = r.message
    ? `<p style="margin:16px 0 4px;color:#5F6A5C">Messaggio</p><p style="margin:0;padding:12px;background:#FAF5EA;border-radius:12px;white-space:pre-line;color:#1F2A1E">${esc(r.message)}</p>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;max-width:560px">
<p style="margin:0 0 4px;color:#6F8F66;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:12px">EcoDispensa · Diventa partner</p>
<h1 style="margin:0 0 16px;font-size:22px;color:#2F4A2C">Nuova richiesta da ${esc(r.organization)}</h1>
<table style="border-collapse:collapse">${table}</table>
${message}
<p style="margin:20px 0 0;color:#5F6A5C;font-size:13px">Rispondi a questa email per scrivere direttamente a ${esc(r.contact_name)}. La richiesta è anche nella dashboard admin, sezione Richieste.</p>
</div>`;

  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: r.email,
        subject: `Nuova richiesta partner: ${String(r.organization).slice(0, 80)} (${KIND[r.kind] ?? r.kind}, ${String(r.city).slice(0, 40)})`,
        html,
      }),
    });
    if (!sent.ok) {
      console.error("partner-notify resend error:", sent.status, await sent.text());
      // email non partita: si potrà riprovare
      await db.from("partner_requests").update({ notified_at: null }).eq("id", id);
      return res.status(200).json({ ok: true, sent: false });
    }
  } catch (e) {
    console.error("partner-notify send error:", e);
    await db.from("partner_requests").update({ notified_at: null }).eq("id", id);
    return res.status(200).json({ ok: true, sent: false });
  }

  return res.status(200).json({ ok: true, sent: true });
}
