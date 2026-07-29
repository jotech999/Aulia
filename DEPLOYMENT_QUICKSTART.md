# 🚀 Quick Start: Aulia a Nick.cl en 10 Pasos

**Objetivo:** Tener Aulia corriendo en `https://aulia.cl` con profesora testeando en **~2 horas**.

---

## 🎯 Resumen Ejecutivo

```
┌─────────────────────────────────────────────────────┐
│  AULIA - Gestión Escolar Chilena                   │
│  ✓ Landing page: https://aulia.cl                  │
│  ✓ App: https://aulia.cl/login                     │
│  ✓ Testing: Profesora accede con credenciales      │
└─────────────────────────────────────────────────────┘

Arquitectura:
  [Cliente: Browser] 
       ↓ HTTPS
  [Nick.cl: Nginx Reverse Proxy] 
       ↓ proxy_pass
  [Node.js: Next.js App (puerto 3000)]
       ↓ TCP
  [PostgreSQL: BD aulia_prod]
```

---

## 10 Pasos Rápidos

### **PASO 1** — Nick.cl: Crear Dominio y BD (15 min)

En https://www.nickserver.cl:
1. Comprar `aulia.cl` 
2. En "Bases de Datos" → PostgreSQL → Crear `aulia_prod`
3. Usuario: `aulia_user` con contraseña fuerte
4. Anotar `HOST` (será `localhost` o IP)

```
DATABASE_URL = postgresql://aulia_user:PASSWORD@HOST:5432/aulia_prod
```

---

### **PASO 2** — Conectar SSH a Nick.cl (2 min)

```bash
# En tu terminal local
ssh usuario@aulia.cl

# Si pide contraseña, usar la de la cuenta Nick.cl
# Estás dentro del servidor Nick.cl
```

---

### **PASO 3** — Preparar Carpeta (5 min)

```bash
# Dentro del servidor Nick.cl (ssh)
cd /var/www

# Opción A: Rsync desde tu máquina local
# (Ejecutar LOCALMENTE, no en SSH)
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  /tmp/aulia/ usuario@aulia.cl:/var/www/aulia/

# Opción B: Git clone
git clone https://github.com/tu-org/aulia.git aulia
cd aulia
```

---

### **PASO 4** — Variables de Entorno (5 min)

```bash
# Dentro de SSH (en /var/www/aulia)
nano .env.production
```

Copiar (cambiar valores):
```bash
DATABASE_URL="postgresql://aulia_user:TU_PASSWORD@localhost:5432/aulia_prod"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="https://aulia.cl"
SMTP_HOST="smtp.nickserver.cl"
SMTP_PORT="587"
SMTP_USER="noreply@aulia.cl"
SMTP_PASS="tu_password_email"
NODE_ENV="production"
```

**Guardar:** `Ctrl+O` → `Enter` → `Ctrl+X`

---

### **PASO 5** — Build (10 min)

```bash
# Dentro de SSH (en /var/www/aulia)
npm install
npm run build
```

**Esperar:** 3-5 minutos (es lento, es normal)

Verificar:
```bash
ls -la .next/   # Debe existir
```

---

### **PASO 6** — Base de Datos (2 min)

```bash
# Dentro de SSH
npx prisma migrate deploy
```

Esto aplica el schema a PostgreSQL.

---

### **PASO 7** — Iniciar App (2 min)

```bash
# Instalar PM2 (si no está)
sudo npm install -g pm2

# Iniciar
pm2 start npm --name aulia -- start

# Guardar
pm2 save
sudo pm2 startup
```

---

### **PASO 8** — Configurar Nginx (5 min)

```bash
# Crear config
sudo nano /etc/nginx/sites-available/aulia.cl
```

Pegar (copiar exacto de DEPLOYMENT_NICKL.md sección 6.4):

```nginx
server {
    listen 80;
    server_name aulia.cl www.aulia.cl;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name aulia.cl www.aulia.cl;
    
    ssl_certificate /etc/letsencrypt/live/aulia.cl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aulia.cl/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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

### **PASO 9** — Verificar (5 min)

```bash
# Test 1: DNS
nslookup aulia.cl
# Debe retornar IP de Nick.cl

# Test 2: HTTPS
curl -I https://aulia.cl
# HTTP/2 200 OK

