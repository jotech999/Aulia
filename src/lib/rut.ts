/**
 * Utilidades de RUT chileno.
 * Formato normalizado interno: sin puntos, con guión y DV mayúscula → "12345678-9"
 */

/** Calcula el dígito verificador (módulo 11) para la parte numérica del RUT. */
export function digitoVerificador(numero: number): string {
  let suma = 0;
  let mul = 2;
  let n = numero;
  while (n > 0) {
    suma += (n % 10) * mul;
    n = Math.floor(n / 10);
    mul = mul === 7 ? 2 : mul + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/** Normaliza un RUT en cualquier formato a "12345678-9". Retorna null si es ilegible. */
export function normalizarRut(rut: string): string | null {
  const limpio = rut.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(limpio)) return null;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${parseInt(cuerpo, 10)}-${dv}`;
}

/** Valida un RUT (formato + dígito verificador). */
export function validarRut(rut: string): boolean {
  const normalizado = normalizarRut(rut);
  if (!normalizado) return false;
  const [cuerpo, dv] = normalizado.split("-");
  return digitoVerificador(parseInt(cuerpo, 10)) === dv;
}

/** Formatea "12345678-9" → "12.345.678-9" para mostrar en UI. */
export function formatearRut(rut: string): string {
  const normalizado = normalizarRut(rut);
  if (!normalizado) return rut;
  const [cuerpo, dv] = normalizado.split("-");
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${dv}`;
}
