import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Flujo crítico: calificaciones", () => {
  test("el profesor abre la libreta de una asignatura", async ({ page }) => {
    await login(page, "cvargas@demo.cl");
    await page.goto("/libro-clases/calificaciones");

    // Selector de asignatura: entra a la primera.
    const primera = page.locator('a[href*="/libro-clases/calificaciones?asignaturaId="]').first();
    await expect(primera).toBeVisible();
    await primera.click();

    // La libreta muestra la distribución de promedios y la grilla de estudiantes.
    await expect(page.getByText("Distribución de promedios")).toBeVisible();
    await expect(page.getByText("Promedio del curso")).toBeVisible();
    // Al menos una celda de nota editable.
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeVisible();
  });
});
