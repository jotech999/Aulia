/**
 * Modelo comercial de Aulia — precio por estudiante matriculado, facturación anual en UF.
 *
 * Por qué por estudiante y no plano por colegio:
 * el líder del mercado chileno (Lirmi) cobra por estudiante al año, y el modelo plano
 * por tramos regala margen en los establecimientos grandes: con tarifa plana un colegio
 * de 1.500 alumnos paga lo mismo que uno de 150. La UF protege el contrato de la
 * inflación sin renegociar (estándar en compras públicas y en contratos de sostenedores).
 *
 * Por qué los tramos son marginales y no escalones:
 * con descuentos por escalón (todo el colegio al precio del tramo) el precio total
 * BAJA al cruzar el borde: 300 alumnos costarían más que 301. Los tramos se aplican
 * como los de un impuesto progresivo — el descuento rige solo sobre los estudiantes
 * de ese tramo — de modo que el total siempre crece con la matrícula y no hay saltos.
 *
 * Referencias de mercado verificadas (julio 2026):
 * - Lirmi publica un rango de USD 5 a 20 por estudiante al año → 0,11 a 0,45 UF.
 * - I. Municipalidad de Maullín, licitación 4091-9-L123: 136 UF + IVA de referencia
 *   por la plataforma Lirmi para UN establecimiento (Liceo Carelmapu).
 * - Syscol publica tarifa plana por establecimiento (25 a 65 UF/año según tramo),
 *   más 10 UF de implementación el primer año.
 *
 * Este módulo es la ÚNICA fuente de verdad de los precios públicos: la landing, el
 * material comercial y los datos estructurados (schema.org) leen de aquí.
 */

/**
 * Valor de la UF usado solo para mostrar equivalencias en pesos en la landing.
 * El contrato se expresa en UF, así que este número es referencial y se puede
 * actualizar sin tocar los precios. Fuente: valor UF julio 2026.
 */
export const UF_REFERENCIA_CLP = 40_845;

/** Fecha del valor de UF de referencia, para poder mostrar la letra chica sin mentir. */
export const UF_REFERENCIA_FECHA = "julio 2026";

export type IdPlan = "libro" | "pro" | "gestion";

export type PlanComercial = {
  id: IdPlan;
  nombre: string;
  /** Precio de lista por estudiante matriculado, por año, en UF (primeros 300). */
  ufPorEstudiante: number;
  /**
   * Mínimo anual por establecimiento, en UF. Existe porque el costo de
   * implementación, capacitación y soporte no baja con la matrícula: sin piso,
   * un colegio de 60 alumnos entraría por debajo del costo de atenderlo.
   */
  pisoUf: number;
  destacado?: boolean;
  resumen: string;
  incluye: string[];
};

export const PLANES: PlanComercial[] = [
  {
    id: "libro",
    nombre: "Libro de Clases",
    ufPorEstudiante: 0.13,
    pisoUf: 25,
    resumen: "El libro de clases digital completo, al día con la normativa.",
    incluye: [
      "Asistencia diaria y cierre mensual SIGE",
      "Calificaciones y promoción (Decreto 67)",
      "Leccionario, firma de clases y anotaciones",
      "Auditoría Circular N°30 y respaldo a 5 años",
      "Planificación con cobertura de OA",
      "Matrícula y ficha del estudiante",
      "Usuarios ilimitados y soporte incluido",
    ],
  },
  {
    id: "pro",
    nombre: "Profesor Pro",
    ufPorEstudiante: 0.26,
    pisoUf: 40,
    destacado: true,
    resumen: "Lo anterior, más la relación con las familias y la IA docente.",
    incluye: [
      "Todo lo del Libro de Clases",
      "Comunicados con confirmación de lectura",
      "Portal del apoderado y del estudiante",
      "Aviso automático de notas y ausencias",
      "Alertas tempranas de riesgo escolar",
      "Asistente de IA para docentes incluido",
      "Modo sin conexión para pasar lista",
    ],
  },
  {
    id: "gestion",
    nombre: "Gestión Escolar",
    ufPorEstudiante: 0.42,
    pisoUf: 55,
    resumen: "La plataforma completa, del aula al sostenedor.",
    incluye: [
      "Todo lo de Profesor Pro",
      "Convivencia escolar con protocolos y expedientes",
      "Admisión pública y matrícula en línea",
      "Recaudación, morosidad y conciliación",
      "PIE con registro de sesiones",
      "Reportes ejecutivos y panel del sostenedor",
      "Panel de cumplimiento normativo",
    ],
  },
];

