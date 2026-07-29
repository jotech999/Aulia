/**
 * Seed: colegio demo "vivo" para demostración comercial.
 * Ejecutar: npm run db:seed
 *
 * Genera un colegio con 8 cursos (1° básico a IV medio), ~25 estudiantes por
 * curso, un semestre completo de asistencia, notas realistas (con reprobados,
 * para que gráficos y alertas tengan sustancia), anotaciones, planificaciones
 * con OA, comunicados y entrevistas. Datos deterministas (PRNG con semilla) para
 * que la demo se vea igual en cada re-siembra.
 *
 * Logins (contraseña demo1234):
 *   admin@demo.cl (ADMIN) · director@demo.cl (DIRECTOR) · utp@demo.cl (UTP)
 *   inspector@demo.cl (INSPECTOR)
 *   cvargas@demo.cl, rparedes@demo.cl … (PROFESOR_JEFE, uno por curso)
 *   driquelme@demo.cl (PROFESOR de Matemática en varios cursos, sin jefatura)
 *   apoderado1@demo.cl / apoderado2@demo.cl / apoderado3@demo.cl (APODERADO)
 *   estudiante@demo.cl (ESTUDIANTE, portal propio)
 */
import { CalidadApoderado, PrismaClient, Rol } from "@prisma/client";
import bcrypt from "bcryptjs";
import { OA_SEED } from "./data/oa";
import { FERIADOS_CL } from "../src/lib/feriados";

const prisma = new PrismaClient();

// ── PRNG determinista (mulberry32) ──────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260718);
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
/** Elige un elemento distinto de `evitar` (para no repetir nombre/apellido). */
const pickDistinto = <T>(arr: T[], evitar: T): T => {
  let v = pick(arr);
  for (let i = 0; i < 6 && v === evitar; i++) v = pick(arr);
  return v;
};
const gauss = () => rnd() + rnd() + rnd() - 1.5; // ~normal, σ≈0.5
const round1 = (n: number) => Math.round(n * 10) / 10;
const clampNota = (n: number) => Math.min(7, Math.max(1, round1(n)));
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

// ── Nombres chilenos ────────────────────────────────────────────────────────
const NOMBRES_M = ["Benjamín","Vicente","Martín","Agustín","Tomás","Matías","Joaquín","Cristóbal","Maximiliano","Lucas","Gaspar","Diego","Sebastián","Felipe","Ignacio","Bruno","Emilio","Damián","Alonso","Facundo","Santiago","Bastián"];
const NOMBRES_F = ["Sofía","Isidora","Emilia","Antonia","Florencia","Martina","Josefa","Catalina","Amanda","Trinidad","Fernanda","Valentina","Javiera","Constanza","Agustina","Renata","Maite","Colomba","Anaís","Julieta","Rafaela","Magdalena"];
const APELLIDOS = ["González","Muñoz","Rojas","Díaz","Pérez","Soto","Contreras","Silva","Martínez","Sepúlveda","Morales","Rodríguez","López","Fuentes","Araya","Castillo","Flores","Tapia","Espinoza","Reyes","Torres","Vergara","Gutiérrez","Cortés","Vega","Riquelme","Sandoval","Miranda","Núñez","Carrasco","Bravo","Yáñez","Herrera","Aravena","Salazar","Cáceres","Poblete","Vidal","Garrido","Fuenzalida"];

