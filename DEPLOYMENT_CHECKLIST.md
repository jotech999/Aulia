# ✅ Pre-Deployment Checklist — Aulia

Use esta lista para verificar que todo esté listo antes de desplegar en Nick.cl.

---

## 📋 PASO 1: Preparación Local (Haz esto primero)

- [ ] **Node.js actualizado**: `node --version` debe retornar v18+
- [ ] **npm actualizado**: `npm --version` debe retornar 9+
- [ ] **Clonar/descargar el repo**: `/tmp/aulia` completo
- [ ] **Instalar dependencias**: `npm install`
- [ ] **Generar Prisma Client**: `npm run postinstall`

### TypeScript Linter
⚠️ **Notas importantes:**
- El linter muestra ~30 errores TS7006 (missing type annotations) y algunos errores de importación
- Esto es **normal en desarrollo**, pero debe estar **limpio antes de producción**
- En Nick.cl, ejecutar: 
  ```bash
  npm run build  # ← Esto es lo que compila Next.js en prod
  npm run lint   # ← Esto valida types (no es bloqueador para build)
  ```
- Si `npm run build` falla en Nick.cl, contacta al equipo de desarrollo

---

## 🌐 PASO 2: Nick.cl Setup (en panel de control)

### Cuenta y Dominio
- [ ] Registrarse en https://www.nickserver.cl
- [ ] Comprar dominio `aulia.cl`
- [ ] Esperar activación (~15-30 min)

### Hosting Plan
- [ ] Verificar que el plan incluya **Node.js** (v18+)
- [ ] Verificar que el plan incluya **PostgreSQL 13+**
- [ ] Obtener acceso **SSH** al servidor

