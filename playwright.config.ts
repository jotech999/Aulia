import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración E2E de Aulia.
 *
 * Dos proyectos con propósitos distintos:
 *  - `escritorio`: los flujos funcionales (login, asistencia, notas, firma,
 *    portal del apoderado). Se ejecutan en un viewport de escritorio.
 *  - `movil`: la suite de regresión de la versión móvil (07-movil). Existe
 *    porque el cajón de navegación estuvo roto en el teléfono sin que ninguna
 *    prueba lo notara: se dibujaba dentro de la barra superior por el
 *    `backdrop-filter`, y la plataforma quedaba sin menú en el celular.
 *
 * BASE_URL apunta por defecto a un servidor local; en CI conviene levantar la
 * app con una base de datos de prueba sembrada (`prisma db seed`).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Escape hatch para entornos que ya traen un Chromium instalado y no pueden
 * descargar el que Playwright espera (contenedores de CI sin salida a
 * internet). Si no se define, se usa el navegador que gestiona Playwright.
 */
const ejecutableChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions = ejecutableChromium
  ? { launchOptions: { executablePath: ejecutableChromium } }
  : {};

export default defineConfig({
  testDir: "./e2e",
  // Un fallo de layout suele ser determinista: sin reintentos infinitos.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "escritorio",
      testIgnore: /07-movil\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, ...launchOptions },
    },
    {
      name: "movil",
      testMatch: /07-movil\.spec\.ts/,
      // Pixel 5: 393×851, táctil. Representa el piso realista de pantalla.
      use: { ...devices["Pixel 5"], ...launchOptions },
    },
  ],
});
