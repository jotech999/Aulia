/**
 * PDF imprimible de guías y evaluaciones generadas con IA.
 * Módulo server-only (usa pdf-lib). Formato A4 sobrio para fotocopiar:
 * encabezado con colegio y asignatura, datos del estudiante, ítems numerados
 * y — opcionalmente — pauta de corrección en página aparte (uso docente).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { MaterialGenerado } from "@/lib/ia/material";

const A4: [number, number] = [595.28, 841.89];
const MARGEN = 56;
const NEGRO = rgb(0.09, 0.11, 0.15);
const GRIS = rgb(0.4, 0.45, 0.5);
const LINEA = rgb(0.78, 0.81, 0.85);
const AZUL = rgb(0.15, 0.39, 0.92);

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  ancho: number;
};

// Helvetica (StandardFonts) solo codifica WinAnsi: aproximamos los símbolos
// comunes que la IA pudiera emitir y filtramos el resto para no romper drawText.
const REEMPLAZOS: [RegExp, string][] = [
  [/→/g, "->"],
  [/←/g, "<-"],
  [/−/g, "-"],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/≠/g, "!="],
  [/√/g, "raiz "],
  [/π/g, "pi"],
  [/…/g, "..."],
  [/[•∙]/g, "-"],
];

function sanear(s: string): string {
  let t = s;
  for (const [re, rep] of REEMPLAZOS) t = t.replace(re, rep);
  // Permite ASCII imprimible, Latin-1 y la puntuación tipográfica de WinAnsi.
  return t.replace(/[^\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u20ac]/g, "?");
}

/** Divide `s` en líneas que caben en `ancho` puntos con la fuente dada. */
function envolver(font: PDFFont, s: string, size: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of sanear(s).split(/\n+/)) {
    let linea = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const cand = linea ? `${linea} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(cand, size) > ancho && linea) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = cand;
      }
    }
    if (linea) lineas.push(linea);
  }
  return lineas;
}

/** Garantiza `alto` puntos disponibles; si no alcanzan, abre una página nueva. */
function asegurar(ctx: Ctx, alto: number) {
  if (ctx.y - alto < MARGEN) {
    ctx.page = ctx.doc.addPage(A4);
    ctx.y = A4[1] - MARGEN;
  }
}

function texto(
  ctx: Ctx,
  s: string,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}
) {
  const size = opts.size ?? 11;
  ctx.page.drawText(sanear(s), {
    x: opts.x ?? MARGEN,
    y: ctx.y,
    size,
    font: opts.bold ? ctx.bold : ctx.font,
    color: opts.color ?? NEGRO,
  });
}

function parrafo(
  ctx: Ctx,
  s: string,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; interlinea?: number } = {}
) {
  const size = opts.size ?? 11;
  const x = opts.x ?? MARGEN;
  const interlinea = opts.interlinea ?? size + 5;
  const anchoUtil = ctx.ancho - (x - MARGEN);
  for (const linea of envolver(opts.bold ? ctx.bold : ctx.font, s, size, anchoUtil)) {
    asegurar(ctx, interlinea);
    texto(ctx, linea, { ...opts, x });
    ctx.y -= interlinea;
  }
}

function reglaHorizontal(ctx: Ctx, x1: number, x2: number, grosor = 0.7, color = LINEA) {
  ctx.page.drawLine({
    start: { x: x1, y: ctx.y },
    end: { x: x2, y: ctx.y },
    thickness: grosor,
    color,
  });
}

/** Líneas de respuesta para ítems de desarrollo. */
function lineasRespuesta(ctx: Ctx, cantidad: number) {
  for (let i = 0; i < cantidad; i++) {
    asegurar(ctx, 22);
    ctx.y -= 16;
    reglaHorizontal(ctx, MARGEN + 14, MARGEN + ctx.ancho);
    ctx.y -= 6;
  }
}

const LETRAS = ["a", "b", "c", "d", "e", "f"];

export async function generarPdfMaterial(
  material: MaterialGenerado,
  opciones: { colegio: string; incluirPauta: boolean }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = {
    doc,
    page: doc.addPage(A4),
    font,
    bold,
    y: A4[1] - MARGEN,
    ancho: A4[0] - MARGEN * 2,
  };

  const esEval = material.tipoMaterial === "evaluacion";
  const puntajeTotal = material.items.reduce((s, i) => s + i.puntaje, 0);

  // ── Encabezado ──────────────────────────────────────────────────────────────
  texto(ctx, opciones.colegio || "Colegio", { size: 10, color: GRIS });
  const rotulo = esEval ? "EVALUACIÓN" : "GUÍA DE EJERCICIOS";
  const anchoRotulo = bold.widthOfTextAtSize(rotulo, 10);
  texto(ctx, rotulo, { size: 10, bold: true, color: AZUL, x: MARGEN + ctx.ancho - anchoRotulo });
  ctx.y -= 20;

  parrafo(ctx, material.titulo, { size: 16, bold: true, interlinea: 21 });
  ctx.y -= 2;
  texto(ctx, `${material.asignatura} · ${material.nivel}`, { size: 10.5, color: GRIS });
  ctx.y -= 14;
  if (material.oaCodigos.length) {
    texto(ctx, `OA de referencia: ${material.oaCodigos.join(", ")}`, { size: 9, color: GRIS });
    ctx.y -= 12;
  }
  ctx.y -= 2;
  reglaHorizontal(ctx, MARGEN, MARGEN + ctx.ancho, 1);
  ctx.y -= 22;

  // ── Datos del estudiante ────────────────────────────────────────────────────
  texto(ctx, "Nombre:", { size: 10.5 });
  reglaHorizontal(ctx, MARGEN + 46, MARGEN + 300, 0.7, rgb(0.55, 0.58, 0.62));
  texto(ctx, "Curso:", { size: 10.5, x: MARGEN + 316 });
  reglaHorizontal(ctx, MARGEN + 352, MARGEN + 420, 0.7, rgb(0.55, 0.58, 0.62));
  texto(ctx, "Fecha:", { size: 10.5, x: MARGEN + 436 });
  reglaHorizontal(ctx, MARGEN + 471, MARGEN + ctx.ancho, 0.7, rgb(0.55, 0.58, 0.62));
  ctx.y -= 20;
  if (esEval) {
    texto(ctx, `Puntaje total: ${puntajeTotal} pts`, { size: 10.5 });
    texto(ctx, "Puntaje obtenido: ______", { size: 10.5, x: MARGEN + 150 });
    texto(ctx, "Nota: ______", { size: 10.5, x: MARGEN + 300 });
    ctx.y -= 20;
  }

  // ── Instrucciones ───────────────────────────────────────────────────────────
  parrafo(ctx, `Instrucciones: ${material.instrucciones}`, { size: 10, color: GRIS, interlinea: 14 });
  ctx.y -= 12;

  // ── Ítems ───────────────────────────────────────────────────────────────────
  material.items.forEach((item, idx) => {
    asegurar(ctx, 60);
    const rotuloPts = esEval || item.puntaje > 1 ? ` (${item.puntaje} ${item.puntaje === 1 ? "pt" : "pts"})` : "";
    parrafo(ctx, `${idx + 1}. ${item.enunciado}${rotuloPts}`, { size: 11, bold: true, interlinea: 15 });
    ctx.y -= 2;

    if (item.tipo === "seleccion" && item.alternativas) {
      item.alternativas.forEach((alt, j) => {
        parrafo(ctx, `${LETRAS[j] ?? "•"}) ${alt}`, { size: 10.5, x: MARGEN + 16, interlinea: 14.5 });
      });
    } else if (item.tipo === "verdadero_falso") {
      asegurar(ctx, 18);
      texto(ctx, "V ____      F ____      Justifica si es falso:", { size: 10.5, x: MARGEN + 16 });
      ctx.y -= 6;
      lineasRespuesta(ctx, 1);
    } else {
      // Desarrollo: más líneas si el ítem vale más puntos.
      lineasRespuesta(ctx, item.puntaje >= 4 ? 5 : 3);
    }
    ctx.y -= 12;
  });

  // ── Pauta de corrección (página aparte, uso docente) ────────────────────────
  if (opciones.incluirPauta) {
    ctx.page = doc.addPage(A4);
    ctx.y = A4[1] - MARGEN;
    texto(ctx, "PAUTA DE CORRECCIÓN — USO EXCLUSIVO DOCENTE", { size: 12, bold: true, color: AZUL });
    ctx.y -= 16;
    texto(ctx, `${material.titulo} · ${material.asignatura} · ${material.nivel}`, { size: 9.5, color: GRIS });
    ctx.y -= 10;
    reglaHorizontal(ctx, MARGEN, MARGEN + ctx.ancho, 1);
    ctx.y -= 20;

    material.items.forEach((item, idx) => {
      asegurar(ctx, 40);
      let resp = item.respuesta || "[completar]";
      if (item.tipo === "seleccion" && item.alternativas) {
        const j = item.alternativas.findIndex(
          (a) => a.trim().toLowerCase() === item.respuesta.trim().toLowerCase()
        );
        if (j >= 0) resp = `${LETRAS[j]}) ${item.alternativas[j]}`;
      }
      parrafo(ctx, `${idx + 1}. (${item.puntaje} pts) ${resp}`, { size: 10.5, interlinea: 14.5 });
      ctx.y -= 6;
    });

    ctx.y = Math.max(ctx.y, MARGEN);
    texto(ctx, "Generado con el Asistente IA de Aulia. Revisar antes de aplicar.", {
      size: 8.5,
      color: GRIS,
    });
  }

  return doc.save();
}
