/**
 * Instagram-story-sized (1080×1920) share images, drawn on a canvas in the browser.
 * Nothing is uploaded: the image is built locally and handed to the native share sheet
 * (or downloaded on desktop).
 */
const W = 1080;
const H = 1920;

const BG = "#14090f";
const ROSE = "#f0a3b5";
const TEXT = "#f7ece8";
const MUTED = "#b39ca8";

function fontFamily(name: "--font-display" | "--font-geist-sans" | "--font-geist-mono", fallback: string) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
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

async function canvasBase() {
  const serif = fontFamily("--font-display", "Georgia, serif");
  const sans = fontFamily("--font-geist-sans", "system-ui, sans-serif");
  const mono = fontFamily("--font-geist-mono", "ui-monospace, monospace");
  try {
    await Promise.all([document.fonts.load(`80px ${serif}`), document.fonts.load(`40px ${sans}`)]);
  } catch {
    /* fall back to defaults */
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const spot = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 1100);
  spot.addColorStop(0, "rgba(176,52,88,0.38)");
  spot.addColorStop(1, "rgba(176,52,88,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);

  // wordmark
  ctx.textAlign = "center";
  ctx.fillStyle = TEXT;
  ctx.font = `64px ${serif}`;
  ctx.fillText("Afterhours", W / 2 - 14, 150);
  ctx.fillStyle = ROSE;
  ctx.fillText(".", W / 2 + ctx.measureText("Afterhours").width / 2 - 8, 150);
  return { canvas, ctx, serif, sans, mono };
}

function footer(ctx: CanvasRenderingContext2D, mono: string, line: string) {
  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `30px ${mono}`;
  ctx.fillText(line, W / 2, H - 120);
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render_failed"))), "image/png"));

/** NGL-style reply card: the prompt on top, the anonymous message in a card. */
export async function renderMessageCard(prompt: string, message: string, link: string): Promise<Blob> {
  const { canvas, ctx, serif, sans, mono } = await canvasBase();
  const cardX = 90;
  const cardW = W - 180;

  ctx.font = `64px ${serif}`;
  const msgLines = wrap(ctx, message, cardW - 120).slice(0, 9);
  const bodyH = msgLines.length * 84 + 150;
  const headH = 170;
  const cardH = headH + bodyH;
  const cardY = (H - cardH) / 2 - 40;

  // header (prompt) in rose
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.clip();
  ctx.fillStyle = "#241119";
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.fillStyle = ROSE;
  ctx.fillRect(cardX, cardY, cardW, headH);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#2a0f1b";
  ctx.font = `600 40px ${sans}`;
  const promptLines = wrap(ctx, prompt, cardW - 100).slice(0, 2);
  promptLines.forEach((l, i) => ctx.fillText(l, W / 2, cardY + 82 - (promptLines.length - 1) * 24 + i * 52));

  // message
  ctx.fillStyle = TEXT;
  ctx.font = `64px ${serif}`;
  ctx.textAlign = "left";
  msgLines.forEach((l, i) => ctx.fillText(l, cardX + 60, cardY + headH + 110 + i * 84));

  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `28px ${mono}`;
  ctx.fillText("ANONYMOUS MESSAGE", W / 2, cardY + cardH + 90);

  footer(ctx, mono, `Send me one → ${link}`);
  return toBlob(canvas);
}

/** Persona card for the quiz result. */
export async function renderPersonaCard(p: {
  title: string;
  alias: string;
  tagline: string;
  compliment: string;
  link: string;
}): Promise<Blob> {
  const { canvas, ctx, serif, sans, mono } = await canvasBase();
  ctx.textAlign = "center";

  ctx.fillStyle = MUTED;
  ctx.font = `30px ${mono}`;
  ctx.fillText("MY AFTER-DARK PERSONA", W / 2, 470);

  ctx.fillStyle = TEXT;
  ctx.font = `148px ${serif}`;
  const titleLines = wrap(ctx, p.title, W - 200);
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, 640 + i * 150));
  let y = 640 + (titleLines.length - 1) * 150 + 130;

  ctx.fillStyle = ROSE;
  ctx.font = `italic 62px ${serif}`;
  const tagLines = wrap(ctx, p.tagline, W - 240);
  tagLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 76));
  y += tagLines.length * 76 + 70;

  // alias pill
  ctx.font = `64px ${serif}`;
  const aw = ctx.measureText(p.alias).width + 120;
  roundRect(ctx, (W - aw) / 2, y - 76, aw, 112, 56);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.fillText(p.alias, W / 2, y);
  y += 120;

  ctx.fillStyle = MUTED;
  ctx.font = `38px ${sans}`;
  const lines = wrap(ctx, p.compliment, W - 240).slice(0, 7);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 56));

  footer(ctx, mono, `Find yours → ${p.link}`);
  return toBlob(canvas);
}

/** Opens the native share sheet with the image (phones); downloads it elsewhere. */
export async function shareImage(blob: Blob, filename: string, text: string, url?: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, url });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "shared";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}

/** "Send me anonymous messages" / "Check your crush compatibility" story card with the link. */
export async function renderLinkCard(c: { eyebrow: string; title: string; sub: string; link: string }): Promise<Blob> {
  const { canvas, ctx, serif, sans, mono } = await canvasBase();
  ctx.textAlign = "center";

  ctx.fillStyle = ROSE;
  ctx.font = `32px ${mono}`;
  ctx.fillText(c.eyebrow.toUpperCase(), W / 2, 640);

  ctx.fillStyle = TEXT;
  ctx.font = `132px ${serif}`;
  const lines = wrap(ctx, c.title, W - 200).slice(0, 4);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 800 + i * 140));
  const y = 800 + (lines.length - 1) * 140 + 130;

  ctx.fillStyle = MUTED;
  ctx.font = `40px ${sans}`;
  wrap(ctx, c.sub, W - 260)
    .slice(0, 3)
    .forEach((l, i) => ctx.fillText(l, W / 2, y + i * 58));

  // link pill
  ctx.font = `40px ${mono}`;
  const label = c.link.replace(/^https?:\/\//, "");
  const pw = Math.min(W - 120, ctx.measureText(label).width + 120);
  const py = H - 420;
  roundRect(ctx, (W - pw) / 2, py, pw, 120, 60);
  ctx.fillStyle = ROSE;
  ctx.fill();
  ctx.fillStyle = "#2a0f1b";
  ctx.fillText(label, W / 2, py + 76);

  ctx.fillStyle = MUTED;
  ctx.font = `28px ${mono}`;
  ctx.fillText("TAP THE LINK IN MY STORY", W / 2, H - 120);
  return toBlob(canvas);
}
