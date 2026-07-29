import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    rol: string;
    colegioId: string;
    colegioNombre: string;
    membresiaId: string;
  }
  interface Session {
    user: {
      id: string;
      rol: string;
      colegioId: string;
      colegioNombre: string;
      membresiaId: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    rol?: string;
    colegioId?: string;
    colegioNombre?: string;
    membresiaId?: string;
  }
}
