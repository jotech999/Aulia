import { type Page, expect } from "@playwright/test";

export const DEMO_PASSWORD = "demo1234";

/** Inicia sesión con un email demo y espera a llegar al dashboard. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

/** Abre el buscador global (⌘K) — utilidad de navegación. */
export async function irADashboard(page: Page) {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
}
