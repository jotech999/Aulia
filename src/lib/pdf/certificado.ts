/**
 * Generación del PDF de un certificado desde su snapshot inmutable.
 * Módulo server-only (usa pdf-lib). El PDF se dibuja SIEMPRE desde `datos`
 * (la foto guardada al emitir), nunca recalculando datos vivos.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  NOMBRE_TIPO,
  formatearFolio,
  type SnapshotCertificado,
  type TipoCertificado,
} from "@/lib/certificados";
import { formatearRut } from "@/lib/rut";

const A4: [number, number] = [595.28, 841.89];
const MARGEN = 56;
const NEGRO = rgb(0.09, 0.11, 0.15);
const GRIS = rgb(0.4, 0.45, 0.5);
const LINEA = rgb(0.8, 0.83, 0.86);

type Ctx = {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  ancho: number;
};

function texto(
  ctx: Ctx,
  s: string,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}
) {
  const size = opts.size ?? 11;
  const f = opts.bold ? ctx.bold : ctx.font;
  ctx.page.drawText(s, {
    x: opts.x ?? MARGEN,
    y: ctx.y,
    size,
    font: f,
    color: opts.color ?? NEGRO,
  });
}

/** Dibuja un párrafo con ajuste de línea y avanza el cursor `y`. */
function parrafo(ctx: Ctx, s: string, size = 11, lineHeight = 16) {
  const palabras = s.split(/\s+/);
  let linea = "";
  const flush = () => {
    if (linea) {
      texto(ctx, linea, { size });
      ctx.y -= lineHeight;
      linea = "";
    }
  };
  for (const p of palabras) {
    const cand = linea ? `${linea} ${p}` : p;
    if (ctx.font.widthOfTextAtSize(cand, size) > ctx.ancho) {
      flush();
      linea = p;
    } else {
      linea = cand;
    }
  }
  flush();
}

function encabezado(ctx: Ctx, snap: SnapshotCertificado, folio: number | null) {
  texto(ctx, snap.colegio.nombre, { size: 16, bold: true });
  ctx.y -= 18;
  const detalle = [
    snap.colegio.rbd ? `RBD ${snap.colegio.rbd}` : null,
    snap.colegio.direccion,
    snap.colegio.comuna,
  ]
    .filter(Boolean)
    .join(" · ");
  if (detalle) {
    texto(ctx, detalle, { size: 10, color: GRIS });
    ctx.y -= 14;
  }
  // Folio y fecha, alineados a la derecha. folio null = documento interno.
  const derechaX = ctx.page.getWidth() - MARGEN - 160;
  ctx.page.drawText(folio === null ? "Documento interno" : `Folio ${formatearFolio(folio)}`, {
    x: derechaX,
    y: ctx.page.getHeight() - MARGEN,
    size: 10,
    font: ctx.bold,
    color: folio === null ? GRIS : NEGRO,
  });
  ctx.page.drawText(`Emitido: ${snap.emitidoEnISO}`, {
    x: derechaX,
    y: ctx.page.getHeight() - MARGEN - 14,
    size: 10,
    font: ctx.font,
    color: GRIS,
  });

  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: MARGEN, y: ctx.y },
    end: { x: ctx.page.getWidth() - MARGEN, y: ctx.y },
    thickness: 1,
    color: LINEA,
  });
  ctx.y -= 28;
}

function pieVerificacion(
  ctx: Ctx,
  snap: SnapshotCertificado,
  verifyUrl: string,
  token: string
) {
  let y = MARGEN + 96;
  const firma = ctx.page;
  // Firma / emisor
  firma.drawLine({
    start: { x: MARGEN, y: y + 8 },
    end: { x: MARGEN + 200, y: y + 8 },
    thickness: 1,
    color: LINEA,
  });
  firma.drawText(snap.emisor.nombre, { x: MARGEN, y, size: 11, font: ctx.bold, color: NEGRO });
  firma.drawText(snap.emisor.cargo, { x: MARGEN, y: y - 14, size: 10, font: ctx.font, color: GRIS });
  firma.drawText(snap.colegio.nombre, { x: MARGEN, y: y - 28, size: 10, font: ctx.font, color: GRIS });

  // Bloque de verificación
  y = MARGEN + 44;
  firma.drawLine({
    start: { x: MARGEN, y },
    end: { x: firma.getWidth() - MARGEN, y },
    thickness: 1,
    color: LINEA,
  });
  y -= 16;
  firma.drawText("Verifica la autenticidad de este documento en:", {
    x: MARGEN,
    y,
    size: 9,
    font: ctx.font,
    color: GRIS,
  });
  y -= 13;
  firma.drawText(verifyUrl, { x: MARGEN, y, size: 9, font: ctx.bold, color: NEGRO });
  y -= 13;
  firma.drawText(`Código de verificación: ${token}`, {
    x: MARGEN,
    y,
    size: 9,
    font: ctx.font,
    color: GRIS,
  });
}

