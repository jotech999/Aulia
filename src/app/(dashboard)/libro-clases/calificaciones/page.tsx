import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import {
  esNivelPrebasica,
  calcularPromedio,
  promedioGeneral,
  NOTA_APROBACION,
  type ItemPromedio,
} from "@/lib/calificaciones";
import { isoDesdeFecha } from "@/lib/fecha";
import {
  whereAsignaturasAccesibles,
  periodosDeRegimen,
  etiquetaPeriodo,
} from "./consultas";
import { Libreta } from "./libreta";
import { AnalisisCursoIA } from "./analisis-ia-cliente";
import { iaDisponible } from "@/lib/ia/cliente";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { Histograma } from "@/components/ui/graficos";
import { DensidadToggle } from "@/components/ui/densidad-toggle";
import { leerDensidad } from "@/lib/densidad-servidor";
import { colorAsignatura } from "@/lib/colores-asignatura";
import { nombreCurso } from "@/lib/cursos";


export default async function CalificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ asignaturaId?: string; periodo?: string }>;
}) {
  const { user } = await requerirSesion();
  const sp = await searchParams;

  const asignaturas = await prisma.asignatura.findMany({
    where: whereAsignaturasAccesibles(user),
    select: {
      id: true,
      nombre: true,
      color: true,
      curso: {
        select: {
          nivel: true,
          letra: true,
          anioEscolar: { select: { regimen: true } },
        },
      },
    },
    orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
  });

  const asignaturaSel = sp.asignaturaId
    ? asignaturas.find((a) => a.id === sp.asignaturaId)
    : undefined;

  // ── Sin asignatura: selector ──────────────────────────────────────────
  if (!asignaturaSel) {
    return (
      <div>
        <EncabezadoPagina
          icono="calificaciones"
          titulo="Libreta de notas"
          descripcion="Elige una asignatura para registrar sus calificaciones."
        />

        {asignaturas.length === 0 ? (
          <EstadoVacio
            icono="calificaciones"
            titulo="Sin asignaturas asignadas"
            descripcion="Cuando tengas asignaturas a cargo, aquí podrás ingresar sus notas."
          />
        ) : (
          <ul className="surgir-secuencia grid gap-2 sm:grid-cols-2">
            {asignaturas.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/libro-clases/calificaciones?asignaturaId=${a.id}`}
                  className="superficie tarjeta-int group flex items-center justify-between rounded-xl p-4"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorAsignatura(a.nombre, a.color).punto}`}
                      aria-hidden
                    />
                    <span className="font-semibold text-tinta">{a.nombre}</span>
                    <span className="ml-1 text-sm text-tinta-suave">
                      {nombreCurso(a.curso)}
                    </span>
                  </span>
                  <span
                    className="text-tinta-tenue transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── Prebásica: no aplica libreta numérica ─────────────────────────────
  if (esNivelPrebasica(asignaturaSel.curso.nivel)) {
    return (
      <div>
        <EncabezadoPagina
          icono="calificaciones"
          titulo={`${asignaturaSel.nombre} · ${nombreCurso(asignaturaSel.curso)}`}
          volver={{ href: "/libro-clases/calificaciones", etiqueta: "Cambiar asignatura" }}
        />
        <div className="rounded-xl border-l-2 border-alerta bg-alerta-suave p-5 text-sm text-alerta">
          La educación prebásica (NT1/NT2) se evalúa por logro de objetivos con
          conceptos (L/ML/NL), no con la escala numérica 1.0–7.0. Esta libreta no
          aplica para este nivel.
        </div>
      </div>
    );
  }

  const densidad = await leerDensidad();
  const regimen = asignaturaSel.curso.anioEscolar.regimen;
  const periodos = periodosDeRegimen(regimen);
  const periodoSel = periodos.includes(Number(sp.periodo))
    ? Number(sp.periodo)
    : periodos[0];

  // Estudiantes con matrícula ACTIVA en el curso de la asignatura.
  const matriculas = await prisma.matricula.findMany({
    where: {
      curso: { asignaturas: { some: { id: asignaturaSel.id } } },
      colegioId: user.colegioId,
      estado: "ACTIVA",
    },
    select: {
      estudiante: { select: { id: true, nombres: true, apellidos: true } },
    },
    orderBy: { estudiante: { apellidos: "asc" } },
  });
  const estudiantes = matriculas.map((m) => ({
    id: m.estudiante.id,
    nombre: `${m.estudiante.apellidos}, ${m.estudiante.nombres}`,
  }));

  const evaluaciones = await prisma.evaluacion.findMany({
    where: {
      asignaturaId: asignaturaSel.id,
      colegioId: user.colegioId,
      periodo: periodoSel,
      eliminadaEn: null,
    },
    select: {
      id: true,
      nombre: true,
      tipo: true,
      ponderacion: true,
      fecha: true,
    },
    orderBy: [{ fecha: "asc" }, { creadaEn: "asc" }],
  });

  const calificaciones = await prisma.calificacion.findMany({
    where: {
      colegioId: user.colegioId,
      eliminadaEn: null,
      evaluacionId: { in: evaluaciones.map((e) => e.id) },
      estudianteId: { in: estudiantes.map((e) => e.id) },
    },
    select: { evaluacionId: true, estudianteId: true, nota: true, eximida: true },
  });

  // ── Distribución de notas del periodo (promedio ponderado por estudiante) ──
  const sumativas = evaluaciones.filter((e) => e.tipo === "SUMATIVA");
  const promedios = estudiantes
    .map((e) => {
      const items: ItemPromedio[] = sumativas.map((ev) => {
        const cal = calificaciones.find(
          (c) => c.evaluacionId === ev.id && c.estudianteId === e.id
        );
        return {
          nota: cal?.eximida ? null : cal?.nota ?? null,
          ponderacion: ev.ponderacion,
          computa: !cal?.eximida,
        };
      });
      return calcularPromedio(items).promedio;
    })
    .filter((p): p is number => p !== null);

  const promedioCurso = promedioGeneral(promedios);
  const aprobados = promedios.filter((n) => n >= NOTA_APROBACION).length;
  const reprobados = promedios.length - aprobados;
  // Bandas de notas (rampa con significado: reprobado en peligro → excelente en
  // verde marca), sobre tokens del design system.
  const bandas = [
    { label: "1.0–3.9", valor: promedios.filter((n) => n < 4).length, color: "var(--color-peligro)" },
    { label: "4.0–4.9", valor: promedios.filter((n) => n >= 4 && n < 5).length, color: "var(--color-alerta)" },
    { label: "5.0–5.9", valor: promedios.filter((n) => n >= 5 && n < 6).length, color: "var(--color-marca-400)" },
    { label: "6.0–7.0", valor: promedios.filter((n) => n >= 6).length, color: "var(--color-marca-600)" },
  ];

  const periodoNav = periodos.length > 1 && (
    <nav className="segmentado">
      {periodos.map((p) => (
        <Link
          key={p}
          href={`/libro-clases/calificaciones?asignaturaId=${asignaturaSel.id}&periodo=${p}`}
          data-activo={p === periodoSel ? "true" : "false"}
          aria-current={p === periodoSel ? "page" : undefined}
        >
          {etiquetaPeriodo(regimen, p)}
        </Link>
      ))}
    </nav>
  );

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo={asignaturaSel.nombre}
        descripcion={`${nombreCurso(asignaturaSel.curso)} · ${estudiantes.length} estudiantes`}
        volver={{ href: "/libro-clases/calificaciones", etiqueta: "Cambiar asignatura" }}
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <DensidadToggle densidad={densidad} />
            {periodoNav}
          </div>
        }
      />

      {estudiantes.length === 0 ? (
        <EstadoVacio
          icono="estudiantes"
          titulo="Sin estudiantes activos"
          descripcion="Este curso no tiene estudiantes con matrícula activa."
        />
      ) : (
        <>
          {promedios.length > 0 && (
            <section className="surgir-secuencia mb-4 grid gap-3 lg:grid-cols-3">
              <div className="superficie superficie-realce acento-superior flex flex-col justify-center rounded-xl p-5">
                <p className="text-sm text-tinta-suave">Promedio del curso</p>
                <p
                  className={`mt-1 font-display text-4xl font-bold tabular-nums ${
                    promedioCurso !== null && promedioCurso >= NOTA_APROBACION
                      ? "text-exito"
                      : "text-peligro"
                  }`}
                >
                  {promedioCurso !== null ? promedioCurso.toFixed(1) : "—"}
                </p>
                <p className="mt-1 text-xs text-tinta-tenue">
                  {aprobados} aprobados · {reprobados} reprobados
                </p>
              </div>
              <div className="superficie flex flex-col rounded-xl p-5 lg:col-span-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-tinta-suave">
                    Distribución de promedios
                  </h2>
                  <span className="text-xs text-tinta-tenue">
                    {promedios.length} con nota
                  </span>
                </div>
                <div className="mt-1">
                  <Histograma
                    datos={bandas}
                    alto={170}
                    etiqueta={`Distribución de promedios de ${asignaturaSel.nombre}: ${bandas
                      .map((b) => `${b.label} ${b.valor}`)
                      .join(", ")}`}
                  />
                </div>
              </div>
            </section>
          )}

          <Libreta
            asignaturaId={asignaturaSel.id}
            periodo={periodoSel}
            densidad={densidad}
            estudiantes={estudiantes}
            evaluaciones={evaluaciones.map((e) => ({
              id: e.id,
              nombre: e.nombre,
              tipo: e.tipo as "SUMATIVA" | "FORMATIVA",
              ponderacion: e.ponderacion,
              fecha: isoDesdeFecha(e.fecha),
            }))}
            calificaciones={calificaciones.map((c) => ({
              evaluacionId: c.evaluacionId,
              estudianteId: c.estudianteId,
              nota: c.nota,
              eximida: c.eximida,
            }))}
          />

          {iaDisponible() && promedios.length > 0 && (
            <AnalisisCursoIA asignaturaId={asignaturaSel.id} />
          )}
        </>
      )}
    </div>
  );
}
