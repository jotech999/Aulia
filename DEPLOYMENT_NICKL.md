# 🚀 Guía de Deployment: Aulia en Nick.cl

**Objetivo:** Desplegar la plataforma Aulia (gestión escolar) en Nick.cl con dominio `aulia.cl` para testing de profesores.

---

## 1. Prerrequisitos

### 1.1 Cuenta en Nick.cl
- [ ] Registrarse en https://www.nickserver.cl (hosting chileno)
- [ ] Comprar dominio `aulia.cl` en Nick.cl
- [ ] Activar: **Node.js** (v18+) y **PostgreSQL** en el plan
- [ ] Acceso SSH al servidor

### 1.2 Herramientas locales
```bash
# Node.js 18+ y npm/yarn
node --version   # v18.0.0+
npm --version    # 9.0.0+

# Git (para clonar el repo)
git --version

# PostgreSQL client (para testing local)
psql --version
```

---

## 2. Preparación de la Aplicación

### 2.1 Build en producción (local first)
```bash
cd /tmp/aulia

# 1. Instalar dependencias
npm install

# 2. Generar Prisma Client
npm run postinstall

# 3. Compilar TypeScript
npm run lint

# 4. Build de Next.js
npm run build

# 5. Verificar que la build sea exitosa
# Debe crear carpeta .next/
ls -la .next/
```

### 2.2 Checklist de archivos críticos
```
✓ /tmp/aulia/.next/         ← Build compilada
✓ /tmp/aulia/prisma/        ← Migrations y schema
✓ /tmp/aulia/public/        ← Favicon, manifest, SW
✓ /tmp/aulia/package.json   ← Dependencies
✓ /tmp/aulia/node_modules/  ← Librerias
```

---

## 3. Base de Datos PostgreSQL

### 3.1 Crear base de datos en Nick.cl

**Via Nick.cl Panel (Control Panel):**
1. Ir a "Bases de Datos" → "PostgreSQL"
2. Crear nueva base de datos:
   - **Nombre:** `aulia_prod`
   - **Usuario:** `aulia_user`
   - **Contraseña:** (generar fuerte, guardar en seguro)
   - **Host:** (Nick.cl te dará algo como `localhost` o IP interna)

**Via SSH (alternativa):**
```bash
# Conectar al servidor Nick.cl
ssh usuario@aulia.cl

# Crear base de datos y usuario
sudo -u postgres psql <<EOF
CREATE DATABASE aulia_prod;
CREATE USER aulia_user WITH PASSWORD 'TU_CONTRASEÑA_FUERTE';
ALTER ROLE aulia_user SET client_encoding TO 'utf8';
ALTER ROLE aulia_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE aulia_user SET default_transaction_deferrable TO on;
GRANT ALL PRIVILEGES ON DATABASE aulia_prod TO aulia_user;
EOF
```

### 3.2 Obtener DATABASE_URL
```
postgresql://aulia_user:CONTRASEÑA@localhost:5432/aulia_prod

Reemplazar:
- CONTRASEÑA = la que creaste
- localhost = host que te dió Nick.cl (puede ser 127.0.0.1 o IP)
- 5432 = puerto (default PostgreSQL)
```

---

## 4. Variables de Entorno (.env.production)

Crear archivo `/tmp/aulia/.env.production`:

```bash
# Database
DATABASE_URL="postgresql://aulia_user:CONTRASEÑA@host:5432/aulia_prod"

# NextAuth (CRÍTICO para login)
NEXTAUTH_SECRET="$(openssl rand -base64 32)"  # Generar valor aleatorio
NEXTAUTH_URL="https://aulia.cl"

# API / Transbank (pagos)
TRANSBANK_COMMERCE_CODE="tu_codigo_transbank"
TRANSBANK_API_KEY="tu_api_key_transbank"

# Web Push (notificaciones)
WEB_PUSH_EMAIL="admin@aulia.cl"
WEB_PUSH_PUBLIC_KEY="tu_public_key"
WEB_PUSH_PRIVATE_KEY="tu_private_key"

# IA (Anthropic - opcional para MVP)
ANTHROPIC_API_KEY="tu_api_key_anthropic"

# Email (para invitaciones, recuperación de contraseña)
SMTP_HOST="smtp.nick.cl"  # O tu proveedor de mail
SMTP_PORT="587"
SMTP_USER="noreply@aulia.cl"
SMTP_PASS="contraseña_email"

# Google/OAuth (opcional)
GOOGLE_ID="tu_client_id_google"
GOOGLE_SECRET="tu_client_secret_google"

# Node environment
NODE_ENV="production"
```

