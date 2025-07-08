# 🏗️ Estado Actual de Infraestructura SKYN3T.CL

## 📋 Resumen Ejecutivo
Este documento detalla el estado actual de la infraestructura de SKYN3T.CL, incluyendo servicios configurados, migraciones en curso y próximos pasos para completar la infraestructura empresarial.

**Última actualización:** Julio 8, 2025  
**Estado general:** En migración activa  
**Prioridad actual:** Migración web de HostiLimitado a Cloudflare  

---

## 🖥️ Información del Servidor Principal

### **Servidor PBX/Telefonía**
- **Hostname:** `SKYN3T.CL`
- **IP Pública:** `146.19.215.149`
- **IP IPv6:** `2602:fb54:1800::19f`
- **Sistema Operativo:** Ubuntu 22.04.5 LTS (Jammy Jellyfish)
- **Recursos:**
  - **CPU:** Disponible para consulta
  - **RAM:** 16GB (uso actual ~474MB, 14GB disponibles)
  - **Disco:** 469GB total, 25GB usado, 426GB disponibles
  - **Swap:** No configurado

### **Ubicación y Red**
- **Datacenter:** No especificado
- **IPv6:** Habilitado
- **Firewall:** UFW configurado con reglas para servicios

---

## ☎️ Servicios PBX/Telefonía Configurados

### **Asterisk PBX**
- **Estado:** ✅ **FUNCIONANDO**
- **Versión:** Asterisk 20.14.1
- **FreePBX:** 16.0.40.13
- **Interfaz Web:** `http://146.19.215.149:8080/admin`

#### **Configuración Actual:**
- **Hostname configurado:** `SKYN3T.CL` ✅
- **Domain/Realm:** `SKYN3T.CL` ✅
- **Transporte SIP:** UDP puerto 5060 ✅
- **External Address:** `SKYN3T.CL` ✅

#### **Extensiones Configuradas:**
- **2001:** Oficina Principal - Office
- **2002:** Oficina Principal - Security  
- **2003:** Oficina Principal - Security

#### **Estado de Extensiones:**
```
2001: Unavailable (200.28.242.90:23453)
2002: Available (191.126.185.42:3136) ✅
2003: Unavailable
```

#### **Puertos Configurados:**
- **SIP:** 5060 (UDP/TCP)
- **RTP:** 10000-20000 (UDP)
- **Web Interface:** 8080 (TCP)

### **Verificación PBX:**
```bash
# Estado de servicios
systemctl status asterisk    # active
systemctl status apache2     # active  
systemctl status mariadb     # active

# Verificar extensiones
asterisk -rx "pjsip show endpoints"

# Verificar configuración
asterisk -rx "pjsip show transports"
asterisk -rx "pjsip show settings" | grep realm
```

---

## 🌐 Estado del Dominio y DNS

### **Información del Dominio:**
- **Dominio:** `SKYN3T.CL`
- **Registrante:** Pedro Ibaceta
- **Registrador:** Hosting Concepts B.V. d/b/a Registrar.eu (OpenProvider.es)
- **Expiración:** 2025-12-01 ✅ (vigente)

### **DNS Actual (En migración):**
- **Nameservers actuales:** `miami0101.hostilimitado.com`, `miami0102.hostilimitado.com`
- **Nameservers destino:** Cloudflare (por configurar)

#### **Registros DNS Actuales:**
```dns
A     SKYN3T.CL          →  162.250.127.74  (HostiLimitado)
MX    SKYN3T.CL          →  Google Workspace
      - ASPMX.L.GOOGLE.COM (prioridad 1)
      - ALT1.ASPMX.L.GOOGLE.COM (prioridad 5)
      - ALT2.ASPMX.L.GOOGLE.COM (prioridad 5)
      - ALT3.ASPMX.L.GOOGLE.COM (prioridad 10)
      - ALT4.ASPMX.L.GOOGLE.COM (prioridad 10)

TXT   SKYN3T.CL          →  "v=spf1 include:_spf.google.com ~all"
TXT   SKYN3T.CL          →  "google-site-verification=gQVEFTXnixWvA3ywOBQLSOYCEgEEFWYPmcrhG85mcfg"
```

#### **Registros DNS Objetivo (Post-migración):**
```dns
A     SKYN3T.CL          →  146.19.215.149  (Servidor PBX)
A     www.SKYN3T.CL      →  Cloudflare Pages
A     mail.SKYN3T.CL     →  146.19.215.149  (Servidor PBX)
MX    SKYN3T.CL          →  mail.SKYN3T.CL (prioridad 10)
TXT   SKYN3T.CL          →  "v=spf1 mx ~all"
```

---

## 🌐 Estado de Migración Web

### **FASE ACTUAL: Migración de HostiLimitado a Cloudflare**