# Test 3: App viva
curl https://aulia.cl/
# Retorna HTML con "Aulia"

# Test 4: Logs sin errores
pm2 logs aulia | head -20
# No debe haber FATAL errors
```

---

### **PASO 10** — Usuario de Prueba (5 min)

```bash
# Dentro de SSH
npx prisma studio
# Abre http://localhost:5555 en browser

# O via SQL:
psql -U aulia_user -d aulia_prod <<EOF
INSERT INTO "Usuario" (id, email, nombre, rol, "colegioId", "activo", "creadaEn")
VALUES (
  'prof-001',
  'profesora@escuela.cl',
  'Profesora Test',
  'PROFESOR',
  '...colegio-id...',
  true,
  NOW()
);
EOF
```

Enviar a profesora:
```
URL: https://aulia.cl/login
Email: profesora@escuela.cl
Password: (temporal)
```

---

## ✅ Checklist de Verificación

```
Infraestructura:
☐ Dominio aulia.cl activo
☐ PostgreSQL creada en Nick.cl
☐ SSH funcionando

Código:
☐ /var/www/aulia/ existe
☐ npm install completó
☐ npm run build no tuvo errores
☐ .next/ folder existe

Base de Datos:
☐ DATABASE_URL correcto en .env.production
☐ npx prisma migrate deploy ejecutó sin errores
☐ Tablas creadas en PostgreSQL

Aplicación:
☐ pm2 start npm -- start ejecutó
☐ pm2 status muestra "online"
☐ curl https://aulia.cl retorna 200

Networking:
☐ nslookup aulia.cl resuelve correctamente
☐ DNS propagó (puede tomar 15-30 min)
☐ SSL/HTTPS válido
☐ Nginx reverse proxy activo

Testing:
☐ https://aulia.cl/login accesible
☐ Usuario de prueba creado
☐ Profesora puede logearse
☐ Logs (pm2 logs) sin FATAL errors
```

---

## 🚨 Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| `Connection refused` | `pm2 start npm -- start` |
| `502 Bad Gateway` | `pm2 status` — si dice stopped, reiniciar |
| `Cannot connect to database` | Verificar `DATABASE_URL` en `.env.production` |
| `NEXTAUTH_SECRET missing` | Agregar a `.env.production` y `pm2 restart aulia` |
| `SSL certificate not valid` | Esperar 15-30 min DNS, o regenerar Let's Encrypt |
| `Styles look broken` | Limpiar cache: `Ctrl+Shift+R` en browser |

---

## 📞 Apoyo Rápido

| Pregunta | Respuesta |
|----------|-----------|
| ¿Cómo verifico que está corriendo? | `pm2 status` |
| ¿Dónde ver logs? | `pm2 logs aulia` |
| ¿Cómo restart la app? | `pm2 restart aulia` |
| ¿Cómo stop la app? | `pm2 stop aulia` |
| ¿Cómo eliminar usuario admin? | `npm run db:seed` (crea de nuevo) |

---

## ⏱️ Timing Esperado

```
Paso 1:  15 min ┌─ Nick.cl setup
         + 15 min│ (incluye propagación DNS)
Paso 2:   2 min  │
Paso 3:   5 min  │
Paso 4:   5 min  │
Paso 5:  10 min  │
Paso 6:   2 min  │
Paso 7:   2 min  │
Paso 8:   5 min  │
Paso 9:   5 min  │
Paso 10:  5 min  │
         + 30 min└─ DNS propagation (paralelo)
         ────────
         ~1-2 horas TOTAL
```

---

## 🎓 Próximos Pasos (Post-Launch)

1. Profesora testa y reporta bugs
2. Corregir bugs en rama `dev`
3. `git push` → CI/CD en `.github/workflows/deploy-nickl.yml` auto-deploya
4. Escalar a más usuarios
5. Setup de email real
6. Integración Transbank WebPay
7. Backups automáticos en Nick.cl

---

**¿Preguntas?** Consulta `DEPLOYMENT_NICKL.md` para detalles completos.

**¿Estancado?** Revisa `DEPLOYMENT_CHECKLIST.md` paso-a-paso.

---

**Estado:** Listo para deployment  
**Versión:** Aulia 0.1.0  
**Última actualización:** 2026-07-28  
**Tiempo estimado:** 2 horas hasta profesora testeando  
