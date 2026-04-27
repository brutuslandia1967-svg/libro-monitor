# 📚 libro-monitor

Monitor de disponibilidad para:

> **Alcázar Molina, M. (2003).** *Valoración Inmobiliaria*. Madrid: Editorial Montecorvo, S.A.
> ISBN 978-84-7111-427-3

Vigila **Iberlibro**, **Uniliber** y **Todocoleccion** y avisa por email en cuanto aparece un ejemplar nuevo.

---

## 🚀 Setup local (ordenador propio)

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo de configuración
cp .env.example .env
# luego editar .env con tu SMTP (Dondominio, Gmail, etc.)

# 3. Primera ejecución (establece baseline silencioso)
npm run check

# 4. Ejecuciones sucesivas (avisan de novedades)
npm run check
```

### Programar ejecución automática (cron en macOS/Linux)

Editar crontab:
```bash
crontab -e
```

Añadir línea para revisar 2 veces al día:
```
0 9,18 * * * cd /ruta/a/libro-monitor && /usr/local/bin/node monitor.js >> monitor.log 2>&1
```

---

## ☁️ Setup gratuito en GitHub Actions (recomendado)

Te corre **automáticamente cada día** sin que tengas que dejar el ordenador encendido.

1. Crea un repositorio nuevo en GitHub (puede ser privado).
2. Sube estos archivos al repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin git@github.com:tu-usuario/libro-monitor.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**

   Crea estos secretos (uno por uno):
   | Nombre | Valor |
   |---|---|
   | `SMTP_HOST` | `smtp.dondominio.com` (o tu servidor) |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | tu cuenta de correo |
   | `SMTP_PASS` | tu contraseña SMTP |
   | `NOTIFY_TO` | email donde quieres recibir avisos |
   | `NOTIFY_FROM` | email remitente (normalmente igual a `SMTP_USER`) |

4. Listo. El workflow corre cada día a las 08:00 UTC. También puedes lanzarlo a mano:
   **Actions → Check libro disponibilidad → Run workflow**

---

## 🔧 Archivos

```
libro-monitor/
├── monitor.js              ← script principal
├── package.json            ← dependencias
├── .env.example            ← plantilla de configuración
├── .gitignore
├── README.md
└── .github/workflows/
    └── check.yml           ← GitHub Actions: ejecución diaria
```

---

## 🛠️ Notas técnicas

- **Primera ejecución**: establece el baseline en silencio (no envía email aunque haya listados). Los avisos llegan a partir de la 2ª ejecución, solo cuando aparece algo **nuevo**.
- **Estado persistente**: se guarda en `seen-listings.json`. Si quieres "olvidar" lo visto y empezar de cero: `npm run reset`.
- **Selectores HTML**: los parsers son heurísticos. Si una de las webs cambia su estructura, ese parser dejará de extraer datos (los otros seguirán funcionando — el script aísla fallos por fuente). Inspecciona el HTML con DevTools y ajusta los selectores en `monitor.js`.
- **Cortesía con los servidores**: hay una pausa de 2,5 s entre fuentes y se usa un User-Agent realista. No abuses bajando la frecuencia por debajo de varias horas.
- **Por qué no hay API**: ni Iberlibro, ni Uniliber, ni Todocoleccion ofrecen API pública para búsquedas. Por eso es scraping HTML.

---

## 📬 Cuando recibas el aviso

El email incluye título, precio, vendedor y enlace directo al listado. Para libros raros descatalogados, **actúa rápido**: estos ejemplares en librerías de viejo suelen venderse en horas o días.

---

## 🧪 Test rápido sin email configurado

Si todavía no tienes SMTP, el script imprime por consola lo que habría enviado. Útil para verificar que los parsers capturan bien:

```bash
node monitor.js
```

Verás algo como:
```
🔍 [2026-04-27T...] Verificando disponibilidad…
  → Iberlibro
     12 resultados | 0 nuevos
  → Uniliber
     3 resultados | 0 nuevos
  → Todocoleccion
     0 resultados | 0 nuevos
✅ Sin novedades.
```
