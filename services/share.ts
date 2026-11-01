import { getRecipeShareToken } from "./api";

const W = 1080;
const H = 1350;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

/** Immagine verticale (formato Instagram) con foto del piatto, titolo e prodotti salvati. */
export async function buildShareImage(opts: {
  title: string;
  imageUrl: string | null;
  used: number;
  rating: number | null;
  challenge: boolean;
}): Promise<File | null> {
  try {
    await (document as any).fonts?.ready;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#163828";
    ctx.fillRect(0, 0, W, H);

    // foto del piatto
    const photo = { x: 60, y: 60, w: W - 120, h: 760 };
    ctx.save();
    roundRect(ctx, photo.x, photo.y, photo.w, photo.h, 48);
    ctx.clip();
    let drawn = false;
    if (opts.imageUrl) {
      try {
        const img = await loadImage(opts.imageUrl);
        const scale = Math.max(photo.w / img.naturalWidth, photo.h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, photo.x + (photo.w - dw) / 2, photo.y + (photo.h - dh) / 2, dw, dh);
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) {
      ctx.fillStyle = "#FFD84A";
      ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
      ctx.fillStyle = "rgba(23,32,26,0.18)";
      ctx.font = "800 420px 'Bricolage Grotesque', sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillText((opts.title.trim()[0] ?? "?").toUpperCase(), photo.x + 50, photo.y + photo.h - 60);
    }
    ctx.restore();

    // etichetta
    const label = opts.challenge ? "TI SFIDO!" : "FATTO IN CASA · ZERO SPRECHI";
    ctx.font = "800 30px 'Plus Jakarta Sans', sans-serif";
    const lw = ctx.measureText(label).width + 56;
    ctx.fillStyle = opts.challenge ? "#FF8A3D" : "#FFD84A";
    roundRect(ctx, 60, 860, lw, 60, 30);
    ctx.fill();
    ctx.fillStyle = "#17201A";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 88, 891);

    // titolo
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "alphabetic";
    ctx.font = "800 70px 'Bricolage Grotesque', sans-serif";
    const lines = wrap(ctx, opts.title, W - 120, 2);
    lines.forEach((l, i) => ctx.fillText(l, 60, 1010 + i * 80));

    // dettaglio
    let y = 1010 + lines.length * 80 + 10;
    ctx.font = "600 36px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = "#BFE3CB";
    if (opts.used > 0) {
      ctx.fillText(
        opts.used === 1 ? "Con 1 prodotto che avevo già in casa" : `Con ${opts.used} prodotti che avevo già in casa`,
        60,
        y
      );
      y += 56;
    }
    if (opts.rating) {
      ctx.fillStyle = "#FFD84A";
      ctx.font = "800 44px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("★".repeat(opts.rating) + "☆".repeat(5 - opts.rating), 60, y + 6);
    }

    // marchio
    ctx.fillStyle = "#FFD84A";
    ctx.font = "800 40px 'Bricolage Grotesque', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("EcoDispensa", W - 60, H - 56);
    ctx.textAlign = "left";

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    return new File([blob], "ecodispensa.png", { type: "image/png" });
  } catch (e) {
    // es. foto su un server che non permette la lettura: si condivide senza immagine
    console.error("share image error:", e);
    return null;
  }
}

/**
 * Indirizzo pubblico dell'app per i link condivisi.
 * Le anteprime di Vercel sono protette da login: un link creato da lì non funzionerebbe
 * per chi lo riceve, quindi si usa sempre l'indirizzo di produzione.
 */
export function publicAppUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = window.location.hostname;
  const isVercelInternal = host.endsWith(".vercel.app") && host !== "ecodispensa.vercel.app";
  if (isVercelInternal || host === "localhost" || host === "127.0.0.1") return "https://ecodispensa.vercel.app";
  return window.location.origin;
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "error";

/** Condivide la ricetta (o lancia la sfida) con il menu di condivisione del telefono. */
export async function shareRecipe(opts: {
  recipeId: string;
  title: string;
  imageUrl: string | null;
  used: number;
  rating: number | null;
  challenge: boolean;
}): Promise<ShareOutcome> {
  const token = await getRecipeShareToken(opts.recipeId);
  if (!token) return "error";

  const url = `${publicAppUrl()}/?ricetta=${token}${opts.challenge ? "&sfida=1" : ""}`;
  const casa = opts.used > 0 ? ` con ${opts.used === 1 ? "un prodotto" : `${opts.used} prodotti`} che avevo già in casa` : "";
  const text = opts.challenge
    ? `Ti sfido a rifare "${opts.title}"! Io l'ho cucinata${casa}. Accetti?`
    : `Ho cucinato "${opts.title}"${casa}, zero sprechi.`;

  const file = await buildShareImage(opts);

  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: opts.title, text: `${text}\n${url}` });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title: opts.title, text, url });
      return "shared";
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return "cancelled";
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "error";
  }
}
