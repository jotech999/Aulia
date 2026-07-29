import { prisma } from "@/lib/prisma";

export type SemaforoCumplimiento = "listo" | "atencion" | "pendiente";

export type EvidenciaCumplimiento = {
  clave: "EDE" | "AUDITORIA" | "RETENCION" | "RESPALDOS" | "FIRMA" | "PRIVACIDAD";
  titulo: string;
  estado: SemaforoCumplimiento;
  etiqueta: string;
  evidencia: string;
  siguientePaso: string;
  href?: string;
};

export type ItemChecklistCumplimiento = {
  id: string;
  titulo: string;
  detalle: string;
  completado: boolean;
  prioridad: "alta" | "media" | "continua";
  accion: string;
  href?: string;
};

export type ExportacionEdeResumen = {
  id: string;
  anio: number;
  estado: string;
  creadaEn: Date;
  validadoEn: Date | null;
  versionEde: string | null;
  versionCeds: string | null;
  cifrado: boolean;
  artefactos: number;
  tamanoBytes: number | null;
  tieneHash: boolean;
  tieneErrores: boolean;
};

export type FuenteDiagnosticoCumplimiento = {
  rbdPresente: boolean;
  exportaciones: ExportacionEdeResumen[];
  auditoria: {
    total: number;
    primeraEn: Date | null;
    ultimaEn: Date | null;
  };
  libro: {
    clasesRegistradas: number;
    clasesFirmadas: number;
    firmasMineducVerificadas: number;
  };
  verificaciones: Record<
    string,
    { estado: string; ejecutadaEn: Date } | undefined
  >;
  privacidad: {
    solicitudesAbiertas: number;
    solicitudesVencidas: number;
  };
};

export type CentroCumplimiento = {
  colegio: { nombre: string; rbd: string | null };
  generadoEn: Date;
  evidencias: EvidenciaCumplimiento[];
  checklist: ItemChecklistCumplimiento[];
  exportaciones: ExportacionEdeResumen[];
  resumen: {
    conEvidencia: number;
    porAtender: number;
    pendientes: number;
    avanceChecklist: number;
  };
};

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

export function horasDesde(fecha: Date, ahora: Date): number {
  return Math.max(0, (ahora.getTime() - fecha.getTime()) / HORA_MS);
}

export function evaluarVerificacion(
  verificacion: { estado: string; ejecutadaEn: Date } | undefined,
  ahora: Date,
  vigenciaHoras: number,
): SemaforoCumplimiento {
  if (!verificacion) return "pendiente";
  if (verificacion.estado !== "OK") return "atencion";
  return horasDesde(verificacion.ejecutadaEn, ahora) <= vigenciaHoras
    ? "listo"
    : "atencion";
}

function fechaBreve(fecha: Date | null): string {
  if (!fecha) return "sin evidencia registrada";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(fecha);
}

function etiquetaEstado(estado: SemaforoCumplimiento): string {
  if (estado === "listo") return "Con evidencia";
  if (estado === "atencion") return "Requiere revisión";
  return "Pendiente de evidencia";
}

