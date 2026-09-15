# Backend de ejemplo

`ejemplo-worker.js` es un Cloudflare Worker completo que implementa las tres
rutas del contrato de [`../docs/backend.md`](../docs/backend.md): `transcribe`,
`chat` y `vision`. No es pseudocódigo: se despliega y funciona.

Existe por una sola razón: **que la clave del proveedor de modelo no viva dentro
de la app.** Aquí vive la clave; la app solo conoce la dirección de este
servicio.

La app funciona entera sin desplegar esto. Lo único que queda fuera es dictar,
fotografiar facturas y pedirle cosas al asistente.

---

## Lo que necesitas

- Una cuenta de Cloudflare (el plan gratuito sobra: 100.000 peticiones al día).
- `wrangler`, la herramienta de Cloudflare: `npm install -g wrangler`.
- Una clave de Anthropic, de `console.anthropic.com` → Settings → API keys.
- **Solo si quieres dictar:** una cuenta en un servicio de voz a texto. La API
  de Anthropic recibe texto, imágenes y PDF, pero **no audio**, así que
  `/transcribe` habla con un servicio aparte con la forma de OpenAI (OpenAI,
  Groq o un whisper.cpp tuyo). Sin configurarlo, esa ruta responde `501` y las
  otras dos siguen funcionando igual.

---

## Desplegarlo

### 1. Una carpeta para el backend

Este servicio no es parte de la app: se despliega aparte y tiene su propia vida.
Copia `ejemplo-worker.js` a una carpeta nueva, fuera de este repositorio.

```bash
mkdir que-comemos-backend
cd que-comemos-backend
cp .../backend/ejemplo-worker.js .
```

### 2. `wrangler.toml`

Créalo al lado, con esto dentro:

```toml
name = "que-comemos-backend"
main = "ejemplo-worker.js"
compatibility_date = "2026-09-15"

[vars]
# El origen exacto desde el que puede llamar tu app. Varios, separados por coma.
#   APK de Android (Capacitor):  https://localhost
#   Web en GitHub Pages:         https://tuusuario.github.io
#   Desarrollo (npm start):      http://localhost:4173
ORIGEN_PERMITIDO = "https://localhost,http://localhost:4173"

MODELO = "claude-opus-5"
MODELO_ECONOMICO = "claude-haiku-4-5-20251001"

MAX_IMAGEN_MB = 4
MAX_IMAGENES = 4
MAX_AUDIO_MB = 8

# Solo si vas a dictar. La clave va aparte, como secreto.
# TRANSCRIPCION_URL = "https://api.openai.com/v1/audio/transcriptions"
# TRANSCRIPCION_MODELO = "whisper-1"
```

Lo de `[vars]` es público: se ve en el panel de Cloudflare y en el repositorio.
Ahí no va ninguna clave.

### 3. Los secretos

Estos no van en ningún archivo. `wrangler` los pide por teclado y los guarda
cifrados en Cloudflare:

```bash
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TOKEN_APP           # opcional, pero hazlo
wrangler secret put TRANSCRIPCION_CLAVE # solo si vas a dictar
```

`TOKEN_APP` es una cadena larga que te inventas tú y que escribes también en
Ajustes dentro de la app. Sin ella, cualquiera que descubra la dirección de tu
worker puede gastar tu clave. Para generarla:

```bash
openssl rand -hex 32
```

En PowerShell, si no tienes `openssl`:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

### 4. Desplegar

```bash
wrangler deploy
```

Al terminar imprime la dirección, algo como
`https://que-comemos-backend.tuusuario.workers.dev`. Esa es la que va en
Ajustes, **sin barra al final**.

---

## Probarlo con curl

Guarda los datos en variables para no repetirlos:

```bash
BASE=https://que-comemos-backend.tuusuario.workers.dev
TOKEN=el-token-que-pusiste-en-TOKEN_APP
ORIGEN=https://localhost
```

`Origin` no es opcional: el worker rechaza con `403` lo que no venga de un
origen de la lista, y `curl` no lo manda solo.

### ¿Está vivo y qué tiene configurado?

```bash
curl -s "$BASE/salud" \
  -H "Origin: $ORIGEN" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"ok":true,"capacidades":{"transcribe":false,"chat":true,"vision":true},"modelo":"claude-opus-5"}
```

Dice **qué** está configurado, nunca **con qué**: aquí no sale ninguna clave.
Si `chat` sale en `false`, te falta el `ANTHROPIC_API_KEY`.

### Conversar

