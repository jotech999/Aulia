import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import { estaBloqueado, registrarFallo, limpiarIntentos } from "./rate-limit";

const credencialesSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/** ¿Está configurado el SSO con Google? (opcional: sin credenciales queda oculto). */
export function googleDisponible(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Usuario + primera membresía activa, por email (para credenciales y SSO). */
async function usuarioConMembresia(email: string) {
  return prisma.usuario.findUnique({
    where: { email },
    include: {
      membresias: {
        where: { activa: true },
        include: { colegio: true },
        orderBy: { creadaEn: "asc" },
      },
    },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = credencialesSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        // Defensa contra fuerza bruta: bloqueo temporal tras varios fallos.
        if (await estaBloqueado(email)) return null;

        const usuario = await usuarioConMembresia(email);
        if (!usuario || !usuario.activo) {
          await registrarFallo(email);
          return null;
        }

        const ok = await bcrypt.compare(parsed.data.password, usuario.passwordHash);
        if (!ok) {
          await registrarFallo(email);
          return null;
        }

        const membresia = usuario.membresias[0];
        if (!membresia) {
          await registrarFallo(email);
          return null; // sin colegio asignado no hay acceso
        }

        await limpiarIntentos(email);

        return {
          id: usuario.id,
          name: usuario.nombre,
          email: usuario.email,
          rol: membresia.rol,
          colegioId: membresia.colegioId,
          colegioNombre: membresia.colegio.nombre,
          membresiaId: membresia.id,
        };
      },
    }),
    // SSO con Google (Workspace del colegio). SOLO inicia sesión: jamás crea
    // cuentas nuevas — el email debe existir como Usuario activo con membresía.
    ...(googleDisponible()
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Sin acceso offline ni scopes extra: solo identidad (email verificado).
            authorization: { params: { prompt: "select_account" } },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      // Solo emails verificados por Google y ya registrados por el colegio.
      const verificado = (profile as { email_verified?: boolean } | null)?.email_verified;
      if (verificado === false) return false;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const usuario = await usuarioConMembresia(email);
      return Boolean(usuario?.activo && usuario.membresias[0]);
    },
    async jwt({ token, user, account }) {
      // SSO Google: los datos de rol/colegio salen de NUESTRA base, no del perfil.
      if (account?.provider === "google" && token.email) {
        const usuario = await usuarioConMembresia(token.email.toLowerCase());
        const membresia = usuario?.membresias[0];
        if (usuario && membresia) {
          token.id = usuario.id;
          token.name = usuario.nombre;
          token.rol = membresia.rol;
          token.colegioId = membresia.colegioId;
          token.colegioNombre = membresia.colegio.nombre;
          token.membresiaId = membresia.id;
        }
        return token;
      }
      if (user) {
        token.id = user.id;
        token.rol = user.rol;
        token.colegioId = user.colegioId;
        token.colegioNombre = user.colegioNombre;
        token.membresiaId = user.membresiaId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.rol = token.rol as string;
      session.user.colegioId = token.colegioId as string;
      session.user.colegioNombre = token.colegioNombre as string;
      session.user.membresiaId = token.membresiaId as string;
      return session;
    },
  },
});
