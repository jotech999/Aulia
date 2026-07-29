/** Seed idempotente del sostenedor demo. No borra ni re-siembra datos base. */
import { PrismaClient, Rol } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Dígito verificador (módulo 11) para armar un RUT válido. */
function dv(numero: number): string {
  let suma = 0, mul = 2, n = numero;
  while (n > 0) { suma += (n % 10) * mul; n = Math.floor(n / 10); mul = mul === 7 ? 2 : mul + 1; }
  const resto = 11 - (suma % 11);
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
}

async function main() {
  const colegio = await prisma.colegio.findFirst({ where: { rbd: "99999" }, select: { id: true, nombre: true } });
  if (!colegio) { console.log("Sin colegio demo (rbd 99999). Corre primero el seed base."); return; }

  const rutNum = 18500000;
  const rut = `${rutNum}-${dv(rutNum)}`;
  const email = "sostenedor@demo.cl";
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { rut, nombre: "Rodrigo Sostenedor", email, passwordHash },
    select: { id: true },
  });

  await prisma.membresia.upsert({
    where: { usuarioId_colegioId_rol: { usuarioId: usuario.id, colegioId: colegio.id, rol: Rol.SOSTENEDOR } },
    update: {},
    create: { usuarioId: usuario.id, colegioId: colegio.id, rol: Rol.SOSTENEDOR },
  });

  console.log(`Sostenedor demo listo: ${email} / demo1234 → red con "${colegio.nombre}".`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
