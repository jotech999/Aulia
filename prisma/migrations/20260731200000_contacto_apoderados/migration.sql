-- Contacto del apoderado en la ficha del estudiante (pedido docente):
-- teléfono y dirección del usuario apoderado, editables por dirección.
ALTER TABLE "Usuario" ADD COLUMN "telefono" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "direccion" TEXT;
