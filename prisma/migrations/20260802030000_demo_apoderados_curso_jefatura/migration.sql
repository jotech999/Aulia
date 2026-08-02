-- Datos de DEMOSTRACIÓN: vincula los apoderados de ejemplo a estudiantes de 1°B.
--
-- Por qué: en la demo, cvargas@demo.cl (profesora jefe de 1°B) es la cuenta con
-- la que se prueba la plataforma, pero los tres apoderados sembrados estaban
-- todos en 5° y 6°. Su listado de familias salía vacío y parecía una falla del
-- producto cuando en realidad era el reparto de los datos de ejemplo.
--
-- Es ADITIVA y ACOTADA: solo inserta vínculos para cuentas @demo.cl, no borra
-- ni modifica nada existente, y en la base de un colegio real no encuentra
-- ninguna fila y no hace absolutamente nada.
WITH apoderados_demo AS (
  SELECT u."id" AS usuario_id,
         row_number() OVER (ORDER BY u."email") AS orden
  FROM "Usuario" u
  WHERE u."email" IN (
    'apoderado1@demo.cl', 'apoderado2@demo.cl', 'apoderado3@demo.cl'
  )
),
curso_jefatura AS (
  SELECT c."id" AS curso_id
  FROM "Curso" c
  JOIN "Usuario" j ON j."id" = c."profesorJefeId"
  WHERE j."email" = 'cvargas@demo.cl'
  ORDER BY c."id"
  LIMIT 1
),
candidatos AS (
  -- Estudiantes activos del curso que aún no tienen ningún apoderado.
  SELECT m."estudianteId" AS estudiante_id,
         row_number() OVER (ORDER BY m."estudianteId") AS orden
  FROM "Matricula" m
  JOIN curso_jefatura cj ON cj.curso_id = m."cursoId"
  WHERE m."estado" = 'ACTIVA'
    AND NOT EXISTS (
      SELECT 1 FROM "Apoderado" a WHERE a."estudianteId" = m."estudianteId"
    )
)
INSERT INTO "Apoderado" ("id", "usuarioId", "estudianteId", "parentesco", "calidad")
SELECT
  gen_random_uuid()::text,
  ap.usuario_id,
  ca.estudiante_id,
  'apoderado',
  'TITULAR'::"CalidadApoderado"
FROM apoderados_demo ap
JOIN candidatos ca ON ca.orden = ap.orden
ON CONFLICT ("usuarioId", "estudianteId") DO NOTHING;