---

## 5. DNS & Dominio

### 5.1 Configurar DNS en Nick.cl
En el panel de Nick.cl, ir a "Dominios" → `aulia.cl` → "Gestionar DNS":

```
Registro A:
Nombre:    aulia.cl
Tipo:      A
Valor:     XXX.XXX.XXX.XXX  (IP del servidor Nick.cl)
TTL:       3600

Registro MX (para email):
Nombre:    aulia.cl
Tipo:      MX
Valor:     mail.nickserver.cl
Prioridad: 10
TTL:       3600

Registro CNAME (www):
Nombre:    www
Tipo:      CNAME
Valor:     aulia.cl.
TTL:       3600
```

**Verificar DNS:**
```bash
nslookup aulia.cl
dig aulia.cl
# Debe resolver a IP de Nick.cl en ~10-15 min
```

### 5.2 SSL/TLS Certificate
Nick.cl incluye Let's Encrypt gratuito:
- [ ] Activar SSL en panel Nick.cl
- [ ] Generar certificado para `aulia.cl` y `www.aulia.cl`
- [ ] Auto-renew debe estar activo (default)

---

## 6. Deployment Steps

### 6.1 Vía SFTP (recomendado para Nick.cl)

**Opción A: Desde local con rsync**
```bash
# Configurar credenciales SSH
# 1. Generar keypair (si no tienes)
ssh-keygen -t ed25519 -f ~/.ssh/nick_aulia

# 2. Copiar public key al servidor Nick.cl
# (Cargar en panel Nick.cl → SSH Keys)

# 3. Rsync: subir aplicación
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  /tmp/aulia/ \
  usuario@aulia.cl:/var/www/aulia/

# 4. Conectar y compilar en servidor
ssh usuario@aulia.cl

# En el servidor Nick.cl:
cd /var/www/aulia
npm install
npm run build
npx prisma migrate deploy
```

**Opción B: Git + CI/CD (GitHub Actions)**
```bash
# En repo de GitHub:
# 1. Agregar secrets:
#    - SSH_PRIVATE_KEY
#    - SSH_HOST
#    - SSH_USER
#    - DATABASE_URL
#    - NEXTAUTH_SECRET
#    - etc (todas las env vars)

# 2. Crear .github/workflows/deploy.yml
# (ver más abajo)
```

### 6.2 Primeras migraciones de BD

```bash
# SSH en servidor Nick.cl
ssh usuario@aulia.cl
cd /var/www/aulia

# Ejecutar migraciones Prisma
npx prisma migrate deploy

# Generar Prisma Client
npm run postinstall

# Seedear datos iniciales (opcional)
npm run db:seed
```

### 6.3 Iniciar aplicación en producción

**Opción A: PM2** (recomendado)
```bash
# Instalar PM2 globalmente
npm install -g pm2

# Crear y lanzar app
pm2 start npm --name aulia -- start

# Guardar y auto-restart en reboot
pm2 save
pm2 startup

# Ver logs
pm2 logs aulia
pm2 status
```

**Opción B: Systemd** (más estable en producción)
```bash
# Crear archivo /etc/systemd/system/aulia.service
sudo tee /etc/systemd/system/aulia.service > /dev/null <<EOF
[Unit]
Description=Aulia - Gestión Escolar
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/aulia
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Activar y lanzar
sudo systemctl enable aulia
sudo systemctl start aulia
sudo systemctl status aulia
```

### 6.4 Reverse Proxy (Nginx)
Nick.cl probablemente incluye Nginx. Configurar para que redirija port 80/443 a Node.js en 3000:

