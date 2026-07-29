import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { ToggleAviso, ToggleConfig } from "./toggle-cliente";
import { actualizarIndicadorPie } from "./actions";
import { IdentidadColegio } from "./identidad-cliente";

export default async function ConfiguracionPage() {
  const { user } = await requerirRol("ADMIN", "DIRECTOR");

  const colegio = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: {
      notifsApoderadoHabilitada: true,
      indicadorPieDocentes: true,
      logoUrl: true,
      colorMarca: true,
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        icono="ajustes"
        titulo="Configuración"
        descripcion="Ajustes del establecimiento"
      />

      <div className="superficie rounded-xl p-5">
        <p className="font-semibold text-tinta">Identidad del colegio</p>
        <p className="mb-4 mt-1 text-sm text-tinta-suave">
          El logo aparece en la barra lateral y el color de marca tiñe la interfaz
          para toda tu comunidad.
        </p>
        <IdentidadColegio
          logoInicial={colegio?.logoUrl ?? null}
          colorInicial={colegio?.colorMarca ?? null}
        />
      </div>

      <div className="superficie mt-4 flex items-start justify-between gap-4 rounded-xl p-5">
        <div className="min-w-0">
          <p className="font-semibold text-tinta">Aviso automático a apoderados</p>
          <p className="mt-1 text-sm text-tinta-suave">
            Cuando un profesor publica una calificación, los apoderados del
            estudiante reciben un aviso en su portal (campana) y por correo, sin
            que el profesor haga nada. El correo no incluye la nota: se ve en la
            plataforma.
          </p>
        </div>
        <ToggleAviso inicial={colegio?.notifsApoderadoHabilitada ?? true} />
      </div>

      <div className="superficie mt-4 flex items-start justify-between gap-4 rounded-xl p-5">
        <div className="min-w-0">
          <p className="font-semibold text-tinta">Indicador de PIE para docentes</p>
          <p className="mt-1 text-sm text-tinta-suave">
            Muestra al equipo docente del curso una señal <strong>discreta</strong> de
            que un estudiante participa en el Programa de Integración Escolar, para
            adecuar la enseñanza (Decreto 170). Nunca revela el diagnóstico ni la
            categoría de NEE: eso sigue restringido al equipo PIE y la dirección.
            Desactivado por defecto (Ley 21.719).
          </p>
        </div>
        <ToggleConfig
          inicial={colegio?.indicadorPieDocentes ?? false}
          accion={actualizarIndicadorPie}
        />
      </div>
    </div>
  );
}
