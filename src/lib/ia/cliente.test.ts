import { describe, it, expect, vi } from "vitest";
import { conReintento, mensajeErrorIA } from "./cliente";

describe("mensajeErrorIA", () => {
  it("401/403 son problemas de configuración", () => {
    expect(mensajeErrorIA({ status: 401 }).config).toBe(true);
    expect(mensajeErrorIA({ status: 403 }).config).toBe(true);
  });

  it("404 (modelo no disponible) es de configuración", () => {
    expect(mensajeErrorIA({ status: 404 }).config).toBe(true);
  });

  it("400 (solicitud rechazada: sin saldo/acceso) es de configuración", () => {
    expect(mensajeErrorIA({ status: 400 }).config).toBe(true);
  });

  it("429 y 5xx son transitorios (no configuración)", () => {
    expect(mensajeErrorIA({ status: 429 }).config).toBe(false);
    expect(mensajeErrorIA({ status: 500 }).config).toBe(false);
    expect(mensajeErrorIA(new Error("network")).config).toBe(false);
  });
});

describe("conReintento", () => {
  it("devuelve el valor si la primera llamada funciona", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await conReintento(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta ante un error transitorio (5xx) y luego funciona", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValueOnce("ok");
    expect(await conReintento(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("NO reintenta ante un error de configuración (401)", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401 });
    await expect(conReintento(fn)).rejects.toEqual({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