```nginx
# /etc/nginx/sites-available/aulia.cl

server {
    listen 80;
    listen [::]:80;
    server_name aulia.cl www.aulia.cl;
    
    # Redirigir HTTP a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name aulia.cl www.aulia.cl;
    
    ssl_certificate /etc/letsencrypt/live/aulia.cl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aulia.cl/privkey.pem;
    
    # Security headers (Next.js también lo hace, pero no duele)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    
    # Reverse proxy a Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activar:
```bash
sudo ln -s /etc/nginx/sites-available/aulia.cl /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Verificación Post-Deployment

### 7.1 Health Checks
```bash
# 1. DNS resuelve?
nslookup aulia.cl
# Debe retornar IP de Nick.cl

# 2. HTTPS funciona?
curl -I https://aulia.cl
# HTTP/2 200, certificado válido

# 3. App responde?
curl https://aulia.cl/
# Debe retornar HTML de página login

# 4. Database conecta?
# En servidor Nick.cl:
ssh usuario@aulia.cl
cd /var/www/aulia
npx prisma studio  # Abre UI a http://localhost:5555
# (si funciona, BD está ok)

# 5. Logs limpios?
pm2 logs aulia | head -20
# No debe haber errores FATAL
```

### 7.2 Performance
```bash
# Lighthouse check (desde cualquier navegador)
# Ir a https://aulia.cl
# Abrir DevTools → Lighthouse
# Target: Performance 80+, Accessibility 95+

# Ver build size
cd /tmp/aulia
npm run build
du -sh .next/
# Debe ser < 50MB
```

---

## 8. Acceso para testing de profesor

### 8.1 Crear cuenta de prueba
```bash
# En servidor Nick.cl:
ssh usuario@aulia.cl
cd /var/www/aulia

# Opción A: Vía Prisma Studio
npx prisma studio
# Crear usuario manual en UI

# Opción B: Script SQL
psql -U aulia_user -d aulia_prod <<EOF
-- Usuario de prueba
INSERT INTO "Usuario" (id, email, nombre, telefono, rol, "colegioId", "membresiaId")
VALUES (
  'test-profesor-001',
  'profesora@gmail.com',
  'Profesora de Prueba',
  '+56912345678',
  'PROFESOR',
  '...colegio-id...',
  '...membresia-id...'
);
EOF
```

### 8.2 Compartir link
```
Enviar a la profesora:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URL:       https://aulia.cl/login
Email:     profesora@gmail.com
Contraseña: (temporal, cambiar al primer login)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 9. Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| `502 Bad Gateway` | App no está corriendo: `pm2 start npm -- start` |
| `Connection refused a DB` | DATABASE_URL incorrecta o PostgreSQL down |
| `NEXTAUTH_SECRET undefined` | Agregar a .env.production y reiniciar app |
| `SSL certificate error` | Esperar propagación DNS (15-30 min) o regenerar cert |
| `504 Timeout` | Build lenta: aumentar timeout Nginx a 60s |
| Styles/JS no cargan | Usar `npm run build` nuevamente, `pm2 restart aulia` |

---

## 10. Próximos pasos

1. ✅ Crear cuenta Nick.cl + comprar dominio `aulia.cl`
2. ✅ Configurar PostgreSQL en Nick.cl
3. ✅ Generar `.env.production` con credenciales
4. ✅ Hacer `npm run build` localmente (validar que compila)
5. ✅ Subir code via rsync o Git
6. ✅ Compilar y migrar BD en servidor
7. ✅ Iniciar con PM2 o systemd
8. ✅ Configurar Nginx reverse proxy
9. ✅ Verificar https://aulia.cl en navegador
10. ✅ Crear usuario de prueba para profesora
11. ✅ Enviar link y credenciales

---

## 11. Contacto Nick.cl Support

Si necesitas ayuda con hosting/dominio:
- **Teléfono:** +56 2 2940 4000
- **Email:** soporte@nickserver.cl
- **Chat:** https://www.nickserver.cl (live chat en panel)

---

**Estimado:** 2-3 horas totales (incluye propagación DNS)
**Status para profesor:** Listo para testing en ~4 horas desde ahora
