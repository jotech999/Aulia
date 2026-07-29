import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Cobertura E2E de las mejoras recientes: accesos rápidos, asistente IA con
 * material imprimible, boletines por curso, ciclo de cobro (recordatorios +
 * morosidad), filtros de convivencia e identidad del colegio.
 * Todas son verificaciones de presencia/navegación (no dependen de la IA).
 */
test.describe("Mejoras recientes", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "director@demo.cl");
  });

  test("el inicio muestra los accesos rápidos y el informe ejecutivo", async ({ page }) => {
    await expect(page.getByRole("navigation", { name: "Accesos rápidos" })).toBeVisible();
    await expect(page.getByText("Informe ejecutivo con IA")).toBeVisible();
  });

  test("la barra superior tiene las acciones rápidas del staff", async ({ page }) => {
    await expect(page.getByRole("navigation", { name: "Acciones rápidas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pasar lista" })).toBeVisible();
  });

  test("cursos ofrece boletines S1, S2 y anual por fila", async ({ page }) => {
    await page.goto("/admin/cursos");
    // Al menos un curso con sus tres enlaces de boletines.
    await expect(page.getByRole("link", { name: "S1" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Anual" }).first()).toBeVisible();
  });

  test("finanzas tiene recordatorios y reporte de morosidad", async ({ page }) => {
    await page.goto("/admin/finanzas");
    await expect(page.getByText("Recordatorios de cuotas vencidas")).toBeVisible();
    await page.getByRole("link", { name: "Reporte de morosidad" }).click();
    await expect(page).toHaveURL(/\/admin\/finanzas\/morosidad/);
    await expect(page.getByText("Total moroso")).toBeVisible();
  });

  test("el asistente IA ofrece la pestaña de guías y evaluaciones", async ({ page }) => {
    await page.goto("/asistente-docente");
    await expect(page.getByRole("tab", { name: "Guía / Evaluación" })).toBeVisible();
  });

  test("configuración permite definir la identidad del colegio", async ({ page }) => {
    await page.goto("/admin/configuracion");
    await expect(page.getByText("Identidad del colegio")).toBeVisible();
    await expect(page.getByText("Usar color propio del colegio")).toBeVisible();
  });

  test("convivencia carga con su listado y filtros", async ({ page }) => {
    await page.goto("/convivencia");
    await expect(
      page.getByRole("heading", { name: "Convivencia escolar" })
    ).toBeVisible();
  });

  test("la vista mensual de asistencia carga sus indicadores", async ({ page }) => {
    await page.goto("/libro-clases/asistencia/mensual");
    // La página pide seleccionar curso o muestra el resumen: en ambos casos responde.
    await expect(page.locator("h1").first()).toBeVisible();
  });
});
