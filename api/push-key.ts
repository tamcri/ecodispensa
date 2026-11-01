import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Chiave pubblica VAPID: serve al browser per iscriversi alle notifiche push. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ publicKey });
}
