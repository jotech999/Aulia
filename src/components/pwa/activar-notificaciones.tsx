"use client";

import { useEffect, useState } from "react";
import { guardarSuscripcion, eliminarSuscripcion } from "@/app/acciones-push";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Estado = "cargando" | "no-soportado" | "activo" | "inactivo" | "denegado";

export function ActivarNotificaciones() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      !vapid
    ) {
      setEstado("no-soportado");
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (Notification.permission === "denied") {
      setEstado("denegado");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEstado(sub ? "activo" : "inactivo"))
      .catch(() => setEstado("inactivo"));
  }, [vapid]);

  async function activar() {
    if (!vapid) return;
    setOcupado(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setEstado(perm === "denied" ? "denegado" : "inactivo");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
      const res = await guardarSuscripcion({ endpoint: json.endpoint, keys: json.keys });
      setEstado(res.ok ? "activo" : "inactivo");
    } catch {
      setEstado("inactivo");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await eliminarSuscripcion(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "cargando" || estado === "no-soportado") return null;

  return (
    <div className="superficie flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600" aria-hidden>🔔</span>
        <div>
          <p className="text-sm font-semibold text-tinta">
            {estado === "activo" ? "Notificaciones activadas" : "Recibe avisos al instante"}
          </p>
          <p className="text-xs text-tinta-tenue">
            {estado === "activo"
              ? "Te avisamos de notas, comunicados e inasistencias de tus pupilos."
              : estado === "denegado"
                ? "Bloqueadas en el navegador. Actívalas en los ajustes del sitio."
                : "Notas nuevas, comunicados e inasistencias, directo a tu teléfono."}
          </p>
        </div>
      </div>
      {estado === "inactivo" && (
        <button
          type="button"
          onClick={activar}
          disabled={ocupado}
          className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-semibold text-white shadow-suave hover:bg-marca-700 disabled:opacity-60"
        >
          {ocupado ? "Activando…" : "Activar notificaciones"}
        </button>
      )}
      {estado === "activo" && (
        <button
          type="button"
          onClick={desactivar}
          disabled={ocupado}
          className="rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm font-medium text-tinta-suave hover:bg-superficie-2 disabled:opacity-60"
        >
          Desactivar
        </button>
      )}
    </div>
  );
}