/** Dibuja una página de certificado/boletín en el documento dado. */
async function dibujarPagina(
  doc: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  params: {
    tipo: TipoCertificado;
    folio: number | null;
    snapshot: SnapshotCertificado;
    token?: string;
    verifyUrl?: string;
    anulado: boolean;
    interno?: boolean;
  }
): Promise<void> {
  const { tipo, folio, snapshot, token, verifyUrl, anulado, interno } = params;
  const page = doc.addPage(A4);
  const ctx: Ctx = {
    page,
    font,
    bold,
    y: page.getHeight() - MARGEN,
    ancho: page.getWidth() - MARGEN * 2,
  };

  encabezado(ctx, snapshot, folio);

  texto(ctx, NOMBRE_TIPO[tipo].toUpperCase(), { size: 14, bold: true });
  ctx.y -= 28;

  const est = snapshot.estudiante;
  const nombreCompleto = `${est.nombres} ${est.apellidos}`;

  if (tipo === "ALUMNO_REGULAR") {
    parrafo(
      ctx,
      `El establecimiento ${snapshot.colegio.nombre}${
        snapshot.colegio.rbd ? ` (RBD ${snapshot.colegio.rbd})` : ""
      } certifica que ${nombreCompleto}, RUT ${formatearRut(
        est.rut
      )}, se encuentra con matrícula vigente durante el año escolar ${snapshot.anio}${
        snapshot.curso ? `, cursando ${snapshot.curso}` : ""
      }.`
    );
    ctx.y -= 8;
    if (snapshot.vigenciaHastaISO) {
      parrafo(
        ctx,
        `Este certificado tiene una vigencia de 30 días y es válido hasta el ${snapshot.vigenciaHastaISO}.`,
        10
      );
    }
  } else {
    texto(ctx, `Estudiante: ${nombreCompleto}`, { size: 11, bold: true });
    ctx.y -= 15;
    texto(ctx, `RUT: ${formatearRut(est.rut)}`, { size: 10, color: GRIS });
    ctx.y -= 13;
    const meta = [
      snapshot.curso ? `Curso: ${snapshot.curso}` : null,
      `Año: ${snapshot.anio}`,
      snapshot.anual ? "Anual" : snapshot.periodo ? `Semestre ${snapshot.periodo}` : null,
    ]
      .filter(Boolean)
      .join("   ");
    texto(ctx, meta, { size: 10, color: GRIS });
    ctx.y -= 22;

    const derX = ctx.page.getWidth() - MARGEN;
    const rojo = rgb(0.8, 0.15, 0.15);
    const textoDer = (s: string, xRight: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
      const f = o.bold ? bold : font;
      const w = f.widthOfTextAtSize(s, o.size ?? 10);
      ctx.page.drawText(s, { x: xRight - w, y: ctx.y, size: o.size ?? 10, font: f, color: o.color ?? NEGRO });
    };
    const num = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
    const colorProm = (n: number | null | undefined) => (n != null && n < 4 ? rojo : NEGRO);

    // ── Boletín semestral / anual: tabla de promedios ──────────────────────
    if (snapshot.asistenciaPct !== undefined || snapshot.anual) {
      const anual = snapshot.anual === true;
      // Encabezado de tabla
      texto(ctx, "Asignatura", { size: 9, bold: true, color: GRIS });
      if (anual) {
        textoDer("1er Sem", derX - 150, { size: 9, bold: true, color: GRIS });
        textoDer("2do Sem", derX - 75, { size: 9, bold: true, color: GRIS });
        textoDer("Final", derX, { size: 9, bold: true, color: GRIS });
      } else {
        textoDer("Promedio", derX, { size: 9, bold: true, color: GRIS });
      }
      ctx.y -= 6;
      ctx.page.drawLine({ start: { x: MARGEN, y: ctx.y }, end: { x: derX, y: ctx.y }, thickness: 0.7, color: LINEA });
      ctx.y -= 15;
      for (const a of snapshot.asignaturas ?? []) {
        texto(ctx, a.asignatura, { size: 10 });
        if (anual) {
          textoDer(num(a.promedioS1), derX - 150, { size: 10, color: colorProm(a.promedioS1) });
          textoDer(num(a.promedioS2), derX - 75, { size: 10, color: colorProm(a.promedioS2) });
          textoDer(num(a.promedio), derX, { size: 10, bold: true, color: colorProm(a.promedio) });
        } else {
          textoDer(num(a.promedio), derX, { size: 10, bold: true, color: colorProm(a.promedio) });
        }
        ctx.y -= 16;
        if (ctx.y < MARGEN + 190) break;
      }
      ctx.page.drawLine({ start: { x: MARGEN, y: ctx.y + 4 }, end: { x: derX, y: ctx.y + 4 }, thickness: 0.7, color: LINEA });
      ctx.y -= 12;
      // Resumen: promedio general + asistencia
      texto(ctx, "Promedio general", { size: 11, bold: true });
      textoDer(num(snapshot.promedioGeneral), derX, { size: 11, bold: true, color: colorProm(snapshot.promedioGeneral) });
      ctx.y -= 16;
      if (snapshot.asistenciaPct != null) {
        texto(ctx, "Asistencia", { size: 11, bold: true });
        textoDer(`${snapshot.asistenciaPct.toFixed(1)}%`, derX, { size: 11, bold: true });
        ctx.y -= 16;
      }
      if (snapshot.concepto) {
        ctx.y -= 6;
        texto(ctx, "Observaciones del profesor(a) jefe:", { size: 10, bold: true });
        ctx.y -= 15;
        parrafo(ctx, snapshot.concepto, 10, 14);
      }
    } else {
      // Informe de notas parciales: detalle de evaluaciones por asignatura.
      for (const a of snapshot.asignaturas ?? []) {
        texto(ctx, a.asignatura, { size: 11, bold: true });
        textoDer(`Promedio: ${num(a.promedio)}`, derX, { size: 11, bold: true, color: colorProm(a.promedio) });
        ctx.y -= 15;
        const detalle =
          a.evaluaciones.length === 0
            ? "Sin evaluaciones registradas."
            : a.evaluaciones
                .map((e) => `${e.nombre}: ${e.eximida ? "Eximido" : e.nota === null ? "—" : e.nota.toFixed(1)}`)
                .join("   ");
        parrafo(ctx, detalle, 10, 14);
        ctx.y -= 8;
        if (ctx.y < MARGEN + 150) break;
      }
    }

    ctx.y -= 6;
    parrafo(ctx, snapshot.leyenda ?? "", 9, 12);
  }

  if (anulado) {
    page.drawText("ANULADO", {
      x: 150,
      y: 400,
      size: 90,
      font: bold,
      color: rgb(0.85, 0.2, 0.2),
      opacity: 0.25,
      rotate: degrees(30),
    });
  }

  if (!interno && verifyUrl && token) {
    pieVerificacion(ctx, snapshot, verifyUrl, token);
  } else if (interno) {
    ctx.page.drawText(
      "Documento interno de trabajo. Para el documento oficial con folio, emítelo desde la ficha del estudiante.",
      { x: MARGEN, y: MARGEN + 20, size: 8, font, color: GRIS }
    );
  }

  // Marca discreta al pie de todas las páginas: cada documento que sale del
  // colegio lleva la firma de la plataforma.
  ctx.page.drawText("Generado con Aulia · aulia.cl", {
    x: MARGEN,
    y: MARGEN - 24,
    size: 7.5,
    font,
    color: rgb(0.62, 0.65, 0.68),
  });
}

export async function generarPdfCertificado(params: {
  tipo: TipoCertificado;
  folio: number;
  snapshot: SnapshotCertificado;
  token: string;
  verifyUrl: string;
  anulado: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  await dibujarPagina(doc, font, bold, params);
  return doc.save();
}

/**
 * Boletines de todo un curso en un solo PDF (una página por estudiante).
 * Documento interno de trabajo (sin folio ni verificación individual); el
 * boletín oficial con folio se emite por estudiante desde su ficha.
 */
export async function generarBoletinesCursoPdf(
  items: { tipo: TipoCertificado; snapshot: SnapshotCertificado }[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const it of items) {
    await dibujarPagina(doc, font, bold, {
      tipo: it.tipo,
      folio: null,
      snapshot: it.snapshot,
      anulado: false,
      interno: true,
    });
  }
  return doc.save();
}