export function construirDiagnosticoCumplimiento(
  fuente: FuenteDiagnosticoCumplimiento,
  ahora: Date,
): { evidencias: EvidenciaCumplimiento[]; checklist: ItemChecklistCumplimiento[] } {
  const ultimaExportacion = fuente.exportaciones[0];
  const exportacionValidada = fuente.exportaciones.find(
    (exportacion) => exportacion.estado === "VALIDADA" && exportacion.validadoEn,
  );
  const exportacionCompleta = Boolean(
    exportacionValidada?.cifrado &&
      exportacionValidada.tieneHash &&
      exportacionValidada.artefactos > 0,
  );
  const estadoEde: SemaforoCumplimiento = exportacionCompleta
    ? "listo"
    : ultimaExportacion
      ? "atencion"
      : "pendiente";

  const auditoriaReciente = fuente.auditoria.ultimaEn
    ? ahora.getTime() - fuente.auditoria.ultimaEn.getTime() <= 30 * DIA_MS
    : false;
  const estadoAuditoria: SemaforoCumplimiento =
    fuente.auditoria.total === 0
      ? "pendiente"
      : auditoriaReciente
        ? "listo"
        : "atencion";

  const respaldo = fuente.verificaciones.RESPALDO;
  const restauracion = fuente.verificaciones.RESTAURACION;
  const estadoRespaldo = evaluarVerificacion(respaldo, ahora, 48);
  const estadoRestauracion = evaluarVerificacion(restauracion, ahora, 24 * 180);

  const firmaCompleta =
    fuente.libro.clasesRegistradas > 0 &&
    fuente.libro.clasesFirmadas === fuente.libro.clasesRegistradas &&
    fuente.libro.firmasMineducVerificadas === fuente.libro.clasesFirmadas;
  const estadoFirma: SemaforoCumplimiento =
    firmaCompleta
      ? "listo"
      : fuente.libro.clasesFirmadas > 0
        ? "atencion"
        : "pendiente";

  const verificacionPrivacidad = fuente.verificaciones.PRIVACIDAD;
  const privacidadRevisada =
    evaluarVerificacion(verificacionPrivacidad, ahora, 24 * 365) === "listo";
  const estadoPrivacidad: SemaforoCumplimiento =
    fuente.privacidad.solicitudesVencidas > 0
      ? "atencion"
      : fuente.privacidad.solicitudesAbiertas > 0
        ? "atencion"
        : privacidadRevisada
          ? "listo"
          : "pendiente";

  const evidencias: EvidenciaCumplimiento[] = [
    {
      clave: "EDE",
      titulo: "Preparación EDE",
      estado: estadoEde,
      etiqueta: estadoEde === "listo" ? "Validación registrada" : etiquetaEstado(estadoEde),
      evidencia: exportacionValidada
        ? `Ejecución ${exportacionValidada.versionEde ?? "sin versión informada"} validada el ${fechaBreve(exportacionValidada.validadoEn)}. Esto no acredita homologación del sistema.`
        : ultimaExportacion
          ? `Última ejecución en estado ${ultimaExportacion.estado.toLowerCase().replaceAll("_", " ")}; aún sin una validación completa registrada.`
          : "No existen ejecuciones EDE registradas para este establecimiento.",
      siguientePaso: exportacionCompleta
        ? "Conservar artefacto, hash y resultado del validador junto con la evidencia del periodo."
        : "Preparar el conjunto, cifrarlo y validarlo con las herramientas oficiales antes del piloto.",
      href: "/admin/exportaciones",
    },
    {
      clave: "AUDITORIA",
      titulo: "Trazabilidad del libro",
      estado: estadoAuditoria,
      etiqueta: etiquetaEstado(estadoAuditoria),
      evidencia:
        fuente.auditoria.total > 0
          ? `${fuente.auditoria.total.toLocaleString("es-CL")} eventos; actividad más reciente el ${fechaBreve(fuente.auditoria.ultimaEn)}.`
          : "No hay eventos de auditoría registrados para el establecimiento.",
      siguientePaso:
        "Revisar periódicamente que cada mutación regulada produzca un evento append-only y sin datos sensibles innecesarios.",
      href: "/admin/exportaciones",
    },
    {
      clave: "RETENCION",
      titulo: "Retención y recuperación",
      estado: estadoRestauracion,
      etiqueta: etiquetaEstado(estadoRestauracion),
      evidencia: restauracion
        ? `Última prueba de restauración: ${restauracion.estado}, ${fechaBreve(restauracion.ejecutadaEn)}. Historial auditable desde ${fechaBreve(fuente.auditoria.primeraEn)}.`
        : `Sin prueba de restauración registrada. Historial auditable desde ${fechaBreve(fuente.auditoria.primeraEn)}.`,
      siguientePaso:
        "Documentar una restauración verificable y mantener la política de conservación de respaldo por al menos cinco años.",
    },
    {
      clave: "RESPALDOS",
      titulo: "Respaldos operacionales",
      estado: estadoRespaldo,
      etiqueta: etiquetaEstado(estadoRespaldo),
      evidencia: respaldo
        ? `Última verificación: ${respaldo.estado}, ${fechaBreve(respaldo.ejecutadaEn)}.`
        : "No existe una verificación de respaldo registrada.",
      siguientePaso:
        "Automatizar el respaldo, comprobar su cifrado y registrar una verificación independiente cada 48 horas.",
    },
    {
      clave: "FIRMA",
      titulo: "Leccionario (firma de clases)",
      estado: estadoFirma,
      etiqueta:
        firmaCompleta
          ? "Cobertura verificada"
          : fuente.libro.firmasMineducVerificadas > 0
            ? "Verificación parcial"
          : fuente.libro.clasesFirmadas > 0
            ? "Solo firma local"
            : "Sin evidencia de firma",
      evidencia: `${fuente.libro.clasesFirmadas.toLocaleString("es-CL")} de ${fuente.libro.clasesRegistradas.toLocaleString("es-CL")} clases firmadas; ${fuente.libro.firmasMineducVerificadas.toLocaleString("es-CL")} con verificación Mineduc registrada.`,
      siguientePaso:
        firmaCompleta
          ? "Monitorear rechazos y conservar identificador, hash y fecha de cada verificación."
          : "Completar la integración oficial con OTP Mineduc; la firma local no debe presentarse como firma oficial.",
      href: "/libro-clases/firma",
    },
    {
      clave: "PRIVACIDAD",
      titulo: "Privacidad y derechos",
      estado: estadoPrivacidad,
      etiqueta:
        fuente.privacidad.solicitudesVencidas > 0
          ? `${fuente.privacidad.solicitudesVencidas} solicitud(es) vencida(s)`
          : fuente.privacidad.solicitudesAbiertas > 0
            ? `${fuente.privacidad.solicitudesAbiertas} solicitud(es) en curso`
            : privacidadRevisada
              ? "Revisión vigente registrada"
              : "Revisión de privacidad pendiente",
      evidencia: verificacionPrivacidad
        ? `Última revisión registrada: ${verificacionPrivacidad.estado}, ${fechaBreve(verificacionPrivacidad.ejecutadaEn)}. La vista no expone datos de titulares.`
        : "No hay una revisión de privacidad registrada. Esta vista agregada no expone datos de titulares.",
      siguientePaso:
        fuente.privacidad.solicitudesAbiertas > 0
          ? "Verificar identidad, responsable y plazo de cada solicitud mediante el proceso interno autorizado."
          : "Mantener el registro de solicitudes, incidentes, accesos y evaluación de impacto actualizado.",
    },
  ];

  const checklist: ItemChecklistCumplimiento[] = [
    {
      id: "rbd",
      titulo: "Identificación institucional",
      detalle: fuente.rbdPresente
        ? "El establecimiento tiene RBD registrado."
        : "Falta registrar el RBD antes de generar evidencia institucional.",
      completado: fuente.rbdPresente,
      prioridad: "alta",
      accion: fuente.rbdPresente ? "Revisar configuración" : "Registrar RBD",
    },
    {
      id: "ede",
      titulo: "Ejecución EDE reproducible",
      detalle: exportacionCompleta
        ? "Hay una ejecución validada con cifrado, hash y artefacto trazable."
        : "Falta una ejecución con cifrado, hash, artefacto y validación registrada.",
      completado: exportacionCompleta,
      prioridad: "alta",
      accion: "Ir a exportaciones",
      href: "/admin/exportaciones",
    },
    {
      id: "firma",
      titulo: "Firma oficial de clases",
      detalle:
        firmaCompleta
          ? "Todas las clases registradas tienen una transacción Mineduc verificada."
          : "La firma local no reemplaza la verificación oficial con OTP Mineduc.",
      completado: firmaCompleta,
      prioridad: "alta",
      accion: "Revisar libro de firmas",
      href: "/libro-clases/firma",
    },
    {
      id: "respaldo",
      titulo: "Respaldo reciente",
      detalle:
        estadoRespaldo === "listo"
          ? "La verificación de respaldo está dentro de la ventana de 48 horas."
          : "Registrar una verificación exitosa y reciente del respaldo cifrado.",
      completado: estadoRespaldo === "listo",
      prioridad: "alta",
      accion: "Coordinar verificación",
    },
    {
      id: "restauracion",
      titulo: "Prueba de restauración",
      detalle:
        estadoRestauracion === "listo"
          ? "Existe una prueba exitosa dentro de los últimos 180 días."
          : "Ejecutar y documentar una restauración controlada, sin datos personales expuestos.",
      completado: estadoRestauracion === "listo",
      prioridad: "media",
      accion: "Programar simulacro",
    },
    {
      id: "privacidad",
      titulo: "Solicitudes de titulares dentro de plazo",
      detalle:
        fuente.privacidad.solicitudesVencidas === 0 && privacidadRevisada
          ? "No hay solicitudes vencidas y existe una revisión vigente registrada."
          : fuente.privacidad.solicitudesVencidas === 0
            ? "No hay solicitudes vencidas, pero falta registrar la revisión periódica de privacidad."
          : "Hay solicitudes que requieren atención inmediata.",
      completado:
        fuente.privacidad.solicitudesVencidas === 0 && privacidadRevisada,
      prioridad: fuente.privacidad.solicitudesVencidas > 0 ? "alta" : "continua",
      accion: "Documentar revisión de privacidad",
    },
  ];

  return { evidencias, checklist };
}