#### **Servidor Web Actual (HostiLimitado):**
- **IP:** `162.250.127.74`
- **Panel:** `https://cpanel.hostilimitado.com/`
- **Usuario:** `skyn3t`
- **Directorio:** `/home/skyn3t/public_html`
- **Tipo de sitio:** WordPress + PHP
- **Tamaño:** ~103.6 MB

#### **Estado de Migración:**
- **✅ Acceso a cPanel:** Confirmado
- **✅ Backup descargado:** `skyn3t.zip` (103.621 KB)
- **✅ Cloudflare configurado:** Dashboard activo
- **🔄 En proceso:** Subida a Cloudflare Pages
- **⏳ Pendiente:** Cambio de DNS
- **⏳ Pendiente:** Verificación funcionamiento

#### **Archivos del Sitio Web:**
```
/public_html/
├── assets/              # Recursos estáticos
├── cgi-bin/            # Scripts CGI
├── wp-admin/           # WordPress Admin
├── wp-content/         # Contenido WordPress
│   ├── themes/         # Temas
│   ├── plugins/        # Plugins
│   └── uploads/        # Media files
├── wp-includes/        # WordPress Core
├── skyn3t.cl/         # Contenido personalizado
├── index.html         # Página principal
├── wp-config.php      # Configuración WordPress
└── otros archivos PHP
```

### **Cloudflare Configuration:**
- **Account:** `Pedroibaceta.p@gmail.com`
- **Plan:** Free
- **Estado:** DNS importado, esperando configuración final

---

## 📧 Servicios de Email (Por Configurar)

### **Estado Actual:**
- **Postfix:** ❌ Instalado pero inactivo
- **Dovecot:** ❌ Instalado pero inactivo
- **Webmail:** ❌ No instalado (Roundcube pendiente)
- **Certificados SSL:** ❌ Usando autofirmados temporales

### **Configuración Preparada:**
```ini
# Postfix Main Configuration
myhostname = mail.SKYN3T.CL
mydomain = SKYN3T.CL
myorigin = SKYN3T.CL
mydestination = SKYN3T.CL, mail.SKYN3T.CL, localhost
home_mailbox = Maildir/
```

### **Usuarios de Email Planificados:**
- `admin@SKYN3T.CL`
- `contacto@SKYN3T.CL`
- `soporte@SKYN3T.CL`
- Otros según necesidad

### **Protección Anti-Spam Planificada:**
- **SpamAssassin:** Por instalar
- **ClamAV:** Por instalar
- **Fail2ban:** Por configurar para email

---

## 🎫 Sistema de Tickets (Planificado)

### **Opciones Evaluadas:**
1. **osTicket** (Recomendado para integración)
2. **Zammad** (Moderno, más recursos)
3. **Request Tracker (RT)** (Robusto, complejo)
4. **FreshDesk** (Cloud, pero no self-hosted)

### **Integración Planificada:**
- **Email:** Tickets via email automático
- **PBX:** Integración con Asterisk para tickets telefónicos
- **Web:** Portal de soporte integrado
- **Base de datos:** MySQL/MariaDB compartida

### **Funcionalidades Requeridas:**
- Gestión de tickets por email
- Portal web para clientes
- Integración con sistema telefónico
- Reportes y métricas
- Notificaciones automáticas

---

## 🔒 Seguridad y Monitoreo

### **Firewall (UFW) Configurado:**
```bash
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
8080/tcp                   ALLOW       Anywhere
5060/udp                   ALLOW       Anywhere
5060/tcp                   ALLOW       Anywhere
10000:20000/udp           ALLOW       Anywhere
25/tcp                     ALLOW       Anywhere
587/tcp                    ALLOW       Anywhere
465/tcp                    ALLOW       Anywhere
993/tcp                    ALLOW       Anywhere
995/tcp                    ALLOW       Anywhere
143/tcp                    ALLOW       Anywhere
110/tcp                    ALLOW       Anywhere
```

### **Servicios de Seguridad:**
- **Fail2ban:** ❌ No configurado aún
- **SSL/TLS:** ❌ Certificados autofirmados temporales
- **Backup automatizado:** ❌ Por configurar
- **Monitoreo:** ❌ Por implementar

### **Certificados SSL Planeados:**
- **Let's Encrypt:** Para todos los servicios
- **Dominios a certificar:**
  - `SKYN3T.CL`
  - `www.SKYN3T.CL`
  - `mail.SKYN3T.CL`
  - `tickets.SKYN3T.CL`

---

## 📊 Próximos Pasos Inmediatos

### **FASE 1: Completar Migración Web (En curso)**
1. **✅ Completado:** Descarga de archivos de HostiLimitado
2. **🔄 En proceso:** Subida a Cloudflare Pages
3. **⏳ Siguiente:** Configurar dominio custom en Cloudflare
4. **⏳ Siguiente:** Cambiar nameservers a Cloudflare
5. **⏳ Siguiente:** Verificar funcionamiento completo
6. **⏳ Siguiente:** Configurar redirects y optimizaciones

