import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Flujo crítico: asistencia", () => {
  test("el profesor jefe llega a su curso y marca asistencia", async ({ page }) => {
    await login(page, "cvargas@demo.cl"); // profesor jefe de 5°A
    await page.goto("/libro-clases/asistencia");

    // Selector de curso: entra al primero accesible.
    const primerCurso = page.locator('a[href*="/libro-clases/asistencia?cursoId="]').first();
    await expect(primerCurso).toBeVisible();
    await primerCurso.click();

    // Roster con estudiantes: botones con aria-label de estado.
    const primerEstudiante = page.locator('button[aria-label*="Tocar para cambiar estado"]').first();
    await expect(primerEstudiante).toBeVisible();

    // Marcar (cambiar estado) no debe producir error de guardado.
    await primerEstudiante.click();
    await page.waitForTimeout(1500);
    await expect(page.getByText("No se pudo guardar")).toHaveCount(0);
  });
});
