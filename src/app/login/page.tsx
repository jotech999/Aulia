import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn, googleDisponible } from "@/lib/auth";
import { Boton } from "@/components/ui/boton";
import { Isotipo } from "@/components/ui/isotipo";

async function iniciarSesion(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").toLowerCase(),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error; // los redirects de Next.js también lanzan — repropagar
  }
}

async function iniciarConGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/dashboard" });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (sesion?.user) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Panel cinematográfico — decorativo, sin información esencial dentro */}
      <section className="encabezado-cine malla-academica estrellas relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <span className="aurora-luz aurora-luz-1" aria-hidden />
        <span className="aurora-luz aurora-luz-2" aria-hidden />
        <span className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-acento/60 to-transparent" aria-hidden />
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2.5 text-white transition-opacity hover:opacity-90"
        >
          <Isotipo tono="claro" className="h-9 w-9" />
          <span className="font-display text-lg font-bold tracking-tight">Aulia</span>
        </Link>

        <div className="max-w-md">
          <span className="insignia bg-white/10 text-white/80 ring-1 ring-white/15">
            Plataforma escolar chilena
          </span>
          <h2 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-white">
            El libro de clases, por fin rápido y claro.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">
            Asistencia, calificaciones y comunicación en una plataforma pensada
            para el día a día del profesor. Ordenada, moderna y hecha para
            colegios chilenos.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-4 border-t border-white/15 pt-6 text-white/80">
          {[
            ["Circular 30", "Libro digital"],
            ["Decreto 67", "Evaluación"],
            ["SIGE", "Compatible"],
          ].map(([valor, etiqueta]) => (
            <div key={valor}>
              <dt className="font-display text-base font-semibold text-white">
                {valor}
              </dt>
              <dd className="text-xs text-white/60">{etiqueta}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Formulario sobrio — fondo simple, acción principal destacada */}
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="animar-surgir w-full max-w-sm">
          <div className="lg:hidden">
            <p className="font-display text-xl font-bold tracking-tight text-marca-700">
              Aulia
            </p>
          </div>

          <h1 className="mt-6 font-display text-2xl font-bold tracking-tight lg:mt-0">
            Inicia sesión
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Ingresa con tu cuenta del establecimiento.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-peligro/20 bg-peligro-suave px-3 py-2.5 text-sm font-medium text-peligro"
            >
              {error === "AccessDenied"
                ? "Tu cuenta de Google no está registrada en ningún colegio. Pide a la dirección que te registre con ese correo."
                : "Correo o contraseña incorrectos."}
            </p>
          )}

          {googleDisponible() && (
            <>
              <form action={iniciarConGoogle} className="mt-6">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm font-semibold text-tinta transition hover:border-marca-500 hover:bg-superficie-2"
                >
                  {/* Logo de Google */}
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Continuar con Google
                </button>
              </form>

              <div className="mt-5 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-borde" />
                <span className="text-xs text-tinta-tenue">o con tu contraseña</span>
                <span className="h-px flex-1 bg-borde" />
              </div>
            </>
          )}

          <form action={iniciarSesion} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                className="mt-1.5 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
                placeholder="profesor@colegio.cl"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1.5 w-full rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
              />
            </div>
            <Boton type="submit" className="w-full">
              Ingresar
            </Boton>
          </form>

          <p className="mt-6 rounded-lg bg-superficie-3 px-3 py-2 text-xs text-tinta-tenue">
            Demo: admin@demo.cl / demo1234
          </p>
        </div>
      </section>
    </main>
  );
}
