import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { enviarPostulacion } from "./actions";

export const metadata = { title: "Postulación de admisión" };

const campo =
  "mt-1.5 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";
const etiqueta = "block text-sm font-medium text-tinta";

/**
 * Formulario PÚBLICO de postulación (sin sesión). El colegio comparte este
 * enlace en su web o redes; las postulaciones llegan a la bandeja de admisión.
 */
export default async function PostulacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ colegioId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { colegioId } = await params;
  const sp = await searchParams;

  const colegio = await prisma.colegio.findUnique({
    where: { id: colegioId },
    select: { nombre: true, comuna: true, logoUrl: true },
  });
  if (!colegio) notFound();

  const logo = colegio.logoUrl?.startsWith("https://") ? colegio.logoUrl : null;

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <header className="text-center">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="mx-auto h-16 w-16 rounded-xl object-contain" />
        )}
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-tinta">
          Postulación de admisión
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">
          {colegio.nombre}
          {colegio.comuna ? ` · ${colegio.comuna}` : ""}
        </p>
      </header>

      {sp.ok ? (
        <div className="mt-8 rounded-xl border border-exito/30 bg-exito-suave p-6 text-center">
          <p className="text-3xl" aria-hidden>✅</p>
          <h2 className="mt-2 font-display text-lg font-bold text-tinta">
            ¡Postulación recibida!
          </h2>
          <p className="mt-1 text-sm text-tinta-suave">
            El colegio revisará la información y se contactará contigo al correo
            indicado. No necesitas hacer nada más por ahora.
          </p>
        </div>
      ) : (
        <>
          {sp.error && (
            <p role="alert" className="mt-6 rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2.5 text-sm font-medium text-peligro">
              {sp.error}
            </p>
          )}

          <form action={enviarPostulacion} className="mt-6 space-y-4">
            <input type="hidden" name="colegioId" value={colegioId} />
            {/* Honeypot invisible anti-bots (dejar vacío) */}
            <input
              type="text"
              name="sitioWeb"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            <fieldset className="space-y-4 rounded-xl border border-borde bg-superficie p-4">
              <legend className="px-1 text-sm font-semibold text-tinta">Estudiante</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={etiqueta}>
                  Nombres
                  <input name="nombres" required maxLength={80} className={campo} />
                </label>
                <label className={etiqueta}>
                  Apellidos
                  <input name="apellidos" required maxLength={80} className={campo} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={etiqueta}>
                  Fecha de nacimiento <span className="font-normal text-tinta-tenue">(opcional)</span>
                  <input name="fechaNacimiento" type="date" className={campo} />
                </label>
                <label className={etiqueta}>
                  Curso al que postula
                  <input
                    name="nivelSolicitado"
                    required
                    maxLength={60}
                    placeholder="Ej: 1° Básico 2027"
                    className={campo}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-4 rounded-xl border border-borde bg-superficie p-4">
              <legend className="px-1 text-sm font-semibold text-tinta">Apoderado/a de contacto</legend>
              <label className={etiqueta}>
                Nombre completo
                <input name="apoderadoNombre" required maxLength={120} className={campo} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={etiqueta}>
                  Correo electrónico
                  <input name="email" type="email" required maxLength={160} className={campo} />
                </label>
                <label className={etiqueta}>
                  Teléfono <span className="font-normal text-tinta-tenue">(opcional)</span>
                  <input name="telefono" type="tel" maxLength={20} placeholder="+56 9 …" className={campo} />
                </label>
              </div>
              <label className={etiqueta}>
                Comentario <span className="font-normal text-tinta-tenue">(opcional)</span>
                <textarea
                  name="comentario"
                  rows={3}
                  maxLength={1000}
                  placeholder="Cuéntanos lo que consideres relevante"
                  className={campo}
                />
              </label>
            </fieldset>

            <button type="submit" className="btn btn-primario w-full">
              Enviar postulación
            </button>
            <p className="text-center text-xs text-tinta-tenue">
              Tus datos se usan solo para el proceso de admisión de {colegio.nombre}
              (Ley 21.719). No incluyas información de salud ni datos sensibles.
            </p>
          </form>
        </>
      )}
    </main>
  );
}