export async function obtenerCentroCumplimiento(
  colegioId: string,
  ahora = new Date(),
): Promise<CentroCumplimiento | null> {
  const estadosCerrados = ["RESPONDIDA", "RECHAZADA", "CANCELADA"] as const;

  const [
    colegio,
    exportaciones,
    auditoriaTotal,
    primerEvento,
    ultimoEvento,
    clasesRegistradas,
    clasesFirmadas,
    firmasMineducVerificadas,
    verificaciones,
    solicitudesAbiertas,
    solicitudesVencidas,
  ] = await Promise.all([
    prisma.colegio.findUnique({
      where: { id: colegioId },
      select: { nombre: true, rbd: true },
    }),
    prisma.exportacionEde.findMany({
      where: { colegioId, anioEscolar: { colegioId } },
      select: {
        id: true,
        estado: true,
        creadaEn: true,
        validadoEn: true,
        versionEde: true,
        versionCeds: true,
        cifrado: true,
        tamanoBytes: true,
        hashSha256: true,
        errores: true,
        anioEscolar: { select: { anio: true } },
        _count: {
          select: { artefactos: { where: { colegioId } } },
        },
      },
      orderBy: { creadaEn: "desc" },
      take: 8,
    }),
    prisma.auditLog.count({ where: { colegioId } }),
    prisma.auditLog.findFirst({
      where: { colegioId },
      select: { ts: true },
      orderBy: { ts: "asc" },
    }),
    prisma.auditLog.findFirst({
      where: { colegioId },
      select: { ts: true },
      orderBy: { ts: "desc" },
    }),
    prisma.claseRegistrada.count({ where: { colegioId, eliminadaEn: null } }),
    prisma.claseRegistrada.count({
      where: { colegioId, eliminadaEn: null, firmadaEn: { not: null } },
    }),
    prisma.claseRegistrada.count({
      where: {
        colegioId,
        eliminadaEn: null,
        firmaProveedor: "MINEDUC",
        firmaVerificadaEn: { not: null },
      },
    }),
    prisma.verificacionSistema.findMany({
      where: { colegioId },
      select: { tipo: true, estado: true, ejecutadaEn: true },
      orderBy: { ejecutadaEn: "desc" },
      take: 100,
    }),
    prisma.solicitudTitular.count({
      where: { colegioId, estado: { notIn: [...estadosCerrados] } },
    }),
    prisma.solicitudTitular.count({
      where: {
        colegioId,
        estado: { notIn: [...estadosCerrados] },
        vencimientoEn: { lt: ahora },
      },
    }),
  ]);

  if (!colegio) return null;

  const verificacionesRecientes: FuenteDiagnosticoCumplimiento["verificaciones"] = {};
  for (const verificacion of verificaciones) {
    if (!verificacionesRecientes[verificacion.tipo]) {
      verificacionesRecientes[verificacion.tipo] = verificacion;
    }
  }

  const exportacionesResumen: ExportacionEdeResumen[] = exportaciones.map(
    (exportacion) => ({
      id: exportacion.id,
      anio: exportacion.anioEscolar.anio,
      estado: exportacion.estado,
      creadaEn: exportacion.creadaEn,
      validadoEn: exportacion.validadoEn,
      versionEde: exportacion.versionEde,
      versionCeds: exportacion.versionCeds,
      cifrado: exportacion.cifrado,
      artefactos: exportacion._count.artefactos,
      tamanoBytes:
        exportacion.tamanoBytes === null ? null : Number(exportacion.tamanoBytes),
      tieneHash: Boolean(exportacion.hashSha256),
      tieneErrores: exportacion.errores !== null,
    }),
  );

  const fuente: FuenteDiagnosticoCumplimiento = {
    rbdPresente: Boolean(colegio.rbd?.trim()),
    exportaciones: exportacionesResumen,
    auditoria: {
      total: auditoriaTotal,
      primeraEn: primerEvento?.ts ?? null,
      ultimaEn: ultimoEvento?.ts ?? null,
    },
    libro: { clasesRegistradas, clasesFirmadas, firmasMineducVerificadas },
    verificaciones: verificacionesRecientes,
    privacidad: { solicitudesAbiertas, solicitudesVencidas },
  };

  const { evidencias, checklist } = construirDiagnosticoCumplimiento(fuente, ahora);
  const completados = checklist.filter((item) => item.completado).length;

  return {
    colegio,
    generadoEn: ahora,
    evidencias,
    checklist,
    exportaciones: exportacionesResumen,
    resumen: {
      conEvidencia: evidencias.filter((item) => item.estado === "listo").length,
      porAtender: evidencias.filter((item) => item.estado === "atencion").length,
      pendientes: evidencias.filter((item) => item.estado === "pendiente").length,
      avanceChecklist: checklist.length
        ? Math.round((completados / checklist.length) * 100)
        : 0,
    },
  };
}