```bash
curl -s "$BASE/chat" \
  -H "Origin: $ORIGEN" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mensajes": [{ "rol": "persona", "contenido": "anota que compré dos libras de arroz" }],
    "herramientas": [{
      "nombre": "agregar_compra",
      "descripcion": "Registra un producto que ya se compró.",
      "parametros": {
        "properties": {
          "nombre": { "type": "string" },
          "cantidad": { "type": "number" },
          "unidad": { "type": "string", "enum": ["unidad","lb","taza","lata","paquete","rueda","rebanada"] }
        },
        "required": ["nombre","cantidad","unidad"]
      }
    }],
    "contexto": { "fecha": "2026-09-15", "productos": ["Arroz","Plátano"] }
  }'
```

```json
{"respuesta":"Anoté dos libras de arroz.","acciones":[{"action":"agregar_compra","arguments":{"nombre":"Arroz","cantidad":2,"unidad":"lb"}}]}
```

### Leer una factura

Hay que mandar la foto en base64 y sin saltos de línea:

```bash
IMAGEN=$(base64 -w0 factura.jpg)
curl -s "$BASE/vision" \
  -H "Origin: $ORIGEN" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"imagenes\":[\"$IMAGEN\"],\"pista\":\"factura\"}"
```

En PowerShell, que no tiene `base64`:

```powershell
$imagen = [Convert]::ToBase64String([IO.File]::ReadAllBytes('factura.jpg'))
$cuerpo = @{ imagenes = @($imagen); pista = 'factura' } | ConvertTo-Json
Invoke-RestMethod "$BASE/vision" -Method Post -Body $cuerpo -ContentType 'application/json' `
  -Headers @{ Origin = $ORIGEN; Authorization = "Bearer $TOKEN" }
```

```json
{"fecha":"2026-09-14","establecimiento":"Colmado La Esquina","lineas":[{"textoOriginal":"ARROZ SELECTO 2LB","nombreSugerido":"Arroz","cantidad":2,"unidad":"lb","confianza":0.92}]}
```

### Transcribir

```bash
AUDIO=$(base64 -w0 nota.webm)
curl -s "$BASE/transcribe" \
  -H "Origin: $ORIGEN" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"audio\":\"$AUDIO\",\"mimeType\":\"audio/webm\",\"idioma\":\"es-DO\"}"
```

### Comprobar que está cerrado

Las tres tienen que fallar:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/salud" -H "Origin: https://sitio-cualquiera.com" -H "Authorization: Bearer $TOKEN"
# 403 — origen que no está en la lista

curl -s -o /dev/null -w "%{http_code}\n" "$BASE/salud" -H "Origin: $ORIGEN" -H "Authorization: Bearer equivocado"
# 401 — token que no es

curl -s -o /dev/null -w "%{http_code}\n" "$BASE/chat" -H "Origin: $ORIGEN" -H "Authorization: Bearer $TOKEN"
# 405 — GET donde solo se acepta POST
```

---

## Ver los registros

```bash
wrangler tail
```

Solo verás líneas como `{"ruta":"vision","estado":200,"ms":4210}`. Es a
propósito: ni el texto, ni la imagen, ni el token tocan los registros de
Cloudflare, que se guardan donde el usuario no los ve y no los puede borrar. Si
alguna vez añades un `console.log` para depurar, bórralo antes de desplegar.

---

## Lo que cuesta

Cloudflare no cobra nada en el plan gratuito para este uso. Lo que se paga es el
modelo, y se paga por llamada:

- Leer una factura es lo caro: la imagen entera entra como entrada.
- Conversar es barato: son unas cuantas frases.
- Transcribir se paga por minuto de audio en el servicio que elijas.

Dos frenos, los dos ya puestos:

- `MAX_IMAGEN_MB` y `MAX_IMAGENES` rechazan de entrada lo que sea absurdo.
- `MODELO_ECONOMICO` responde a las peticiones que traigan `"economico": true`.
  Sirve para facturas nítidas y de pocas líneas; para una arrugada del colmado,
  el modelo grande lee mucho mejor.

`claude-opus-5` es el modelo por defecto. Con él la respuesta de `/vision` puede
pasar de 30 segundos, que es lo que la app espera por defecto: quien lo llame
debe subir su tiempo de espera a 60 segundos.

---

## Cambiar de proveedor de modelo

El contrato con la app no cambia. Lo que se toca es `llamarAnthropic` y el
armado del cuerpo en `conversar` y `leerFactura`. Lo que tiene que seguir igual:

- Las rutas, y el JSON exacto que entra y sale.
- Los códigos de error: `429` y `502/503/504` hacen que la app reintente sola;
  `400` y `401` no. Devolver el código correcto es la mitad del trabajo.
- No registrar contenido, no guardar imágenes, no reenviar el cuerpo del error
  del proveedor —que a menudo trae de vuelta parte de lo que se le mandó—.

---

## Apagarlo

```bash
wrangler delete
```

Y en la app, borrar la dirección en Ajustes. Todo lo demás sigue funcionando
igual que antes: los productos, la canasta, el menú, las compras, el inventario
y el respaldo nunca dependieron de esto.
