import { signOut } from "@/lib/auth";
import { Isotipo } from "@/components/ui/isotipo";

async function salir() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default function AccesoRevocadoPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-fondo p-5">
      <section className="w-full max-w-md rounded-3xl border border-borde bg-superficie p-7 text-center shadow-elevada">
        <Isotipo className="mx-auto h-12 w-12" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-marca-700">Acceso protegido</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-tinta">Tu perfil escolar ya no está activo</h1>
        <p className="mt-3 text-sm leading-6 text-tinta-suave">
          No se mostrará información del colegio. Si crees que se trata de un error, solicita a su administración que revise tu acceso.
        </p>
        <form action={salir} className="mt-6">
          <button type="submit" className="min-h-11 w-full rounded-xl bg-marca-600 px-4 text-sm font-semibold text-white hover:bg-marca-700">
            Cerrar sesión
          </button>
        </form>
      </section>
    </main>
  );
}
