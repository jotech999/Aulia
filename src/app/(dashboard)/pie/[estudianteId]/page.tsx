import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { descifrarSeguro, cifradoDisponible } from "@/lib/cifrado";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Iconos } from "@/components/ui/iconos";
import { FormularioFicha, FormularioSesion } from "./formularios-cliente";

const fmtDia = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(d);

export default async function FichaPiePage({
  params,
}: {
  params: Promise<{ estudianteId: string }>;
}) {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "PIE");
  const { estudianteId } = await params;

  const estudiante = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: user.colegioId }, // multi-tenant
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { curso: { select: { nivel: true, letra: true } } },
        take: 1,
      },
    },
  });
  if (!estudiante) notFound();

  const ficha = await prisma.fichaPie.findFirst({
    where: { estudianteId, colegioId: user.colegioId, eliminadaEn: null }, // defensa en profundidad multi-tenant
    select: {
      diagnosticoCifrado: true,
      apoyos: true,
      profesionalACargo: true,
      actualizadaEn: true,
      sesiones: {
        where: { eliminadaEn: null },
        orderBy: { fecha: "desc" },
        select: { id: true, fecha: true, asistio: true, observacion: true, autorId: true },
      },
    },
  });

  const sesiones = ficha?.sesiones ?? [];
  const autores = sesiones.length
    ? await prisma.usuario.findMany({
        where: { id: { in: [...new Set(sesiones.map((s) => s.autorId))] } },
        select: { id: true, nombre: true },
      })
    : [];
  const nombreAutor = new Map(autores.map((a) => [a.id, a.nombre]));

  const curso = estudiante.matriculas[0]?.curso;
  const diagnostico = ficha ? descifrarSeguro(ficha.diagnosticoCifrado) : "";

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        icono="candado"
        titulo={`${estudiante.nombres} ${estudiante.apellidos}`}
        descripcion={`Ficha PIE${curso ? ` · ${curso.nivel} ${curso.letra}` : ""} — información confidencial`}
        volver={{ href: "/pie", etiqueta: "Registros PIE" }}
      />

      <p className="mb-4 flex items-start gap-2 rounded-lg border-l-2 border-alerta bg-alerta-suave px-3 py-2.5 text-xs text-alerta">
        <span className="mt-px shrink-0">
          <Iconos.candado className="h-4 w-4" />
        </span>
        <span>
          <strong className="font-semibold">Dato de máxima sensibilidad</strong> (Ley
          21.719). Acceso registrado en auditoría. El diagnóstico se guarda cifrado.
        </span>
      </p>

      {!cifradoDisponible() ? (
        <p className="superficie rounded-xl px-5 py-6 text-sm text-peligro">
          El cifrado PIE no está configurado. No es posible ver ni editar la ficha.
        </p>
      ) : (
        <>
          <FormularioFicha
            estudianteId={estudiante.id}
            inicial={{
              diagnostico,
              apoyos: ficha?.apoyos ?? "",
              profesionalACargo: ficha?.profesionalACargo ?? "",
            }}
            existe={Boolean(ficha)}
          />

          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Seguimiento de sesiones
            </h2>
            {ficha ? (
              <div className="mt-3">
                <FormularioSesion estudianteId={estudiante.id} />
              </div>
            ) : (
              <p className="superficie mt-3 rounded-xl px-5 py-4 text-sm text-tinta-suave">
                Crea la ficha para registrar sesiones.
              </p>
            )}

            {sesiones.length > 0 && (
              <ul className="mt-3 space-y-2">
                {sesiones.map((s) => (
                  <li key={s.id} className="superficie rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-tinta">{fmtDia(s.fecha)}</span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                          s.asistio ? "bg-exito-suave text-exito" : "bg-peligro-suave text-peligro"
                        }`}
                      >
                        {s.asistio ? "Asistió" : "No asistió"}
                      </span>
                    </div>
                    {s.observacion && (
                      <p className="mt-1.5 text-sm text-tinta-suave">{s.observacion}</p>
                    )}
                    <p className="mt-1 text-[11px] text-tinta-tenue">
                      Registró: {nombreAutor.get(s.autorId) ?? "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
