/**
 * Catálogo de Objetivos de Aprendizaje (OA) — Bases Curriculares Mineduc.
 * Fuente: curriculumnacional.cl (1° a 8° básico, Matemática y Lenguaje).
 *
 * Datos de REFERENCIA GLOBAL: iguales para todos los colegios (sin colegioId).
 * Desde 2026 rige la totalidad de las bases (fin de la priorización curricular).
 *
 * Formato de código con espacios ("MA05 OA 07"), como en el libro de clases.
 * Cada línea: "CODIGO | EJE | DESCRIPCION". El nivel, la asignatura y el número
 * se derivan del código en `parseOa`.
 */

export type OaSeed = {
  codigo: string;
  asignatura: string;
  nivel: string; // "1B".."8B"
  numero: number;
  eje: string;
  descripcion: string;
};

const ASIGNATURA_POR_PREFIJO: Record<string, string> = {
  MA: "Matemática",
  LE: "Lenguaje y Comunicación",
};

const CRUDO = String.raw`
MA01 OA 01 | Números y operaciones | Contar números del 0 al 100 de 1 en 1, de 2 en 2, de 5 en 5 y de 10 en 10, hacia adelante y hacia atrás, empezando por cualquier número menor que 100.
MA01 OA 02 | Números y operaciones | Identificar el orden de los elementos de una serie, utilizando números ordinales del primero (1º) al décimo (10º).
MA01 OA 03 | Números y operaciones | Leer números del 0 al 20 y representarlos en forma concreta, pictórica y simbólica.
MA01 OA 04 | Números y operaciones | Comparar y ordenar números del 0 al 20 de menor a mayor y/o viceversa, utilizando material concreto y/o software educativo.
MA01 OA 05 | Números y operaciones | Estimar cantidades hasta 20 en situaciones concretas, usando un referente.
MA01 OA 06 | Números y operaciones | Componer y descomponer números del 0 a 20 de manera aditiva, en forma concreta, pictórica y simbólica.
MA01 OA 07 | Números y operaciones | Describir y aplicar estrategias de cálculo mental para las adiciones y sustracciones hasta 20.
MA01 OA 08 | Números y operaciones | Determinar las unidades y decenas en números del 0 al 20, agrupando de a 10, de manera concreta, pictórica y simbólica.
MA01 OA 09 | Números y operaciones | Demostrar que comprenden la adición y la sustracción de números del 0 al 20 progresivamente.
MA01 OA 10 | Números y operaciones | Demostrar que la adición y la sustracción son operaciones inversas, de manera concreta, pictórica y simbólica.
MA01 OA 11 | Patrones y álgebra | Reconocer, describir, crear y continuar patrones repetitivos y patrones numéricos hasta el 20, crecientes y decrecientes.
MA01 OA 12 | Patrones y álgebra | Describir y registrar la igualdad y la desigualdad como equilibrio y desequilibrio, usando una balanza, del 0 al 20.
MA01 OA 13 | Geometría | Describir la posición de objetos y personas en relación a sí mismos y a otros, usando un lenguaje común (derecha e izquierda).
MA01 OA 14 | Geometría | Identificar en el entorno figuras 3D y figuras 2D y relacionarlas, usando material concreto.
MA01 OA 15 | Geometría | Identificar y dibujar líneas rectas y curvas.
MA01 OA 16 | Medición | Usar unidades no estandarizadas de tiempo para comparar la duración de eventos cotidianos.
MA01 OA 17 | Medición | Usar un lenguaje cotidiano para secuenciar eventos en el tiempo: días de la semana, meses del año y fechas significativas.
MA01 OA 18 | Medición | Identificar y comparar la longitud de objetos, usando palabras como largo y corto.
MA01 OA 19 | Datos y probabilidades | Recolectar y registrar datos para responder preguntas estadísticas sobre sí mismo y el entorno, usando bloques, tablas de conteo y pictogramas.
MA01 OA 20 | Datos y probabilidades | Construir, leer e interpretar pictogramas.
MA02 OA 01 | Números y operaciones | Contar números del 0 al 1 000 de 2 en 2, de 5 en 5, de 10 en 10 y de 100 en 100, hacia adelante y hacia atrás.
MA02 OA 02 | Números y operaciones | Leer números del 0 al 100 y representarlos en forma concreta, pictórica y simbólica.
MA02 OA 03 | Números y operaciones | Comparar y ordenar números del 0 al 100 de menor a mayor y viceversa, usando material concreto y monedas nacionales.
MA02 OA 04 | Números y operaciones | Estimar cantidades hasta 100 en situaciones concretas, usando un referente.
MA02 OA 05 | Números y operaciones | Componer y descomponer números del 0 a 100 de manera aditiva, en forma concreta, pictórica y simbólica.
MA02 OA 06 | Números y operaciones | Describir y aplicar estrategias de cálculo mental para adiciones y sustracciones hasta 20.
MA02 OA 07 | Números y operaciones | Identificar las unidades y decenas en números del 0 al 100, representando las cantidades de acuerdo a su valor posicional.
MA02 OA 08 | Números y operaciones | Demostrar y explicar de manera concreta, pictórica y simbólica el efecto de sumar y restar 0 a un número.
MA02 OA 09 | Números y operaciones | Demostrar que comprende la adición y la sustracción en el ámbito del 0 al 100.
MA02 OA 10 | Números y operaciones | Demostrar que comprende la relación entre la adición y la sustracción al usar la "familia de operaciones".
MA02 OA 11 | Números y operaciones | Demostrar que comprende la multiplicación usando representaciones concretas y pictóricas, construyendo las tablas del 2, del 5 y del 10.
MA02 OA 12 | Patrones y álgebra | Crear, representar y continuar una variedad de patrones numéricos y completar los elementos faltantes.
MA02 OA 13 | Patrones y álgebra | Demostrar, explicar y registrar la igualdad y la desigualdad en forma concreta y pictórica del 0 al 20, usando los símbolos =, > y <.
MA02 OA 14 | Geometría | Representar y describir la posición de objetos y personas, incluyendo derecha e izquierda, usando material concreto y dibujos.
MA02 OA 15 | Geometría | Describir, comparar y construir figuras 2D (triángulos, cuadrados, rectángulos y círculos) con material concreto.
MA02 OA 16 | Geometría | Describir, comparar y construir figuras 3D (cubos, paralelepípedos, esferas y conos) con diversos materiales.
MA02 OA 17 | Medición | Identificar días, semanas, meses y fechas en el calendario.
MA02 OA 18 | Medición | Leer horas y medias horas en relojes digitales, en el contexto de la resolución de problemas.
MA02 OA 19 | Medición | Determinar la longitud de objetos, usando unidades de medida no estandarizadas y estandarizadas (cm y m).
MA02 OA 20 | Datos y probabilidades | Recolectar y registrar datos para responder preguntas estadísticas sobre juegos con monedas y dados.
MA02 OA 21 | Datos y probabilidades | Registrar en tablas y gráficos de barra simple resultados de juegos aleatorios con dados y monedas.
MA02 OA 22 | Datos y probabilidades | Construir, leer e interpretar pictogramas con escala y gráficos de barra simple.
MA03 OA 01 | Números y operaciones | Contar números del 0 al 1 000 de 5 en 5, de 10 en 10, de 100 en 100, y de 3 en 3, de 4 en 4.
MA03 OA 02 | Números y operaciones | Leer números hasta 1 000 y representarlos en forma concreta, pictórica y simbólica.
MA03 OA 03 | Números y operaciones | Comparar y ordenar números naturales hasta 1 000, utilizando la recta numérica o la tabla posicional.
MA03 OA 04 | Números y operaciones | Describir y aplicar estrategias de cálculo mental para las adiciones y sustracciones hasta 100.
MA03 OA 05 | Números y operaciones | Identificar y describir las unidades, decenas y centenas en números del 0 al 1 000, según su valor posicional.
MA03 OA 06 | Números y operaciones | Demostrar que comprenden la adición y la sustracción de números del 0 al 1 000.
MA03 OA 07 | Números y operaciones | Demostrar que comprenden la relación entre la adición y la sustracción, usando la "familia de operaciones".
MA03 OA 08 | Números y operaciones | Demostrar que comprenden las tablas de multiplicar hasta 10 de manera progresiva.
MA03 OA 09 | Números y operaciones | Demostrar que comprenden la división en el contexto de las tablas de hasta 10x10.
MA03 OA 10 | Números y operaciones | Resolver problemas rutinarios en contextos cotidianos que incluyan dinero e involucren las cuatro operaciones (no combinadas).
MA03 OA 11 | Números y operaciones | Demostrar que comprenden las fracciones de uso común: 1/4, 1/3, 1/2, 2/3, 3/4.
MA03 OA 12 | Patrones y álgebra | Generar, describir y registrar patrones numéricos usando una variedad de estrategias en tablas del 100.
MA03 OA 13 | Patrones y álgebra | Resolver ecuaciones de un paso que involucren adiciones y sustracciones y un símbolo geométrico que represente un número desconocido.
MA03 OA 14 | Geometría | Describir la localización de un objeto en un mapa simple o cuadrícula.
MA03 OA 15 | Geometría | Demostrar que comprenden la relación entre figuras 3D y figuras 2D, construyendo una figura 3D a partir de una red.
MA03 OA 16 | Geometría | Describir cubos, paralelepípedos, esferas, conos, cilindros y pirámides según la forma de sus caras y número de aristas y vértices.
MA03 OA 17 | Geometría | Reconocer en el entorno figuras 2D que están trasladadas, reflejadas y rotadas.
MA03 OA 18 | Geometría | Demostrar que comprenden el concepto de ángulo, estimando su medida usando referentes de 45º y 90º.
MA03 OA 19 | Medición | Leer e interpretar líneas de tiempo y calendarios.
MA03 OA 20 | Medición | Leer y registrar el tiempo en horas, medias horas, cuartos de hora y minutos en relojes análogos y digitales.
MA03 OA 21 | Medición | Demostrar que comprenden el perímetro de una figura regular e irregular.
MA03 OA 22 | Medición | Demostrar que comprenden la medición del peso (g y kg).
MA03 OA 23 | Datos y probabilidades | Realizar encuestas, clasificar y organizar los datos obtenidos en tablas y visualizarlos en gráficos de barra.
MA03 OA 24 | Datos y probabilidades | Registrar y ordenar datos obtenidos de juegos aleatorios con dados y monedas, encontrando el menor, el mayor y el punto medio.
MA03 OA 25 | Datos y probabilidades | Construir, leer e interpretar pictogramas y gráficos de barra simple con escala.
MA03 OA 26 | Datos y probabilidades | Representar datos usando diagramas de puntos.
MA04 OA 01 | Números y operaciones | Representar y describir números del 0 al 10 000, identificando su valor posicional hasta la decena de mil.
MA04 OA 02 | Números y operaciones | Describir y aplicar estrategias de cálculo mental para multiplicaciones hasta 10x10 y sus divisiones.
MA04 OA 03 | Números y operaciones | Demostrar que comprenden la adición y la sustracción de números hasta 1 000.
MA04 OA 04 | Números y operaciones | Fundamentar y aplicar las propiedades del 0 y del 1 para la multiplicación y la propiedad del 1 para la división.
MA04 OA 05 | Números y operaciones | Demostrar que comprenden la multiplicación de números de tres dígitos por números de un dígito.
MA04 OA 06 | Números y operaciones | Demostrar que comprenden la división con dividendos de dos dígitos y divisores de un dígito.
MA04 OA 07 | Números y operaciones | Resolver problemas rutinarios y no rutinarios en contextos cotidianos que incluyen dinero.
MA04 OA 08 | Números y operaciones | Demostrar que comprenden las fracciones con denominadores 100, 12, 10, 8, 6, 5, 4, 3, 2.
MA04 OA 09 | Números y operaciones | Resolver adiciones y sustracciones de fracciones con igual denominador de manera concreta y pictórica.
MA04 OA 10 | Números y operaciones | Identificar, escribir y representar fracciones propias y los números mixtos hasta el 5.
MA04 OA 11 | Números y operaciones | Describir y representar decimales (décimos y centésimos), comparándolos y ordenándolos hasta la centésima.
MA04 OA 12 | Números y operaciones | Resolver adiciones y sustracciones de decimales, empleando el valor posicional hasta la centésima.
MA04 OA 13 | Patrones y álgebra | Identificar y describir patrones numéricos en tablas que involucren una operación.
MA04 OA 14 | Patrones y álgebra | Resolver ecuaciones e inecuaciones de un paso que involucren adiciones y sustracciones del 0 al 100.
MA04 OA 15 | Geometría | Describir la localización absoluta de un objeto en un mapa con coordenadas informales y la localización relativa.
MA04 OA 16 | Geometría | Determinar las vistas de figuras 3D desde el frente, desde el lado y desde arriba.
MA04 OA 17 | Geometría | Demostrar que comprenden una línea de simetría, creando figuras simétricas 2D.
MA04 OA 18 | Geometría | Trasladar, rotar y reflejar figuras 2D.
MA04 OA 19 | Geometría | Construir ángulos con el transportador y compararlos.
MA04 OA 20 | Medición | Leer y registrar diversas mediciones del tiempo en relojes análogos y digitales, usando A.M., P.M. y 24 horas.
MA04 OA 21 | Medición | Realizar conversiones entre unidades de tiempo en el contexto de la resolución de problemas.
MA04 OA 22 | Medición | Medir longitudes con unidades estandarizadas (m, cm) y realizar transformaciones entre ellas.
MA04 OA 23 | Medición | Demostrar que comprenden el concepto de área de un rectángulo y de un cuadrado.
MA04 OA 24 | Medición | Demostrar que comprenden el concepto de volumen de un cuerpo, midiéndolo en unidades de cubo.
MA04 OA 25 | Datos y probabilidades | Realizar encuestas, analizar los datos y compararlos con muestras aleatorias, usando tablas y gráficos.
MA04 OA 26 | Datos y probabilidades | Realizar experimentos aleatorios lúdicos y cotidianos, y tabular y representar mediante gráficos.
MA04 OA 27 | Datos y probabilidades | Leer e interpretar pictogramas y gráficos de barra simple con escala, y comunicar sus conclusiones.
MA05 OA 01 | Números y operaciones | Representar y describir números naturales de hasta más de 6 dígitos y menores que 1 000 millones.
MA05 OA 02 | Números y operaciones | Aplicar estrategias de cálculo mental para la multiplicación.
MA05 OA 03 | Números y operaciones | Demostrar que comprenden la multiplicación de números naturales de dos dígitos por números naturales de dos dígitos.
MA05 OA 04 | Números y operaciones | Demostrar que comprenden la división con dividendos de tres dígitos y divisores de un dígito.
MA05 OA 05 | Números y operaciones | Realizar cálculos que involucren las cuatro operaciones, aplicando las reglas relativas a paréntesis y la prevalencia.
MA05 OA 06 | Números y operaciones | Resolver problemas rutinarios y no rutinarios que involucren las cuatro operaciones y combinaciones de ellas.
MA05 OA 07 | Números y operaciones | Demostrar que comprenden las fracciones propias.
MA05 OA 08 | Números y operaciones | Demostrar que comprenden las fracciones impropias de uso común y los números mixtos asociados.
MA05 OA 09 | Números y operaciones | Resolver adiciones y sustracciones con fracciones propias con denominadores menores o iguales a 12.
MA05 OA 10 | Números y operaciones | Determinar el decimal que corresponde a fracciones con denominador 2, 4, 5 y 10.
MA05 OA 11 | Números y operaciones | Comparar y ordenar decimales hasta la milésima.
MA05 OA 12 | Números y operaciones | Resolver adiciones y sustracciones de decimales, empleando el valor posicional hasta la milésima.
MA05 OA 13 | Números y operaciones | Resolver problemas, aplicando adiciones y sustracciones de fracciones propias o decimales.
MA05 OA 14 | Patrones y álgebra | Descubrir alguna regla que explique una sucesión dada y que permita hacer predicciones.
MA05 OA 15 | Patrones y álgebra | Resolver problemas usando ecuaciones e inecuaciones de un paso que involucren adiciones y sustracciones.
MA05 OA 16 | Geometría | Identificar y dibujar puntos en el primer cuadrante del plano cartesiano, dadas sus coordenadas en números naturales.
MA05 OA 17 | Geometría | Describir y dar ejemplos de aristas y caras de figuras 3D y lados de figuras 2D paralelos, que se intersectan o perpendiculares.
MA05 OA 18 | Geometría | Demostrar que comprenden el concepto de congruencia, usando la traslación, la reflexión y la rotación en cuadrículas.
MA05 OA 19 | Medición | Medir longitudes con unidades estandarizadas (m, cm, mm) en el contexto de la resolución de problemas.
MA05 OA 20 | Medición | Realizar transformaciones entre unidades de medida de longitud: km a m, m a cm, cm a mm y viceversa.
MA05 OA 21 | Medición | Diseñar y construir diferentes rectángulos, dados el perímetro, el área o ambos, y sacar conclusiones.
MA05 OA 22 | Medición | Calcular áreas de triángulos, de paralelogramos y de trapecios, y estimar áreas de figuras irregulares.
MA05 OA 23 | Datos y probabilidades | Calcular el promedio de datos e interpretarlo en su contexto.
MA05 OA 24 | Datos y probabilidades | Describir la posibilidad de ocurrencia de un evento en base a un experimento aleatorio.
MA05 OA 25 | Datos y probabilidades | Comparar probabilidades de distintos eventos sin calcularlas.
MA05 OA 26 | Datos y probabilidades | Leer, interpretar y completar tablas, gráficos de barra simple y gráficos de línea.
MA05 OA 27 | Datos y probabilidades | Utilizar diagramas de tallo y hojas para representar datos provenientes de muestras aleatorias.
MA06 OA 01 | Números y operaciones | Demostrar que comprenden los factores y múltiplos, identificando números primos y compuestos.
MA06 OA 02 | Números y operaciones | Realizar cálculos que involucren las cuatro operaciones, utilizando la calculadora en ámbitos superiores a 10 000.
MA06 OA 03 | Números y operaciones | Demostrar que comprenden el concepto de razón de manera concreta, pictórica y simbólica.
MA06 OA 04 | Números y operaciones | Demostrar que comprenden el concepto de porcentaje de manera concreta, pictórica y simbólica.
MA06 OA 05 | Números y operaciones | Demostrar que comprenden las fracciones y números mixtos, determinando equivalencias.
MA06 OA 06 | Números y operaciones | Resolver adiciones y sustracciones de fracciones propias e impropias y números mixtos.
MA06 OA 07 | Números y operaciones | Demostrar que comprenden la multiplicación y la división de decimales por números naturales de un dígito.
MA06 OA 08 | Números y operaciones | Resolver problemas que involucren adiciones y sustracciones de fracciones o decimales hasta la milésima.
MA06 OA 09 | Patrones y álgebra | Demostrar que comprenden la relación entre los valores de una tabla y aplicarla en la resolución de problemas.
MA06 OA 10 | Patrones y álgebra | Representar generalizaciones de relaciones entre números naturales, usando expresiones con letras y ecuaciones.
MA06 OA 11 | Patrones y álgebra | Resolver ecuaciones de primer grado con una incógnita.
MA06 OA 12 | Geometría | Construir y comparar triángulos de acuerdo a la medida de sus lados y/o sus ángulos.
MA06 OA 13 | Geometría | Demostrar que comprenden el concepto de área de una superficie en cubos y paralelepípedos.
MA06 OA 14 | Geometría | Realizar teselados de figuras 2D usando traslaciones, reflexiones y rotaciones.
MA06 OA 15 | Geometría | Construir ángulos agudos, obtusos, rectos, extendidos y completos con instrumentos geométricos.
MA06 OA 16 | Geometría | Identificar los ángulos que se forman entre dos rectas que se cortan.
MA06 OA 17 | Geometría | Demostrar que la suma de los ángulos interiores de un triángulo es 180º y de un cuadrilátero es 360º.
MA06 OA 18 | Medición | Calcular la superficie de cubos y paralelepípedos, expresando el resultado en cm² y m².
MA06 OA 19 | Medición | Calcular el volumen de cubos y paralelepípedos, expresando el resultado en cm³, m³ y mm³.
MA06 OA 20 | Medición | Estimar y medir ángulos usando el transportador, expresando las mediciones en grados.
MA06 OA 21 | Medición | Calcular ángulos en rectas paralelas cortadas por una transversal y en triángulos.
MA06 OA 22 | Datos y probabilidades | Comparar distribuciones de dos grupos, usando diagramas de puntos y de tallo y hojas.
MA06 OA 23 | Datos y probabilidades | Conjeturar acerca de la tendencia de resultados obtenidos en repeticiones de un mismo experimento.
MA06 OA 24 | Datos y probabilidades | Leer e interpretar gráficos de barra doble y circulares y comunicar sus conclusiones.
MA07 OA 01 | Números | Mostrar que comprenden la adición y la sustracción de números enteros.
MA07 OA 02 | Números | Explicar la multiplicación y la división de fracciones positivas.
MA07 OA 03 | Números | Resolver problemas que involucren la multiplicación y la división de fracciones y decimales positivos.
MA07 OA 04 | Números | Mostrar que comprenden el concepto de porcentaje.
MA07 OA 05 | Números | Utilizar potencias de base 10 con exponente natural.
MA07 OA 06 | Álgebra y funciones | Utilizar el lenguaje algebraico para generalizar relaciones entre números.
MA07 OA 07 | Álgebra y funciones | Reducir expresiones algebraicas, reuniendo términos semejantes.
MA07 OA 08 | Álgebra y funciones | Mostrar que comprenden las proporciones directas e inversas.
MA07 OA 09 | Álgebra y funciones | Modelar y resolver problemas con ecuaciones e inecuaciones lineales.
MA07 OA 10 | Geometría | Descubrir relaciones que involucran ángulos exteriores o interiores de polígonos.
MA07 OA 11 | Geometría | Mostrar que comprenden el círculo.
MA07 OA 12 | Geometría | Construir objetos geométricos de manera manual y/o con software educativo.
MA07 OA 13 | Geometría | Desarrollar y aplicar la fórmula del área de triángulos, paralelogramos y trapecios.
MA07 OA 14 | Geometría | Identificar puntos en el plano cartesiano, usando pares ordenados y vectores.
MA07 OA 15 | Probabilidad y estadística | Estimar el porcentaje de características de una población desconocida por muestreo.
MA07 OA 16 | Probabilidad y estadística | Representar datos mediante tablas de frecuencias y gráficos apropiados.
MA07 OA 17 | Probabilidad y estadística | Mostrar que comprenden las medidas de tendencia central y el rango.
MA07 OA 18 | Probabilidad y estadística | Explicar las probabilidades de eventos obtenidos por experimentos.
MA07 OA 19 | Probabilidad y estadística | Comparar frecuencias relativas con probabilidad teórica usando diagramas.
MA08 OA 01 | Números | Mostrar que comprenden la multiplicación y la división de números enteros.
MA08 OA 02 | Números | Utilizar las operaciones de multiplicación y división con los números racionales en la resolución de problemas.
MA08 OA 03 | Números | Explicar la multiplicación, la división y el proceso de formar potencias de base y exponente natural hasta 3.
MA08 OA 04 | Números | Mostrar que comprenden las raíces cuadradas de números naturales.
MA08 OA 05 | Números | Resolver problemas que involucran variaciones porcentuales en contextos diversos.
MA08 OA 06 | Álgebra y funciones | Mostrar que comprenden las operaciones de expresiones algebraicas.
MA08 OA 07 | Álgebra y funciones | Mostrar que comprenden la noción de función por medio de un cambio lineal.
MA08 OA 08 | Álgebra y funciones | Modelar situaciones de la vida diaria y de otras asignaturas usando ecuaciones lineales.
MA08 OA 09 | Álgebra y funciones | Resolver inecuaciones lineales con coeficientes racionales en la resolución de problemas.
MA08 OA 10 | Álgebra y funciones | Mostrar que comprenden la función afín.
MA08 OA 11 | Geometría | Desarrollar las fórmulas del área de superficies y el volumen de prismas rectos y cilindros.
MA08 OA 12 | Geometría | Explicar la validez del teorema de Pitágoras y aplicarlo a la resolución de problemas.
MA08 OA 13 | Geometría | Describir la posición y el movimiento de figuras 2D.
MA08 OA 14 | Geometría | Componer rotaciones, traslaciones y reflexiones en el plano cartesiano y en el espacio.
MA08 OA 15 | Probabilidad y estadística | Mostrar que comprenden las medidas de posición, percentiles y cuartiles.
MA08 OA 16 | Probabilidad y estadística | Evaluar la forma en que los datos están presentados.
MA08 OA 17 | Probabilidad y estadística | Explicar el principio combinatorio multiplicativo.
LE01 OA 01 | Lectura | Reconocer que los textos escritos transmiten mensajes y que son escritos por alguien para cumplir un propósito.
LE01 OA 02 | Lectura | Reconocer que las palabras son unidades de significado separadas por espacios en el texto escrito.
LE01 OA 03 | Lectura | Identificar los sonidos que componen las palabras (conciencia fonológica).
LE01 OA 04 | Lectura | Leer palabras aisladas y en contexto, aplicando el conocimiento de la correspondencia letra-sonido.
LE01 OA 05 | Lectura | Leer textos breves en voz alta para adquirir fluidez.
LE01 OA 06 | Lectura | Comprender textos aplicando estrategias de comprensión lectora.
LE01 OA 07 | Lectura | Leer independientemente y familiarizarse con un amplio repertorio de literatura.
LE01 OA 08 | Lectura | Demostrar comprensión de narraciones que aborden temas familiares.
LE01 OA 09 | Lectura | Leer habitualmente y disfrutar los mejores poemas de autor y de la tradición oral adecuados a su edad.
LE01 OA 10 | Lectura | Leer independientemente y comprender textos no literarios escritos con oraciones simples.
LE01 OA 11 | Lectura | Desarrollar el gusto por la lectura, explorando libros y sus ilustraciones.
LE01 OA 12 | Lectura | Asistir habitualmente a la biblioteca para elegir, escuchar, leer y explorar textos de su interés.
LE01 OA 13 | Escritura | Experimentar con la escritura para comunicar hechos, ideas y sentimientos.
LE01 OA 14 | Escritura | Escribir oraciones completas para transmitir mensajes.
LE01 OA 15 | Escritura | Escribir con letra clara, separando las palabras con un espacio para que puedan ser leídas por otros.
LE01 OA 16 | Escritura | Incorporar de manera pertinente en la escritura el vocabulario nuevo extraído de textos escuchados o leídos.
LE01 OA 17 | Comunicación Oral | Comprender y disfrutar versiones completas de obras de la literatura narradas o leídas por un adulto.
LE01 OA 18 | Comunicación Oral | Comprender textos orales para obtener información y desarrollar curiosidad.
LE01 OA 19 | Comunicación Oral | Desarrollar la curiosidad por las palabras o expresiones que desconocen y averiguar su significado.
LE01 OA 20 | Comunicación Oral | Disfrutar de la experiencia de asistir a obras de teatro infantiles.
LE01 OA 21 | Comunicación Oral | Participar activamente en conversaciones grupales, respetando turnos.
LE01 OA 22 | Comunicación Oral | Interactuar de acuerdo con convenciones sociales, usando fórmulas de cortesía.
LE01 OA 23 | Comunicación Oral | Expresarse de manera coherente y articulada sobre temas de interés.
LE01 OA 24 | Comunicación Oral | Incorporar de manera pertinente en sus intervenciones orales el vocabulario nuevo.
LE01 OA 25 | Comunicación Oral | Desempeñar diferentes roles para desarrollar el lenguaje y aprender a trabajar en equipo.
LE01 OA 26 | Comunicación Oral | Recitar con entonación y expresión poemas, rimas, canciones, trabalenguas y adivinanzas.
LE02 OA 01 | Lectura | Leer textos significativos que incluyan palabras con hiatos y diptongos, grupos consonánticos y dígrafos.
LE02 OA 02 | Lectura | Leer en voz alta para adquirir fluidez, respetando punto seguido y aparte.
LE02 OA 03 | Lectura | Comprender textos aplicando estrategias de comprensión lectora.
LE02 OA 04 | Lectura | Leer independientemente y familiarizarse con un amplio repertorio de literatura.
LE02 OA 05 | Lectura | Demostrar comprensión de narraciones, reconstruyendo secuencias e identificando personajes.
LE02 OA 06 | Lectura | Leer habitualmente y disfrutar los mejores poemas de autor y tradición oral.
LE02 OA 07 | Lectura | Leer independientemente y comprender textos no literarios como cartas, notas e instrucciones.
LE02 OA 08 | Lectura | Desarrollar el gusto por la lectura, leyendo habitualmente diversos textos.
LE02 OA 09 | Lectura | Asistir habitualmente a la biblioteca para encontrar información y elegir libros.
LE02 OA 10 | Lectura | Buscar información sobre un tema en una fuente dada por el docente.
LE02 OA 11 | Lectura | Desarrollar la curiosidad por palabras o expresiones desconocidas y averiguar su significado.
LE02 OA 12 | Escritura | Escribir frecuentemente para desarrollar la creatividad y expresar ideas.
LE02 OA 13 | Escritura | Escribir creativamente narraciones con inicio, desarrollo y desenlace.
LE02 OA 14 | Escritura | Escribir artículos informativos para comunicar información sobre un tema.
LE02 OA 15 | Escritura | Escribir con letra clara, separando las palabras con espacio.
LE02 OA 16 | Escritura | Planificar la escritura generando ideas a partir de imágenes y conversaciones.
LE02 OA 17 | Escritura | Escribir, revisar y editar textos, corrigiendo la ortografía.
LE02 OA 18 | Escritura | Incorporar de manera pertinente en la escritura el vocabulario nuevo.
LE02 OA 19 | Escritura | Comprender la función de artículos, sustantivos y adjetivos para enriquecer producciones.
LE02 OA 20 | Escritura | Identificar el género y número de palabras para asegurar concordancia.
LE02 OA 21 | Escritura | Escribir correctamente usando combinaciones ce-ci, que-qui, ge-gi, mayúsculas y puntos.
LE02 OA 22 | Comunicación Oral | Comprender y disfrutar versiones completas de obras literarias.
LE02 OA 23 | Comunicación Oral | Comprender textos orales como explicaciones e instrucciones.
LE02 OA 24 | Comunicación Oral | Disfrutar asistiendo a obras de teatro infantiles o representaciones.
LE02 OA 25 | Comunicación Oral | Participar activamente en conversaciones grupales, formulando preguntas.
LE02 OA 26 | Comunicación Oral | Interactuar según convenciones sociales, usando fórmulas de cortesía.
LE02 OA 27 | Comunicación Oral | Expresarse coherentemente sobre temas de interés con vocabulario variado.
LE02 OA 28 | Comunicación Oral | Incorporar de manera pertinente vocabulario nuevo en intervenciones orales.
LE02 OA 29 | Comunicación Oral | Desempeñar diferentes roles para desarrollar el lenguaje y trabajar en equipo.
LE02 OA 30 | Comunicación Oral | Recitar con entonación y expresión poemas, rimas, canciones, trabalenguas y adivinanzas.
LE03 OA 01 | Lectura | Leer en voz alta de manera fluida variados textos apropiados a su edad.
LE03 OA 02 | Lectura | Comprender textos aplicando estrategias de comprensión lectora.
LE03 OA 03 | Lectura | Leer y familiarizarse con un amplio repertorio de literatura.
LE03 OA 04 | Lectura | Profundizar su comprensión de las narraciones leídas.
LE03 OA 05 | Lectura | Comprender poemas adecuados al nivel e interpretar el lenguaje figurado.
LE03 OA 06 | Lectura | Leer independientemente y comprender textos no literarios.
LE03 OA 07 | Lectura | Desarrollar el gusto por la lectura, leyendo habitualmente diversos textos.
LE03 OA 08 | Lectura | Asistir habitualmente a la biblioteca para satisfacer diversos propósitos.
LE03 OA 09 | Lectura | Buscar información sobre un tema en libros, internet, diarios, revistas, enciclopedias y atlas.
LE03 OA 10 | Lectura | Determinar el significado de palabras desconocidas usando claves contextuales o morfemas.
LE03 OA 11 | Lectura | Determinar el significado de palabras desconocidas usando el orden alfabético.
LE03 OA 12 | Escritura | Escribir frecuentemente para desarrollar la creatividad y expresar ideas.
LE03 OA 13 | Escritura | Escribir creativamente narraciones que incluyan una secuencia lógica de eventos.
LE03 OA 14 | Escritura | Escribir artículos informativos para comunicar información sobre un tema.
LE03 OA 15 | Escritura | Escribir cartas, instrucciones, afiches y reportes para lograr diferentes propósitos.
LE03 OA 16 | Escritura | Escribir con letra clara para que pueda ser leída por otros con facilidad.
LE03 OA 17 | Escritura | Planificar la escritura estableciendo propósito y destinatario.
LE03 OA 18 | Escritura | Escribir, revisar y editar sus textos para satisfacer un propósito.
LE03 OA 19 | Escritura | Incorporar de manera pertinente vocabulario nuevo en la escritura.
LE03 OA 20 | Escritura | Comprender la función de artículos, sustantivos y adjetivos en los textos.
LE03 OA 21 | Escritura | Comprender la función de los pronombres en textos orales y escritos.
LE03 OA 22 | Escritura | Escribir correctamente aplicando reglas de mayúsculas, puntuación y ortografía.
LE03 OA 23 | Comunicación Oral | Comprender y disfrutar versiones completas de obras de la literatura.
LE03 OA 24 | Comunicación Oral | Comprender textos orales para obtener información y desarrollar curiosidad.
LE03 OA 25 | Comunicación Oral | Disfrutar de asistir a obras de teatro infantiles o representaciones.
LE03 OA 26 | Comunicación Oral | Participar activamente en conversaciones grupales sobre textos.
LE03 OA 27 | Comunicación Oral | Interactuar de acuerdo con convenciones sociales en diferentes situaciones.
LE03 OA 28 | Comunicación Oral | Expresarse de manera coherente y articulada sobre temas de interés.
LE03 OA 29 | Comunicación Oral | Incorporar vocabulario nuevo en intervenciones orales.
LE03 OA 30 | Comunicación Oral | Caracterizar distintos personajes para desarrollar el lenguaje y trabajar en equipo.
LE03 OA 31 | Comunicación Oral | Recitar poemas con entonación y expresión para fortalecer la confianza.
LE04 OA 01 | Lectura | Leer en voz alta de manera fluida variados textos apropiados a su edad.
LE04 OA 02 | Lectura | Comprender textos aplicando estrategias de comprensión lectora.
LE04 OA 03 | Lectura | Leer y familiarizarse con un amplio repertorio de literatura.
LE04 OA 04 | Lectura | Profundizar la comprensión de narraciones, describiendo personajes y ambientes.
LE04 OA 05 | Lectura | Comprender poemas e interpretar el lenguaje figurado presente en ellos.
LE04 OA 06 | Lectura | Comprender textos no literarios extrayendo información explícita e implícita.
LE04 OA 07 | Lectura | Desarrollar el gusto por la lectura, leyendo habitualmente diversos textos.
LE04 OA 08 | Lectura | Asistir habitualmente a la biblioteca satisfaciendo diversos propósitos.
LE04 OA 09 | Lectura | Buscar y clasificar información sobre un tema en internet, libros, diarios y revistas.
LE04 OA 10 | Lectura | Aplicar estrategias para determinar el significado de palabras nuevas.
LE04 OA 11 | Escritura | Escribir frecuentemente para desarrollar la creatividad y expresar ideas.
LE04 OA 12 | Escritura | Escribir creativamente narraciones con inicio, desarrollo y desenlace.
LE04 OA 13 | Escritura | Escribir artículos informativos desarrollando ideas centrales por párrafo.
LE04 OA 14 | Escritura | Escribir cartas, instrucciones, afiches y reportes usando el formato adecuado.
LE04 OA 15 | Escritura | Escribir con letra clara para que pueda ser leída por otros con facilidad.
LE04 OA 16 | Escritura | Planificar la escritura estableciendo propósito y destinatario.
LE04 OA 17 | Escritura | Escribir, revisar y editar textos organizando ideas en párrafos.
LE04 OA 18 | Escritura | Incorporar de manera pertinente vocabulario nuevo en la escritura.
LE04 OA 19 | Escritura | Comprender la función de los adverbios en los textos.
LE04 OA 20 | Escritura | Comprender la función de los verbos manteniendo concordancia con el sujeto.
LE04 OA 21 | Escritura | Escribir correctamente aplicando reglas de ortografía y acentuación.
LE04 OA 22 | Comunicación Oral | Comprender y disfrutar versiones completas de obras de la literatura.
LE04 OA 23 | Comunicación Oral | Comprender textos orales identificando propósito y formulando preguntas.
LE04 OA 24 | Comunicación Oral | Disfrutar de la experiencia de asistir a obras de teatro infantiles.
LE04 OA 25 | Comunicación Oral | Participar activamente en conversaciones grupales, respetando turnos.
LE04 OA 26 | Comunicación Oral | Interactuar según convenciones sociales, expresando opiniones.
LE04 OA 27 | Comunicación Oral | Expresarse coherentemente sobre temas de interés, usando material de apoyo.
LE04 OA 28 | Comunicación Oral | Incorporar de manera pertinente vocabulario nuevo en intervenciones orales.
LE04 OA 29 | Comunicación Oral | Caracterizar distintos personajes para desarrollar el lenguaje y trabajar en equipo.
LE04 OA 30 | Comunicación Oral | Recitar poemas con entonación y expresión, desarrollando la capacidad expresiva.
LE05 OA 01 | Lectura | Leer de manera fluida textos variados apropiados a su edad.
LE05 OA 02 | Lectura | Comprender textos aplicando estrategias de comprensión lectora.
LE05 OA 03 | Lectura | Leer y familiarizarse con un amplio repertorio de literatura.
LE05 OA 04 | Lectura | Analizar aspectos relevantes de las narraciones leídas.
LE05 OA 05 | Lectura | Analizar aspectos relevantes de diversos poemas.
LE05 OA 06 | Lectura | Leer independientemente y comprender textos no literarios.
LE05 OA 07 | Lectura | Evaluar críticamente la información presente en textos.
LE05 OA 08 | Lectura | Sintetizar y registrar las ideas principales de textos leídos.
LE05 OA 09 | Lectura | Desarrollar el gusto por la lectura, leyendo habitualmente.
LE05 OA 10 | Lectura | Asistir habitualmente a la biblioteca para satisfacer diversos propósitos.
LE05 OA 11 | Lectura | Buscar y seleccionar la información más relevante sobre un tema.
LE05 OA 12 | Lectura | Aplicar estrategias para determinar el significado de palabras nuevas.
LE05 OA 13 | Escritura | Escribir frecuentemente para desarrollar la creatividad y expresar ideas.
LE05 OA 14 | Escritura | Escribir creativamente narraciones con una estructura clara.
LE05 OA 15 | Escritura | Escribir artículos informativos para comunicar información.
LE05 OA 16 | Escritura | Escribir frecuentemente para compartir impresiones sobre lecturas.
LE05 OA 17 | Escritura | Planificar sus textos, estableciendo propósito y destinatario.
LE05 OA 18 | Escritura | Escribir, revisar y editar sus textos para satisfacer un propósito.
LE05 OA 19 | Escritura | Incorporar de manera pertinente vocabulario nuevo en la escritura.
LE05 OA 20 | Escritura | Distinguir matices entre sinónimos al leer, hablar y escribir.
LE05 OA 21 | Escritura | Conjugar correctamente los verbos regulares en producciones escritas.
LE05 OA 22 | Escritura | Escribir correctamente aplicando reglas ortográficas.
LE05 OA 23 | Comunicación Oral | Comprender y disfrutar versiones completas de obras literarias.
LE05 OA 24 | Comunicación Oral | Comprender textos orales para obtener información.
LE05 OA 25 | Comunicación Oral | Apreciar obras de teatro, películas o representaciones.
LE05 OA 26 | Comunicación Oral | Dialogar para compartir y desarrollar ideas y buscar acuerdos.
LE05 OA 27 | Comunicación Oral | Interactuar de acuerdo con las convenciones sociales.
LE05 OA 28 | Comunicación Oral | Expresarse de manera clara y efectiva en exposiciones orales.
LE05 OA 29 | Comunicación Oral | Incorporar vocabulario nuevo en intervenciones orales.
LE05 OA 30 | Comunicación Oral | Producir textos orales planificados de diverso tipo.
LE06 OA 01 | Lectura | Leer de manera fluida textos variados apropiados a su edad.
LE06 OA 02 | Lectura | Comprender textos aplicando estrategias de comprensión lectora.
LE06 OA 03 | Lectura | Leer y familiarizarse con un repertorio literario diverso.
LE06 OA 04 | Lectura | Analizar aspectos relevantes de las narraciones, interpretando el lenguaje figurado.
LE06 OA 05 | Lectura | Analizar poemas identificando figuras literarias y efectos sonoros.
LE06 OA 06 | Lectura | Leer independientemente textos no literarios, haciendo inferencias.
LE06 OA 07 | Lectura | Evaluar críticamente la información presente en textos, determinando emisor y propósito.
LE06 OA 08 | Lectura | Sintetizar, registrar y ordenar las ideas principales de textos leídos.
LE06 OA 09 | Lectura | Desarrollar el gusto por la lectura, leyendo habitualmente diversos textos.
LE06 OA 10 | Lectura | Asistir habitualmente a la biblioteca satisfaciendo propósitos diversos.
LE06 OA 11 | Lectura | Buscar y comparar información sobre un tema utilizando fuentes variadas.
LE06 OA 12 | Lectura | Aplicar estrategias para determinar el significado de palabras nuevas.
LE06 OA 13 | Escritura | Escribir frecuentemente textos creativos para expresar ideas.
LE06 OA 14 | Escritura | Escribir creativamente narraciones con estructura clara y diálogos pertinentes.
LE06 OA 15 | Escritura | Escribir artículos informativos, desarrollando una idea central por párrafo.
LE06 OA 16 | Escritura | Escribir frecuentemente compartiendo impresiones sobre lecturas.
LE06 OA 17 | Escritura | Planificar textos estableciendo propósito y destinatario.
LE06 OA 18 | Escritura | Escribir, revisar y editar textos empleando vocabulario preciso.
LE06 OA 19 | Escritura | Incorporar de manera pertinente vocabulario nuevo en la escritura.
LE06 OA 20 | Escritura | Ampliar la capacidad expresiva utilizando sinónimos, hipónimos e hiperónimos.
LE06 OA 21 | Escritura | Utilizar correctamente participios irregulares en producciones escritas.
LE06 OA 22 | Escritura | Escribir correctamente aplicando reglas de ortografía literal, acentual y puntual.
LE06 OA 23 | Comunicación Oral | Comprender y disfrutar versiones completas de obras literarias.
LE06 OA 24 | Comunicación Oral | Comprender textos orales, formulando opiniones fundamentadas.
LE06 OA 25 | Comunicación Oral | Evaluar críticamente mensajes publicitarios, identificando su intención.
LE06 OA 26 | Comunicación Oral | Apreciar obras de teatro y películas, identificando recursos.
LE06 OA 27 | Comunicación Oral | Dialogar para compartir y desarrollar ideas, fundamentando la postura.
LE06 OA 28 | Comunicación Oral | Interactuar según convenciones sociales, usando fórmulas de cortesía.
LE06 OA 29 | Comunicación Oral | Expresarse claramente en exposiciones orales organizadas.
LE06 OA 30 | Comunicación Oral | Incorporar de manera pertinente vocabulario nuevo en intervenciones orales.
LE06 OA 31 | Comunicación Oral | Producir textos orales espontáneos o planificados de diverso tipo.
LE07 OA 01 | Lectura | Leer habitualmente para aprender y recrearse, seleccionando textos según sus preferencias.
LE07 OA 02 | Lectura | Reflexionar sobre dimensiones de la experiencia humana a partir de lecturas literarias.
LE07 OA 03 | Lectura | Analizar narraciones considerando conflictos, roles de personajes y temporalidad.
LE07 OA 04 | Lectura | Analizar poemas considerando lenguaje poético, lenguaje figurado, ritmo y sonoridad.
LE07 OA 05 | Lectura | Leer y comprender romances y obras de poesía popular considerando su contexto.
LE07 OA 06 | Lectura | Leer y comprender relatos mitológicos considerando sus características y contexto.
LE07 OA 07 | Lectura | Formular interpretaciones de textos literarios considerando el contexto histórico.
LE07 OA 08 | Lectura | Analizar y evaluar textos argumentativos diferenciando hecho y opinión.
LE07 OA 09 | Lectura | Analizar textos mediáticos considerando propósitos y estereotipos.
LE07 OA 10 | Lectura | Leer y comprender textos no literarios para complementar lecturas literarias.
LE07 OA 11 | Lectura | Aplicar estrategias de comprensión como resumir y formular preguntas.
LE07 OA 12 | Escritura | Expresarse creativamente mediante la escritura de diversos géneros.
LE07 OA 13 | Escritura | Escribir textos explicativos con información de distintas fuentes.
LE07 OA 14 | Escritura | Escribir textos persuasivos breves con afirmación y evidencias.
LE07 OA 15 | Escritura | Planificar, escribir, revisar y editar textos considerando coherencia y cohesión.
LE07 OA 16 | Escritura | Aplicar conceptos de oración, sujeto y predicado para revisar textos.
LE07 OA 17 | Escritura | Usar recursos de correferencia léxica, empleando sinonimia e hiperonimia.
LE07 OA 18 | Escritura | Utilizar adecuadamente los tiempos verbales del indicativo en narraciones.
LE07 OA 19 | Escritura | Escribir correctamente aplicando reglas de ortografía literal, acentual y puntuación.
LE07 OA 20 | Comunicación Oral | Comprender y evaluar textos orales y audiovisuales, formulando una postura personal.
LE07 OA 21 | Comunicación Oral | Dialogar constructivamente para debatir, fundamentando posturas.
LE07 OA 22 | Comunicación Oral | Expresarse ante una audiencia de manera clara, con material visual de apoyo.
LE07 OA 23 | Comunicación Oral | Usar conscientemente elementos orales, demostrando dominio de registros.
LE07 OA 24 | Investigación | Realizar investigaciones delimitando el tema y evaluando fuentes.
LE07 OA 25 | Investigación | Sintetizar, registrar y ordenar las ideas principales de textos para investigar.
LE08 OA 01 | Lectura | Leer habitualmente para aprender y recrearse, seleccionando textos según sus preferencias.
LE08 OA 02 | Lectura | Reflexionar sobre dimensiones de la experiencia humana desde lecturas literarias.
LE08 OA 03 | Lectura | Analizar narraciones considerando conflictos, narrador, símbolos y disposición temporal.
LE08 OA 04 | Lectura | Analizar poemas considerando lenguaje poético, lenguaje figurado y repeticiones.
LE08 OA 05 | Lectura | Analizar textos dramáticos considerando conflicto, personajes y símbolos.
LE08 OA 06 | Lectura | Leer y comprender fragmentos de epopeya considerando su contexto.
LE08 OA 07 | Lectura | Leer y comprender comedias teatrales considerando sus características.
LE08 OA 08 | Lectura | Formular interpretaciones coherentes de textos literarios considerando el contexto histórico.
LE08 OA 09 | Lectura | Analizar y evaluar textos argumentativos diferenciando hechos y opiniones.
LE08 OA 10 | Lectura | Analizar textos mediáticos considerando propósitos, estereotipos e imagen visual.
LE08 OA 11 | Lectura | Leer y comprender textos no literarios para contextualizar lecturas literarias.
LE08 OA 12 | Lectura | Aplicar estrategias de comprensión, analizando relaciones multimodales.
LE08 OA 13 | Escritura | Expresarse creativamente mediante la escritura de diversos géneros.
LE08 OA 14 | Escritura | Escribir textos explicativos con información de múltiples fuentes.
LE08 OA 15 | Escritura | Escribir textos persuasivos breves con afirmación y evidencias.
LE08 OA 16 | Escritura | Planificar, escribir, revisar, reescribir y editar textos adecuando el registro.
LE08 OA 17 | Escritura | Usar adecuadamente oraciones complejas manteniendo la coherencia temporal.
LE08 OA 18 | Escritura | Construir textos con referencias claras usando deícticos y sustitución pronominal.
LE08 OA 19 | Escritura | Conocer los modos verbales y seleccionarlos para efectos persuasivos.
LE08 OA 20 | Escritura | Escribir correctamente aplicando reglas de ortografía, acentuación y puntuación.
LE08 OA 21 | Comunicación Oral | Comprender y evaluar textos orales considerando una postura personal.
LE08 OA 22 | Comunicación Oral | Dialogar constructivamente, fundamentando la postura y negociando acuerdos.
LE08 OA 23 | Comunicación Oral | Expresarse ante una audiencia con información fidedigna y vocabulario variado.
LE08 OA 24 | Comunicación Oral | Usar conscientemente elementos de los textos orales, incluidos los prosódicos.
LE08 OA 25 | Investigación | Realizar investigaciones delimitando el tema y evaluando fuentes.
LE08 OA 26 | Investigación | Sintetizar, registrar y ordenar las ideas principales de textos para investigar.
`;

/** Parsea el catálogo crudo, derivando asignatura, nivel y número del código. */
export function parseOa(): OaSeed[] {
  const filas: OaSeed[] = [];
  for (const linea of CRUDO.split("\n")) {
    const t = linea.trim();
    if (!t) continue;
    const partes = t.split(" | ");
    if (partes.length < 3) continue;
    const codigo = partes[0].trim();
    const eje = partes[1].trim();
    const descripcion = partes.slice(2).join(" | ").trim().replace(/^"|"$/g, "");
    // Código "MA05 OA 07" → prefijo "MA", nivel dígitos "05", número "07".
    const m = codigo.match(/^([A-Z]{2})(\d{2}) OA (\d{2})$/);
    if (!m) throw new Error(`Código OA inválido en el seed: "${codigo}"`);
    const [, prefijo, nn, num] = m;
    const asignatura = ASIGNATURA_POR_PREFIJO[prefijo];
    if (!asignatura) throw new Error(`Prefijo OA desconocido: "${prefijo}"`);
    filas.push({
      codigo,
      asignatura,
      nivel: `${Number(nn)}B`, // "05" → "5B"
      numero: Number(num),
      eje,
      descripcion,
    });
  }
  return filas;
}

export const OA_SEED = parseOa();