/**
 * Tramos marginales de descuento sobre el precio por estudiante. `hasta` es el
 * último estudiante del tramo; el descuento rige solo sobre los estudiantes de
 * ese tramo, igual que un impuesto progresivo.
 */
export const TRAMOS: { hasta: number; descuento: number; etiqueta: string }[] = [
  { hasta: 300, descuento: 0, etiqueta: "Estudiantes 1 a 300" },
  { hasta: 700, descuento: 0.08, etiqueta: "Estudiantes 301 a 700" },
  { hasta: 1200, descuento: 0.15, etiqueta: "Estudiantes 701 a 1.200" },
  { hasta: Infinity, descuento: 0.22, etiqueta: "Estudiantes 1.201 y más" },
];

/** Descuento adicional para sostenedores con 2 o más establecimientos. */
export const DESCUENTO_RED = 0.12;

/**
 * Reparte una matrícula entre los tramos marginales.
 * Ej.: 600 → [{tramo: 1-300, alumnos: 300}, {tramo: 301-700, alumnos: 300}].
 */
export function repartirEnTramos(matricula: number) {
  const alumnos = Math.max(0, Math.floor(matricula));
  let restantes = alumnos;
  let piso = 0;
  const reparto: { descuento: number; alumnos: number; etiqueta: string }[] = [];

  for (const tramo of TRAMOS) {
    if (restantes <= 0) break;
    const capacidad = tramo.hasta - piso;
    const enTramo = Math.min(restantes, capacidad);
    reparto.push({ descuento: tramo.descuento, alumnos: enTramo, etiqueta: tramo.etiqueta });
    restantes -= enTramo;
    piso = tramo.hasta;
  }

  return reparto;
}

/** Descuento efectivo (promedio ponderado) que termina viendo el colegio. */
export function descuentoEfectivo(matricula: number): number {
  const reparto = repartirEnTramos(matricula);
  const total = reparto.reduce((s, t) => s + t.alumnos, 0);
  if (total === 0) return 0;
  const ponderado = reparto.reduce((s, t) => s + t.alumnos * t.descuento, 0);
  return ponderado / total;
}

export type Cotizacion = {
  /** Total anual del contrato, en UF, ya con descuentos y mínimo aplicados. */
  ufAnual: number;
  /** Equivalencia referencial en pesos del total anual. */
  clpAnual: number;
  /** Costo por estudiante al mes, referencial en pesos. */
  clpPorEstudianteMes: number;
  /** Descuento efectivo por volumen (0 a 1). */
  descuentoVolumen: number;
  /** True si el total quedó determinado por el mínimo del plan y no por la matrícula. */
  aplicaPiso: boolean;
};

/**
 * Cotiza un plan para una matrícula dada. Devuelve el total anual en UF con los
 * tramos marginales aplicados y nunca por debajo del mínimo del plan.
 */
export function cotizar(
  plan: PlanComercial,
  matricula: number,
  opciones: { red?: boolean } = {},
): Cotizacion {
  const alumnos = Math.max(0, Math.floor(matricula));
  const factorRed = opciones.red ? 1 - DESCUENTO_RED : 1;

  const bruto = repartirEnTramos(alumnos).reduce(
    (suma, tramo) => suma + tramo.alumnos * plan.ufPorEstudiante * (1 - tramo.descuento),
    0,
  );

  const conRed = bruto * factorRed;
  const piso = plan.pisoUf * factorRed;
  const aplicaPiso = conRed < piso;
  const ufAnual = Math.round((aplicaPiso ? piso : conRed) * 10) / 10;

  const clpAnual = Math.round(ufAnual * UF_REFERENCIA_CLP);

  return {
    ufAnual,
    clpAnual,
    clpPorEstudianteMes: alumnos > 0 ? Math.round(clpAnual / alumnos / 12) : 0,
    descuentoVolumen: descuentoEfectivo(alumnos),
    aplicaPiso,
  };
}

/** Formatea un monto en pesos chilenos sin decimales: 5862000 → "$5.862.000". */
export function formatearCLP(monto: number): string {
  return `$${Math.round(monto).toLocaleString("es-CL")}`;
}

/** Formatea un valor en UF con hasta dos decimales y coma decimal: 143.5 → "143,5". */
export function formatearUF(uf: number): string {
  return uf.toLocaleString("es-CL", { maximumFractionDigits: 2 });
}