### DNS Configuration
En el panel Nick.cl → Dominios → `aulia.cl` → Gestionar DNS:
- [ ] Registro **A**: `aulia.cl` → IP del servidor Nick.cl
- [ ] Registro **MX**: `aulia.cl` → `mail.nickserver.cl` (prioridad 10)
- [ ] Registro **CNAME**: `www` → `aulia.cl.`
- [ ] Generar y activar **SSL/TLS** (Let's Encrypt)
- [ ] Esperar propagación DNS (~15-30 min)

### Base de Datos PostgreSQL
En el panel Nick.cl → Bases de Datos → PostgreSQL:
- [ ] Crear database: `aulia_prod`
- [ ] Crear usuario: `aulia_user` (contraseña fuerte)
- [ ] Obtener **HOST** (probablemente `localhost` o IP interna)
- [ ] Obtener **PORT** (default 5432)
- [ ] Anotar credenciales en lugar seguro ⬇️

```
DATABASE_URL = postgresql://aulia_user:CONTRASEÑA@HOST:5432/aulia_prod
```

---

## 🔐 PASO 3: Variables de Entorno

Crear archivo `.env.production` **EN EL SERVIDOR NICK.CL** (no en GitHub):

```bash
# SSH en Nick.cl
ssh usuario@aulia.cl
cd /var/www/aulia
nano .env.production
```

Copiar y completar valores:

```bash
# Database (de arriba)
DATABASE_URL="postgresql://aulia_user:TU_CONTRASEÑA@localhost:5432/aulia_prod"

# Auth (generar con: openssl rand -base64 32)
NEXTAUTH_SECRET="valor_aleatorio_base64"
NEXTAUTH_URL="https://aulia.cl"

# Email (si Nick.cl ofrece)
SMTP_HOST="smtp.nickserver.cl"
SMTP_PORT="587"
SMTP_USER="noreply@aulia.cl"
SMTP_PASS="tu_contraseña_email"
SMTP_FROM="noreply@aulia.cl"

# Pagos Transbank (déjalo vacío si no está implementado aún)
TRANSBANK_COMMERCE_CODE=""
TRANSBANK_API_KEY=""

# Web Push (déjalo vacío si no está implementado aún)
WEB_PUSH_PUBLIC_KEY=""
WEB_PUSH_PRIVATE_KEY=""

# IA (déjalo vacío si no está listo)
ANTHROPIC_API_KEY=""

# Node environment (CRÍTICO)
NODE_ENV="production"
```

**Guardar**: `Ctrl+O`, `Enter`, `Ctrl+X` (nano)

---

## 📦 PASO 4: Desplegar Código

### Opción A: Rsync desde local (recomendado si tienes SSH)

```bash
# En tu máquina local:
cd /tmp/aulia

# Subir código (excluyendo node_modules, .next, .git)
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude .env.* \
  . usuario@aulia.cl:/var/www/aulia/

# Luego en servidor (ver Paso 5)
```

### Opción B: Git clone en servidor (alternativa)

```bash
# SSH en Nick.cl
ssh usuario@aulia.cl
cd /var/www

# Clonar repo (si es privado, usar deploy key)
git clone https://github.com/tu-org/aulia.git
cd aulia

# O si ya existe:
cd aulia
git pull origin main
```

---

## 🔨 PASO 5: Build en Nick.cl

```bash
# SSH en Nick.cl
ssh usuario@aulia.cl
cd /var/www/aulia

# 1. Instalar dependencias
npm install

# 2. Generar Prisma Client
npm run postinstall

# 3. Build de Next.js
npm run build
# ← Esto puede tomar 3-5 min, es normal

# 4. Migrar Base de Datos
npx prisma migrate deploy
# ← Aplica todas las migraciones del schema.prisma

# 5. Verificar build
ls -la .next/
# Debe existir la carpeta .next/ con archivos compilados
```

---

## 🚀 PASO 6: Iniciar Aplicación

### Usar PM2 (más simple)

```bash
# SSH en Nick.cl
ssh usuario@aulia.cl
cd /var/www/aulia

# Instalar PM2 (si no está)
sudo npm install -g pm2

# Iniciar app
pm2 start npm --name aulia -- start

# Guardar configuración
pm2 save
sudo pm2 startup

# Ver logs
pm2 logs aulia
```

### Usar Systemd (más profesional)

Ver `DEPLOYMENT_NICKL.md` sección 6.3 para configurar systemd.

---

## 🌐 PASO 7: Configurar Nginx (Reverse Proxy)

```bash
# SSH en Nick.cl (como root o sudo)
sudo nano /etc/nginx/sites-available/aulia.cl
```

Pegar (ver `DEPLOYMENT_NICKL.md` sección 6.4 para config completa):

```nginx
# Redirigir HTTP → HTTPS
# Proxy a localhost:3000
# Security headers
```

```bash
# Activar sitio
sudo ln -s /etc/nginx/sites-available/aulia.cl /etc/nginx/sites-enabled/

# Verificar sintaxis
sudo nginx -t

# Recargar
sudo systemctl reload nginx
```

---

## ✅ PASO 8: Verificación Post-Deployment

```bash
# 1. ¿DNS resuelve?
nslookup aulia.cl
# Debe retornar IP de Nick.cl

# 2. ¿HTTPS funciona?
curl -I https://aulia.cl
# HTTP/2 200 OK

# 3. ¿App responde?
curl https://aulia.cl/
# Debe retornar HTML con "Aulia", "login", etc

# 4. ¿BD conecta?
# En servidor:
ssh usuario@aulia.cl
cd /var/www/aulia
npx prisma studio
# Browser a http://localhost:5555
# (Si abre, BD está OK)

# 5. ¿Logs limpios?
pm2 logs aulia
# No debe haber errores FATAL o CONNECTION REFUSED
```

---

## 👤 PASO 9: Crear Usuario de Prueba para Profesora

```bash
# SSH en Nick.cl
ssh usuario@aulia.cl
cd /var/www/aulia

# Opción A: Via Prisma Studio
npx prisma studio
# Ir a http://localhost:5555
# Crear Usuario manual en la UI

# Opción B: Script SQL directo
psql -U aulia_user -d aulia_prod <<EOF
-- Crear usuario de prueba
INSERT INTO "Usuario" (
  id, email, nombre, telefono, rol, "colegioId", "membresiaId", 
  "contraHash", "activo", "creadaEn"
)
VALUES (
  'prof-test-001',
  'profesora@escuela.cl',
  'Profesora de Prueba',
  '+56912345678',
  'PROFESOR',
  'colegio-id-aqui',
  'membresia-id-aqui',
  '', -- Password será seteable al primer login
  true,
  NOW()
);
EOF
```

**Nota:** Necesitas reemplazar `colegio-id-aqui` y `membresia-id-aqui` con IDs reales.

Alternativa: Usa Prisma Studio para crear datos sin SQL manual.

---

## 📧 PASO 10: Enviar Link a Profesora

```
─────────────────────────────────────
🎯 AULIA - Testing para Profesores
─────────────────────────────────────

URL:          https://aulia.cl/login

Email:        profesora@escuela.cl
Contraseña:   [temporal, cambiar al primer login]

Tiempo estimado: 2 horas de testing
Reportar errores a: soporte@aulia.cl

─────────────────────────────────────
```

---

## 🚨 Problemas Comunes

| Problema | Checklist |
|----------|-----------|
| **502 Bad Gateway** | ¿`pm2 status`? Si no corre, `pm2 start npm -- start` |
| **Connection refused (BD)** | ¿`DATABASE_URL` correcto en `.env.production`? ¿PostgreSQL corriendo? |
| **NEXTAUTH_SECRET undefined** | ¿Está en `.env.production`? Reiniciar app: `pm2 restart aulia` |
| **SSL certificate error** | ¿DNS propagó (15-30 min)? ¿Let's Encrypt activo en Nick.cl? |
| **Styles/JS no cargan** | `npm run build` nuevamente, `pm2 restart aulia` |
| **Timeout 504** | Aumentar timeout Nginx a 60s en config, `sudo systemctl reload nginx` |

---

## 📞 Contactos

**Nick.cl Support:**
- Teléfono: +56 2 2940 4000
- Email: soporte@nickserver.cl
- Chat: https://www.nickserver.cl

**Tu equipo dev:**
- Email: [agregue aquí]
- Slack: [agregue aquí]

---

## ⏱️ Tiempo Total Estimado

- Preparación Nick.cl: **30 min**
- Desplegar código: **10 min**
- Build en servidor: **5 min**
- Configurar Nginx: **10 min**
- Migrar BD: **2 min**
- Verificación: **5 min**

**TOTAL: ~1-2 horas** (más espera de DNS propagation)

---

**Versión:** 1.0 | **Última actualización:** 2026-07-28 | **Estado:** Listo para deployment
