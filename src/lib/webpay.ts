/**
 * Integración Webpay Plus (Transbank). Por defecto usa el ambiente de
 * INTEGRACIÓN (sandbox) con las credenciales públicas de prueba de Transbank.
 * Para producción, define TRANSBANK_COMMERCE_CODE, TRANSBANK_API_KEY y
 * TRANSBANK_ENV=produccion (ver PENDIENTES.md). Server-only.
 */
import {
  WebpayPlus,
  Options,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  Environment,
} from "transbank-sdk";

function opciones(): Options {
  const cc = process.env.TRANSBANK_COMMERCE_CODE;
  const key = process.env.TRANSBANK_API_KEY;
  const prod = process.env.TRANSBANK_ENV === "produccion";
  if (cc && key) return new Options(cc, key, prod ? Environment.Production : Environment.Integration);
  // Sandbox de Transbank (credenciales de integración públicas).
  return new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration);
}

export async function crearTransaccionWebpay(
  buyOrder: string,
  sessionId: string,
  monto: number,
  returnUrl: string
): Promise<{ token: string; url: string }> {
  const tx = new WebpayPlus.Transaction(opciones());
  const r = await tx.create(buyOrder, sessionId, monto, returnUrl);
  return { token: r.token, url: r.url };
}

export async function confirmarTransaccionWebpay(
  token: string
): Promise<{ aprobado: boolean; monto: number; buyOrder: string }> {
  const tx = new WebpayPlus.Transaction(opciones());
  const r = await tx.commit(token);
  return {
    aprobado: r.response_code === 0 && r.status === "AUTHORIZED",
    monto: r.amount,
    buyOrder: r.buy_order,
  };
}
