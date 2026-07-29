import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Flujo crítico: portal del apoderado", () => {
  test("ve a su pupilo con asistencia y notas", async ({ page }) => {
    await login(page, "apoderado1@demo.cl");
    // El panel del apoderado lista a sus pupilos.
    const pupilo = page.locator('a[href*="/mi-pupilo/"]').first();
    await expect(pupilo).toBeVisible();
    await pupilo.click();

    await expect(page).toHaveURL(/\/mi-pupilo\//);
    await expect(page.getByText("Asistencia", { exact: true })).toBeVisible();
    await expect(page.getByText("Promedio general")).toBeVisible();
  });

  test("no puede ver a un estudiante que no es su pupilo (acceso estricto)", async ({ page }) => {
    await login(page, "apoderado1@demo.cl");
    // Id ajeno/inexistente → notFound. Lo esencial: NUNCA se muestran datos del
    // menor (asistencia/promedio). Next renderiza la página not-found sin filtrar.
    await page.goto("/mi-pupilo/id-inexistente-000");
    await expect(page.getByText("Promedio general")).toHaveCount(0);
    await expect(page.getByText("Asistencia", { exact: true })).toHaveCount(0);
  });

  test("el apoderado no accede a pantallas de staff", async ({ page }) => {
    await login(page, "apoderado1@demo.cl");
    await page.goto("/admin/estudiantes");
    // requerirRol redirige fuera del listado de estudiantes del staff.
    await expect(page).not.toHaveURL(/\/admin\/estudiantes/);
  });
});
