const ZONA = "America/Santiago";
const FORMATO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function partesEnSantiago(fecha: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  return Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
}

export function fechaHoraLocalSantiago(fecha = new Date()) {
  const p = partesEnSantiago(fecha);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Convierte un datetime-local interpretándolo siempre como America/Santiago. */
export function fechaHoraSantiagoDesdeLocal(valor: string): Date | null {
  if (!FORMATO_LOCAL.test(valor)) return null;
  const [fecha, hora] = valor.split("T");
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [horas, minutos] = hora.split(":").map(Number);
  const paredUTC = Date.UTC(anio, mes - 1, dia, horas, minutos);
  let instante = new Date(paredUTC);

  // Dos iteraciones resuelven el offset incluso alrededor del cambio de DST.
  for (let i = 0; i < 2; i += 1) {
    const p = partesEnSantiago(instante);
    const representado = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    instante = new Date(instante.getTime() + (paredUTC - representado));
  }

  // Rechaza horas inexistentes durante un salto de horario de verano.
  return fechaHoraLocalSantiago(instante) === valor ? instante : null;
}