### **FASE 2: Configurar Servidor de Email (Próximo)**
1. Activar y configurar Postfix/Dovecot
2. Configurar SSL con Let's Encrypt
3. Instalar y configurar Roundcube (Webmail)
4. Crear cuentas de email principales
5. Configurar SPF, DKIM, DMARC
6. Instalar SpamAssassin y ClamAV
7. Configurar Fail2ban para email
8. Realizar pruebas de deliverability

### **FASE 3: Sistema de Tickets (Después de email)**
1. Evaluar y seleccionar plataforma definitiva
2. Instalar sistema de tickets elegido
3. Configurar integración con email
4. Configurar integración con PBX
5. Personalizar portal de soporte
6. Configurar flujos de trabajo
7. Capacitación y documentación

### **FASE 4: Optimización y Monitoreo**
1. Configurar backup automático completo
2. Implementar monitoreo de servicios
3. Optimizar rendimiento
4. Configurar alertas
5. Documentación final de procesos

---

## 🛠️ Comandos de Verificación Rápida

### **Estado General del Servidor:**
```bash
# Información básica
hostname
whoami
uptime
df -h
free -h

# Servicios principales
systemctl status asterisk apache2 mariadb
```

### **Verificación PBX:**
```bash
# Estado Asterisk
asterisk -rx "core show uptime"
asterisk -rx "pjsip show endpoints"
asterisk -rx "pjsip show transports"
asterisk -rx "pjsip show settings" | grep realm

# Verificar extensiones activas
asterisk -rx "pjsip show aors"
```

### **Verificación Web:**
```bash
# Verificar Apache
systemctl status apache2
curl -I http://localhost:8080/admin

# Verificar puertos
netstat -tulpn | grep -E "(80|443|8080)" | grep LISTEN
```

### **Verificación DNS:**
```bash
# Estado actual del dominio
dig A SKYN3T.CL +short
dig MX SKYN3T.CL +short
dig TXT SKYN3T.CL

# Verificar nameservers
dig NS SKYN3T.CL +short
```

### **Verificación Email (cuando esté configurado):**
```bash
# Servicios de email
systemctl status postfix dovecot

# Puertos de email
netstat -tulpn | grep -E "(25|587|993|995|143|110)" | grep LISTEN

# Logs de email
tail -20 /var/log/mail.log
```

---

## 📞 Información de Contacto y Accesos

### **Accesos Principales:**
- **FreePBX Web:** `http://146.19.215.149:8080/admin`
- **Cloudflare Dashboard:** `https://dash.cloudflare.com/`
- **HostiLimitado cPanel:** `https://cpanel.hostilimitado.com/`

### **Credenciales Importantes:**
- **Servidor:** Acceso root configurado
- **FreePBX:** Admin configurado
- **Cloudflare:** `Pedroibaceta.p@gmail.com`
- **HostiLimitado:** Usuario `skyn3t`

### **Dominios y Servicios:**
- **Dominio principal:** `SKYN3T.CL`
- **Registrador:** OpenProvider.es
- **Email actual:** Google Workspace (a migrar)

---

## 📝 Notas Técnicas Importantes

### **Consideraciones de WordPress:**
El sitio actual es WordPress + PHP, pero Cloudflare Pages es para sitios estáticos. Opciones:
1. **Conversión a estático:** Usar plugins como "Simply Static"
2. **Cloudflare Workers:** Para mantener funcionalidad PHP
3. **Hosting híbrido:** Estático en Pages, dinámico en Workers

### **Migración de Email:**
- Actualmente en Google Workspace
- Migración completa planeada al servidor propio
- Importante configurar correctamente SPF/DKIM/DMARC para deliverability

### **Integración PBX-Tickets:**
- Asterisk puede generar tickets automáticamente
- Integración via AGI scripts o webhooks
- Base de datos compartida para correlación de datos

### **Backup y Recuperación:**
- Planificar backup automático diario
- Incluir: Configuraciones, base de datos, archivos web, configuración PBX
- Probar procedimientos de recuperación

---

## 🔄 Historial de Cambios

### **2025-07-08: Configuración inicial completada**
- ✅ Servidor PBX Asterisk configurado y funcionando
- ✅ Hostname cambiado a SKYN3T.CL
- ✅ Dominio configurado en PJSIP
- ✅ Extensiones creadas y funcionando
- ✅ FreePBX operativo
- 🔄 Iniciada migración web de HostiLimitado
- ✅ Backup del sitio web descargado
- 🔄 Configuración de Cloudflare iniciada

### **Próximas actualizaciones:**
- Completar migración web
- Configurar servidor de email
- Implementar sistema de tickets
- Optimización y monitoreo

---

*Documento generado automáticamente - Última actualización: 2025-07-08 14:45 UTC*  
*Responsable técnico: Pedro Ibaceta*  
*Estado del proyecto: Migración activa - Fase 1 Web*