/** Genera un RUT válido con dígito verificador (módulo 11). */
function rutValido(num: number): string {
  let suma = 0, mul = 2, n = num;
  while (n > 0) {
    suma += (n % 10) * mul;
    n = Math.floor(n / 10);
    mul = mul === 7 ? 2 : mul + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return `${num}-${dv}`;
}

async function chunked<T>(rows: T[], fn: (c: T[]) => Promise<unknown>, size = 3000) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

// ── Configuración académica ─────────────────────────────────────────────────
const NIVELES: { nivel: string; anioNac: number; media: boolean }[] = [
  { nivel: "1B", anioNac: 2019, media: false },
  { nivel: "3B", anioNac: 2017, media: false },
  { nivel: "5B", anioNac: 2015, media: false },
  { nivel: "6B", anioNac: 2014, media: false },
  { nivel: "8B", anioNac: 2012, media: false },
  { nivel: "1M", anioNac: 2011, media: true },
  { nivel: "2M", anioNac: 2010, media: true },
  { nivel: "4M", anioNac: 2008, media: true },
];
const ASIGN_BASICA = ["Lenguaje y Comunicación", "Matemática", "Historia y Geografía", "Ciencias Naturales", "Inglés"];
const ASIGN_MEDIA = ["Lengua y Literatura", "Matemática", "Historia y Cs. Sociales", "Biología", "Inglés"];

const ANOT_POS = [
  ["Excelente participación en clases", "reconocimiento"],
  ["Ayudó a un compañero con dificultades", "convivencia"],
  ["Destacó en la exposición oral", "reconocimiento"],
  ["Entregó todos sus trabajos a tiempo", "responsabilidad"],
  ["Buen liderazgo en el trabajo grupal", "reconocimiento"],
];
const ANOT_NEG = [
  ["No trajo los materiales solicitados", "responsabilidad"],
  ["Interrumpió reiteradamente la clase", "convivencia"],
  ["Atraso reiterado al inicio de la jornada", "atrasos"],
  ["No entregó la tarea en la fecha acordada", "responsabilidad"],
];

async function main() {
  if (process.env.ALLOW_DEMO_RESET !== "true") {
    throw new Error("Seed demo bloqueado: define ALLOW_DEMO_RESET=true para autorizar explícitamente la reconstrucción de datos demo.");
  }
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const ANIO = 2026;

  const membrete = {
    direccion: "Av. Los Aromos 1234",
    comuna: "Los Andes",
    telefono: "+56 34 242 0000",
    email: "contacto@colegiodemo.cl",
    directorNombre: "Patricia Fuenzalida Rojas",
    directorCargo: "Directora",
  };
  const colegio = await prisma.colegio.upsert({
    where: { rbd: "99999" },
    update: membrete,
    create: { rbd: "99999", nombre: "Colegio Demo Los Andes", ...membrete },
  });

  // Feriados legales nacionales (tabla configurable). Idempotente: se rehacen
  // los nacionales del set de referencia. Alimentan los días hábiles del cierre
  // SIGE; un colegio puede sumar feriados locales/regionales con colegioId.
  await prisma.feriado.deleteMany({ where: { colegioId: null } });
  await prisma.feriado.createMany({
    data: Object.entries(FERIADOS_CL).map(([iso, nombre]) => ({
      colegioId: null,
      fecha: new Date(`${iso}T00:00:00Z`),
      nombre,
    })),
  });
  const colegioId = colegio.id;

  const crearUsuario = async (rutNum: number, nombre: string, email: string, rol: Rol) => {
    const usuario = await prisma.usuario.upsert({
      where: { email },
      update: { nombre },
      create: { rut: rutValido(rutNum), nombre, email, passwordHash },
    });
    await prisma.membresia.upsert({
      where: { usuarioId_colegioId_rol: { usuarioId: usuario.id, colegioId, rol } },
      update: {},
      create: { usuarioId: usuario.id, colegioId, rol },
    });
    return usuario;
  };

  // Equipo del colegio
  await crearUsuario(11111111, "Admin Demo", "admin@demo.cl", Rol.ADMIN);
  const directorUsuario = await crearUsuario(11222333, "Patricia Fuenzalida", "director@demo.cl", Rol.DIRECTOR);
  await crearUsuario(11333444, "Marcela Tobar", "utp@demo.cl", Rol.UTP);
  await crearUsuario(11444555, "Héctor Salinas", "inspector@demo.cl", Rol.INSPECTOR);

  // 8 profesores jefe (uno por curso).
  const jefesData = [
    [12222222, "Carolina Vargas", "cvargas@demo.cl"],
    [13333333, "Rodrigo Paredes", "rparedes@demo.cl"],
    [15111222, "Mónica Gatica", "mgatica@demo.cl"],
    [15222333, "Jorge Lagos", "jlagos@demo.cl"],
    [15333444, "Pamela Morales", "pmorales@demo.cl"],
    [15444555, "Sebastián Fuentes", "sfuentes@demo.cl"],
    [15555666, "Roxana Navarro", "rnavarro@demo.cl"],
    [15666777, "Andrés Tapia", "atapia@demo.cl"],
  ] as const;
  const profes = [];
  for (const [rut, nombre, email] of jefesData) {
    profes.push(await crearUsuario(rut, nombre, email, Rol.PROFESOR_JEFE));
  }
  // Profesor de asignatura (sin jefatura): dicta Matemática en varios cursos.
  const profeMate = await crearUsuario(14444444, "Daniela Riquelme", "driquelme@demo.cl", Rol.PROFESOR);
  // Idempotencia de rol: si una siembra previa le dejó otro rol (p. ej.
  // PROFESOR_JEFE), lo quitamos para que quede solo como PROFESOR.
  await prisma.membresia.deleteMany({ where: { usuarioId: profeMate.id, colegioId, rol: { not: Rol.PROFESOR } } });

  const anio = await prisma.anioEscolar.upsert({
    where: { colegioId_anio: { colegioId, anio: ANIO } },
    update: {},
    create: { colegioId, anio: ANIO, regimen: "SEMESTRAL" },
  });

  // ── Limpieza de datos transaccionales/académicos (reconstrucción limpia) ──
  // Siempre acotada al colegio demo y conservando AuditLog (append-only).
  await prisma.puntajeCriterioRubrica.deleteMany({ where: { colegioId } });
  await prisma.aplicacionRubrica.deleteMany({ where: { colegioId } });
  await prisma.eventoJustificacion.deleteMany({ where: { colegioId } });
  await prisma.justificacionInasistencia.deleteMany({ where: { colegioId } });
  await prisma.asistenciaBloque.deleteMany({ where: { colegioId } });
  await prisma.comunicadoObjetivoEstudiante.deleteMany({ where: { colegioId } });
  await prisma.trabajoOutbox.deleteMany({ where: { colegioId } });
  await prisma.eventoSolicitudTitular.deleteMany({ where: { colegioId } });
  await prisma.solicitudTitular.deleteMany({ where: { colegioId } });
  await prisma.artefactoExportacionEde.deleteMany({ where: { colegioId } });
  await prisma.exportacionEde.deleteMany({ where: { colegioId } });
  await prisma.accesoEstudiante.deleteMany({ where: { colegioId } });
  await prisma.operacionIdempotente.deleteMany({ where: { colegioId } });
  await prisma.verificacionSistema.deleteMany({ where: { colegioId } });
  await prisma.onboardingColegio.deleteMany({ where: { colegioId } });
  await prisma.comunicadoDestinatario.deleteMany({ where: { colegioId } });
  await prisma.comunicado.deleteMany({ where: { colegioId } });
  await prisma.calificacion.deleteMany({ where: { colegioId } });
  await prisma.evaluacion.deleteMany({ where: { colegioId } });
  await prisma.nivelCriterio.deleteMany({ where: { colegioId } });
  await prisma.criterioRubrica.deleteMany({ where: { colegioId } });
  await prisma.rubricaOa.deleteMany({ where: { colegioId } });
  await prisma.rubrica.deleteMany({ where: { colegioId } });
  await prisma.asistenciaDiaria.deleteMany({ where: { colegioId } });
  await prisma.anotacion.deleteMany({ where: { colegioId } });
  await prisma.entrevista.deleteMany({ where: { colegioId } });
  await prisma.certificado.deleteMany({ where: { colegioId } }).catch(() => {});
  await prisma.seguimientoConvivencia.deleteMany({ where: { caso: { colegioId } } }).catch(() => {});
  await prisma.casoConvivencia.deleteMany({ where: { colegioId } }).catch(() => {});
  await prisma.planificacionOa.deleteMany({ where: { planificacion: { colegioId } } });
  await prisma.planificacionHistorial.deleteMany({ where: { colegioId } });
  await prisma.planificacion.deleteMany({ where: { colegioId } });
  await prisma.claseRegistrada.deleteMany({ where: { colegioId } });
  await prisma.sesionPie.deleteMany({ where: { colegioId } }).catch(() => {});
  await prisma.fichaPie.deleteMany({ where: { colegioId } }).catch(() => {});
  await prisma.bloqueHorario.deleteMany({ where: { asignatura: { colegioId } } });
  await prisma.horarioVersion.deleteMany({ where: { colegioId } });
  await prisma.horarioCurso.deleteMany({ where: { colegioId } });
  await prisma.asignatura.deleteMany({ where: { colegioId } });
  await prisma.matricula.deleteMany({ where: { colegioId } });
  await prisma.apoderado.deleteMany({ where: { estudiante: { colegioId } } });
  await prisma.estudiante.deleteMany({ where: { colegioId } });
  await prisma.curso.deleteMany({ where: { colegioId } });

  // ── Cursos ────────────────────────────────────────────────────────────────
  type CursoSeed = { id: string; nivel: string; letra: string; anioNac: number; media: boolean; jefeId: string; indice: number };
  const cursos: CursoSeed[] = [];
  for (let i = 0; i < NIVELES.length; i++) {
    const jefe = profes[i]; // 0=cvargas(1B) ... 2=driquelme(5B) etc. — cada profe jefe de un curso
    const curso = await prisma.curso.create({
      data: { colegioId, anioEscolarId: anio.id, nivel: NIVELES[i].nivel, letra: "A", profesorJefeId: jefe.id },
    });
    cursos.push({ ...curso, ...NIVELES[i], jefeId: jefe.id, indice: i });
  }

  // ── Estudiantes + matrículas ───────────────────────────────────────────────
  type EstSeed = { rut: string; nombres: string; apellidos: string; cursoId: string; nivel: string; media: boolean; habilidad: number; asisRate: number };
  const estSeed: EstSeed[] = [];
  let rutBase = 21000000;
  for (const curso of cursos) {
    const n = 24 + Math.floor(rnd() * 4); // 24–27
    for (let k = 0; k < n; k++) {
      const esM = rnd() < 0.5;
      const pool = esM ? NOMBRES_M : NOMBRES_F;
      const n1 = pick(pool);
      const nombres = `${n1} ${pickDistinto(pool, n1)}`;
      const ap1 = pick(APELLIDOS);
      const apellidos = `${ap1} ${pickDistinto(APELLIDOS, ap1)}`;
      // Perfil: 10% en riesgo (baja habilidad + baja asistencia), 20% excelente, resto normal.
      const p = rnd();
      const habilidad = p < 0.1 ? 3.2 + rnd() * 0.8 : p < 0.3 ? 6.0 + rnd() * 0.9 : 4.5 + rnd() * 1.6;
      const asisRate = p < 0.1 ? 0.7 + rnd() * 0.13 : 0.9 + rnd() * 0.095;
      estSeed.push({
        rut: rutValido(rutBase++),
        nombres,
        apellidos,
        cursoId: curso.id,
        nivel: curso.nivel,
        media: curso.media,
        habilidad,
        asisRate,
      });
    }
  }
  const nacPorNivel = new Map(NIVELES.map((n) => [n.nivel, n.anioNac]));
  await chunked(estSeed, (c) =>
    prisma.estudiante.createMany({
      data: c.map((e, idx) => ({
        colegioId,
        rut: e.rut,
        nombres: e.nombres,
        apellidos: e.apellidos,
        fechaNacimiento: utc(nacPorNivel.get(e.nivel)!, (idx * 7) % 12, 1 + ((idx * 13) % 27)),
      })),
    })
  );
  const estudiantes = await prisma.estudiante.findMany({
    where: { colegioId },
    select: { id: true, rut: true },
  });
  const idPorRut = new Map(estudiantes.map((e) => [e.rut, e.id]));
  const estFull = estSeed.map((e) => ({ ...e, id: idPorRut.get(e.rut)! }));
  const fechaMatricula = utc(ANIO, 2, 1);
  await chunked(estFull, (c) =>
    prisma.matricula.createMany({
      data: c.map((e) => ({ colegioId, estudianteId: e.id, cursoId: e.cursoId, fecha: fechaMatricula })),
    })
  );
  const estudiantePortal = await crearUsuario(
    21000000,
    `${estFull[0].nombres} ${estFull[0].apellidos}`,
    "estudiante@demo.cl",
    Rol.ESTUDIANTE
  );
  await prisma.accesoEstudiante.create({
    data: {
      colegioId,
      usuarioId: estudiantePortal.id,
      estudianteId: estFull[0].id,
      creadoPorId: directorUsuario.id,
    },
  });

  // ── Asignaturas + horario ───────────────────────────────────────────────────
  type AsigInfo = { id: string; cursoId: string; nombre: string; docenteId: string; media: boolean; nivel: string; estIds: string[] };
  const asignaturas: AsigInfo[] = [];
  for (const curso of cursos) {
    const horarioCurso = await prisma.horarioCurso.create({
      data: { colegioId, cursoId: curso.id },
    });
    const horarioVersion = await prisma.horarioVersion.create({
      data: {
        colegioId,
        horarioCursoId: horarioCurso.id,
        numero: 1,
        estado: "PUBLICADO",
        vigenteDesde: utc(ANIO, 2, 1),
        publicadoEn: utc(ANIO, 2, 1),
        creadoPorId: directorUsuario.id,
        publicadoPorId: directorUsuario.id,
      },
    });
    const lista = curso.media ? ASIGN_MEDIA : ASIGN_BASICA;
    const estIds = estFull.filter((e) => e.cursoId === curso.id).map((e) => e.id);
    for (let s = 0; s < lista.length; s++) {
      // La primera asignatura la dicta el profe jefe; el resto rota (Matemática → driquelme).
      const docenteId =
        s === 0 ? curso.jefeId : lista[s] === "Matemática" ? profeMate.id : profes[(curso.indice + s) % profes.length].id;
      const asig = await prisma.asignatura.create({
        data: { colegioId, cursoId: curso.id, nombre: lista[s], docenteId },
      });
      await prisma.bloqueHorario.createMany({
        data: [
          { colegioId, horarioVersionId: horarioVersion.id, asignaturaId: asig.id, dia: 1 + (s % 5), horaInicio: "08:00", horaFin: "09:30", horaInicioMin: 480, horaFinMin: 570 },
          { colegioId, horarioVersionId: horarioVersion.id, asignaturaId: asig.id, dia: 1 + ((s + 2) % 5), horaInicio: "10:00", horaFin: "11:30", horaInicioMin: 600, horaFinMin: 690 },
        ],
      });
      asignaturas.push({ id: asig.id, cursoId: curso.id, nombre: lista[s], docenteId, media: curso.media, nivel: curso.nivel, estIds });
    }
  }

  // ── Evaluaciones + calificaciones ───────────────────────────────────────────
  // Semestre 1: 5 evaluaciones ya rendidas. Semestre 2: 2 futuras (sin nota) → aparecen
  // como "próximas evaluaciones" en el portal del apoderado.
  const evalsSem1 = [
    { nombre: "Diagnóstico", fecha: utc(ANIO, 2, 20), pond: 20 },
    { nombre: "Prueba unidad 1", fecha: utc(ANIO, 3, 15), pond: 20 },
    { nombre: "Trabajo de investigación", fecha: utc(ANIO, 4, 13), pond: 20 },
    { nombre: "Prueba unidad 2", fecha: utc(ANIO, 5, 10), pond: 20 },
    { nombre: "Examen semestral", fecha: utc(ANIO, 6, 1), pond: 20 },
  ];
  const evalsSem2 = [
    { nombre: "Prueba unidad 3", fecha: utc(ANIO, 7, 12), pond: 25 },
    { nombre: "Disertación", fecha: utc(ANIO, 8, 9), pond: 25 },
  ];
  const califRows: { colegioId: string; evaluacionId: string; estudianteId: string; nota: number | null; eximida: boolean; registradoPorId: string }[] = [];
  for (const asig of asignaturas) {
    const habPorEst = new Map(estFull.filter((e) => e.cursoId === asig.cursoId).map((e) => [e.id, e.habilidad]));
    for (const ev of evalsSem1) {
      const created = await prisma.evaluacion.create({
        data: { colegioId, asignaturaId: asig.id, nombre: ev.nombre, tipo: "SUMATIVA", ponderacion: ev.pond, periodo: 1, fecha: ev.fecha },
      });
      for (const estId of asig.estIds) {
        const hab = habPorEst.get(estId) ?? 5;
        const eximida = rnd() < 0.02;
        const nota = eximida ? null : clampNota(hab + gauss() * 0.7);
        califRows.push({ colegioId, evaluacionId: created.id, estudianteId: estId, nota, eximida, registradoPorId: asig.docenteId });
      }
    }
    for (const ev of evalsSem2) {
      await prisma.evaluacion.create({
        data: { colegioId, asignaturaId: asig.id, nombre: ev.nombre, tipo: "SUMATIVA", ponderacion: ev.pond, periodo: 2, fecha: ev.fecha },
      });
      // sin calificaciones (evaluación futura)
    }
  }
  await chunked(califRows, (c) => prisma.calificacion.createMany({ data: c }));

  // ── Asistencia: días hábiles del semestre 1 (mar–jul) ──────────────────────
  const diasHabiles: Date[] = [];
  for (let d = utc(ANIO, 2, 2); d <= utc(ANIO, 6, 10); d = new Date(d.getTime() + 86400000)) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) diasHabiles.push(new Date(d));
  }
  type EstadoAsis = "PRESENTE" | "AUSENTE" | "ATRASADO" | "RETIRADO";
  const asisRows: { colegioId: string; estudianteId: string; fecha: Date; estado: EstadoAsis; registradoPorId: string }[] = [];
  const jefePorCurso = new Map(cursos.map((c) => [c.id, c.jefeId]));
  for (const e of estFull) {
    const regId = jefePorCurso.get(e.cursoId)!;
    for (const fecha of diasHabiles) {
      const r = rnd();
      let estado: EstadoAsis;
      if (r < e.asisRate) estado = "PRESENTE";
      else if (r < e.asisRate + 0.05) estado = "ATRASADO";
      else if (r < e.asisRate + 0.09) estado = "AUSENTE";
      else estado = r < e.asisRate + 0.1 ? "RETIRADO" : "AUSENTE";
      asisRows.push({ colegioId, estudianteId: e.id, fecha, estado, registradoPorId: regId });
    }
  }
  await chunked(asisRows, (c) => prisma.asistenciaDiaria.createMany({ data: c }));

  // ── Anotaciones ─────────────────────────────────────────────────────────────
  const anotRows: { colegioId: string; estudianteId: string; tipo: "POSITIVA" | "NEGATIVA" | "NEUTRA"; categoria: string; texto: string; fechaHecho: Date; autorId: string }[] = [];
  for (const e of estFull) {
    const cuantas = rnd() < 0.4 ? 1 + Math.floor(rnd() * 2) : 0;
    for (let a = 0; a < cuantas; a++) {
      const positiva = rnd() < 0.62;
      const [texto, categoria] = positiva ? pick(ANOT_POS) : pick(ANOT_NEG);
      anotRows.push({
        colegioId,
        estudianteId: e.id,
        tipo: positiva ? "POSITIVA" : "NEGATIVA",
        categoria,
        texto,
        fechaHecho: pick(diasHabiles),
        autorId: jefePorCurso.get(e.cursoId)!,
      });
    }
  }
  await chunked(anotRows, (c) => prisma.anotacion.createMany({ data: c }));

  // ── Catálogo de OA (referencia global) — debe existir ANTES de las
  // planificaciones que lo referencian (FK oaCodigo). ─────────────────────────
  for (const oa of OA_SEED) {
    await prisma.oa.upsert({
      where: { codigo: oa.codigo },
      update: { asignatura: oa.asignatura, nivel: oa.nivel, numero: oa.numero, eje: oa.eje, descripcion: oa.descripcion },
      create: oa,
    });
  }

  // ── Planificaciones con OA + clases firmadas (cobertura curricular) ─────────
  // Solo para Lenguaje/Matemática de básica (donde hay OA en el catálogo).
  const oaPorNivelAsig = (nivel: string, asignatura: string) =>
    OA_SEED.filter((o) => o.nivel === nivel && o.asignatura === asignatura).slice(0, 6).map((o) => o.codigo);
  const asigParaPlan = asignaturas.filter(
    (a) => !a.media && (a.nombre === "Lenguaje y Comunicación" || a.nombre === "Matemática")
  );
  for (const asig of asigParaPlan) {
    const codigos = oaPorNivelAsig(asig.nivel, asig.nombre);
    if (codigos.length === 0) continue;
    const unidad = await prisma.planificacion.create({
      data: {
        colegioId,
        asignaturaId: asig.id,
        tipo: "UNIDAD",
        titulo: `Unidad 1 · ${asig.nombre}`,
        descripcion: "Primera unidad del semestre.",
        fechaInicio: utc(ANIO, 2, 2),
        fechaFin: utc(ANIO, 4, 30),
        autorId: asig.docenteId,
      },
    });
    await prisma.planificacionOa.createMany({
      data: codigos.map((c) => ({ planificacionId: unidad.id, oaCodigo: c })),
    });
    // Clases firmadas cubriendo los primeros OA (para % de cobertura).
    for (let i = 0; i < Math.min(codigos.length, 4); i++) {
      await prisma.claseRegistrada.create({
        data: {
          colegioId,
          asignaturaId: asig.id,
          fecha: diasHabiles[i * 5] ?? diasHabiles[0],
          contenido: `Clase ${i + 1}: trabajo del objetivo ${codigos[i]}.`,
          oaIds: [codigos[i]],
          firmadaPorId: asig.docenteId,
          firmadaEn: new Date(),
        },
      });
    }
  }

  // ── Comunicados + confirmación de lectura ──────────────────────────────────
  const director = await prisma.usuario.findFirst({ where: { email: "director@demo.cl" }, select: { id: true } });
  const autorCom = director?.id ?? profes[0].id;
  const curso5 = cursos.find((c) => c.nivel === "5B")!;
  const comunicadosDef = [
    { titulo: "Reunión de apoderados — primer semestre", cuerpo: "Estimadas familias:\n\nLes invitamos a la reunión de apoderados el jueves a las 19:00 hrs en el aula de cada curso. Se tratarán los avances del semestre y actividades del segundo semestre.\n\nSaludos cordiales,\nDirección.", alcance: "COLEGIO" as const, nivel: null, cursoId: null },
    { titulo: "Salida pedagógica 5° básico", cuerpo: "El 5° básico realizará una salida pedagógica al Museo de Historia Natural. Se requiere autorización firmada y colación. Más detalles con el profesor jefe.", alcance: "NIVEL" as const, nivel: "5B", cursoId: null },
    { titulo: "Cambio de horario 6°A", cuerpo: "Por reunión técnica, el 6°A tendrá salida anticipada el próximo viernes a las 13:00 hrs. Agradecemos coordinar el retiro.", alcance: "CURSO" as const, nivel: null, cursoId: cursos.find((c) => c.nivel === "6B")!.id },
  ];
  // Apoderados demo (2 primeros estudiantes de 5°A y 6°A).
  const est5 = estFull.filter((e) => e.cursoId === curso5.id);
  const est6 = estFull.filter((e) => e.cursoId === cursos.find((c) => c.nivel === "6B")!.id);
  const apoData = [
    { rut: 16111111, nombre: "Claudia Rojas", email: "apoderado1@demo.cl", est: est5[0], parentesco: "madre", calidad: CalidadApoderado.TITULAR },
    { rut: 16222222, nombre: "Sergio Díaz", email: "apoderado2@demo.cl", est: est6[0], parentesco: "padre", calidad: CalidadApoderado.TITULAR },
    { rut: 16333333, nombre: "Verónica Soto", email: "apoderado3@demo.cl", est: est5[1], parentesco: "madre", calidad: CalidadApoderado.TITULAR },
  ];
  const apoderados = [];
  for (const a of apoData) {
    const u = await crearUsuario(a.rut, a.nombre, a.email, Rol.APODERADO);
    const vinculo = await prisma.apoderado.create({
      data: {
        usuarioId: u.id,
        estudianteId: a.est.id,
        parentesco: a.parentesco,
        calidad: a.calidad,
      },
      select: { id: true },
    });
    apoderados.push({ ...a, usuarioId: u.id, apoderadoId: vinculo.id });
  }
  for (let i = 0; i < comunicadosDef.length; i++) {
    const def = comunicadosDef[i];
    const com = await prisma.comunicado.create({
      data: { colegioId, autorId: autorCom, titulo: def.titulo, cuerpo: def.cuerpo, alcance: def.alcance, nivel: def.nivel, cursoId: def.cursoId, creadoEn: utc(ANIO, 5, 20 + i) },
    });
    // Destinatarios: apoderados cuyo pupilo cae en el alcance.
    for (const apo of apoderados) {
      const enAlcance =
        def.alcance === "COLEGIO" ||
        (def.alcance === "NIVEL" && apo.est.nivel === def.nivel) ||
        (def.alcance === "CURSO" && apo.est.cursoId === def.cursoId);
      if (!enAlcance) continue;
      await prisma.comunicadoDestinatario.create({
        data: {
          comunicadoId: com.id,
          colegioId,
          apoderadoUsuarioId: apo.usuarioId,
          estudianteId: apo.est.id,
          leidoEn: rnd() < 0.5 ? utc(ANIO, 5, 22 + i) : null,
        },
      });
    }
  }

  // ── Entrevistas ─────────────────────────────────────────────────────────────
  const entrevistasDef = [
    { est: est5[0], apoderado: "Claudia Rojas", motivo: "Rendimiento en Matemática", acuerdos: "Reforzar tareas en casa y revisar cuaderno semanalmente.", compromisos: "La apoderada revisará las tareas; el colegio enviará guías de apoyo.", proxima: utc(ANIO, 7, 10) },
    { est: est6[0], apoderado: "Sergio Díaz", motivo: "Atrasos reiterados", acuerdos: "Ajustar rutina matinal para llegar puntual.", compromisos: "Ingreso antes de las 08:00 durante dos semanas.", proxima: null },
    { est: est5[1], apoderado: "Verónica Soto", motivo: "Felicitaciones por participación", acuerdos: "Mantener el buen desempeño y postular a la academia de lenguaje.", compromisos: null, proxima: null },
  ];
  for (const e of entrevistasDef) {
    const vinculo = apoderados.find(
      (apoderado) => apoderado.nombre === e.apoderado && apoderado.est.id === e.est.id,
    );
    await prisma.entrevista.create({
      data: {
        colegioId,
        estudianteId: e.est.id,
        apoderado: e.apoderado,
        apoderadoId: vinculo?.apoderadoId,
        calidadSnapshot: vinculo
          ? `${vinculo.calidad === CalidadApoderado.TITULAR ? "Titular" : vinculo.calidad === CalidadApoderado.SUPLENTE ? "Suplente" : "Por confirmar"} · ${vinculo.parentesco}`
          : "Registro manual",
        motivo: e.motivo,
        acuerdos: e.acuerdos,
        compromisos: e.compromisos,
        fecha: utc(ANIO, 5, 15),
        proximaCita: e.proxima,
        autorId: jefePorCurso.get(e.est.cursoId)!,
      },
    });
  }

  console.log("✅ Seed demo listo.");
  console.log(`   Colegio: ${colegio.nombre}`);
  console.log(`   Cursos: ${cursos.length} · Estudiantes: ${estFull.length}`);
  console.log(`   Asistencia: ${asisRows.length} registros · Calificaciones: ${califRows.length}`);
  console.log(`   Anotaciones: ${anotRows.length} · OA: ${OA_SEED.length}`);
  console.log("   Logins (demo1234): admin@ / director@ / utp@ / inspector@ / cvargas@ / rparedes@ / driquelme@ / apoderado1@ · @demo.cl");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
