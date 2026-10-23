# 💰 Mis Gastos

App personal para registrar gastos, ingresos y transferencias entre tus cuentas de distintos bancos, con categorías.
Es una página web estática (publicada gratis en GitHub Pages) que guarda todo **en tu propia hoja de Google Sheets**.
Las fotos de recibos van a una carpeta de tu Google Drive.

- Sin servidor y sin costo. Funciona siempre, desde el PC o el celular.
- Tus datos nunca pasan por otro lugar: el navegador habla directo con Google usando tu cuenta.
- Puedes ver y editar los datos también desde Google Sheets.

## Qué incluye

- **Resumen mensual**: ingresos, gastos, balance, saldo total, gastos por categoría y los últimos 6 meses.
- **Registro rápido**: escribe `almuerzo 3.50 pichincha` y el formulario se completa solo.
- **Movimientos** con búsqueda y filtros, y foto del recibo opcional.
- **Cuentas por banco** con saldo actual calculado.
- **Categorías** con ícono y color.

## Cómo escribir un movimiento rápido

Solo el monto es obligatorio; el orden da igual.

| Escribes | Se registra |
|---|---|
| `almuerzo 3.50 pichincha` | Gasto $3,50 · Restaurantes · cuenta Pichincha |
| `taxi 2,50 ayer` | Gasto $2,50 · Transporte · fecha de ayer |
| `gasolina 20 lucas` | Gasto $20 · Transporte |
| `bielas con los panas 12 dólares` | Gasto $12 · Restaurantes |
| `me cayó la quincena 450` | Ingreso $450 · Sueldo |
| `+80 cachuelo 15/10` | Ingreso $80 · Freelance · 15 de octubre |

- **Monto**: `3.50`, `3,50`, `$3.50`, `20 lucas`, `20 dólares`, `50 ctvs`.
- **Ingreso**: empieza con `+` o usa *me pagaron, me cayó, quincena, décimo, utilidades, cachuelo, recibí, vendí…*
- **Fecha**: `ayer`, `anteayer`, `15/10`. Si no pones nada, es hoy.
- **Cuenta**: nombre de la cuenta o del banco (`pichincha`, `pacífico`, `produbanco`, `jep`, `efectivo`). Si no, la predeterminada.
- **Categoría**: por palabras clave (*supermaxi, tía, akí, encebollado, ecovía, fybeca, cnt, alícuota…*). Lista en `parser.js` (`CATEGORY_KEYWORDS`).

## La hoja de Google Sheets

La app crea y usa estas pestañas:

| Pestaña | Contenido |
|---|---|
| **Movimientos** | Un movimiento por fila. La columna *Mes* se calcula sola. |
| **Cuentas** | Tus cuentas. *Saldo actual* se calcula con una fórmula. |
| **Categorías** | Tus categorías. |
| **Resumen mensual** | Ingresos y gastos por mes, y gastos por categoría (fórmulas). |

Puedes editar filas a mano en Sheets; la app las lee al recargar (botón ↻). No cambies los encabezados ni la columna *ID*.
Las cuentas y categorías se guardan por nombre en *Movimientos*: si renombras una desde la app, se actualizan todos sus movimientos.

## Configuración (una sola vez)

### 1. Credencial de Google para el navegador
En https://console.cloud.google.com, en el proyecto de la app:

1. Activa **Google Sheets API** y **Google Drive API** (*APIs y servicios → Biblioteca*).
2. *Google Auth Platform* (o *Pantalla de consentimiento de OAuth*): tipo **Externo**, nombre "Mis Gastos", tu correo de soporte. En **Público / Usuarios de prueba**, agrega tu correo de Gmail. Déjala en modo **Prueba**.
3. *Clientes → Crear cliente* → **Aplicación web**. En **Orígenes de JavaScript autorizados** agrega:
   - `https://TU-USUARIO.github.io`
   - `http://localhost:8080` (para probar en tu PC)
4. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`) en `config.js` → `GOOGLE_CLIENT_ID`.

Al entrar por primera vez, Google mostrará "Google no verificó esta app": es tu propia app en modo prueba; elige **Continuar**.

### 2. Publicar en GitHub Pages
1. Crea un repositorio **público** en GitHub (GitHub Pages gratis requiere repositorio público; tus datos no están en el código, están en tu hoja privada).
2. Sube estos archivos (`index.html`, `app.js`, `store.js`, `parser.js`, `config.js`, `styles.css`, `manifest.webmanifest`, `icon.svg`, `.nojekyll`).
3. En el repositorio: *Settings → Pages → Source: Deploy from a branch → main / (root)*.
4. Tu app queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

### 3. Usarla
Abre la dirección, **Entrar con Google**, pega el enlace de tu hoja. En el celular, usa *Añadir a pantalla de inicio* para tenerla como app.

La sesión de Google dura 1 hora; después la app te pide volver a tocar "Entrar con Google" (no vuelve a pedir permisos).

## Archivos

```
index.html            Estructura de la página
app.js                Interfaz y cálculos
store.js              Lectura/escritura en Google Sheets y subida de recibos a Drive
parser.js             Interpreta "almuerzo 3.50 pichincha" (sin IA)
config.js             ID de cliente de Google, moneda y formato
styles.css            Estilos (modo claro y oscuro)
```
