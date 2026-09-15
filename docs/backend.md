# El backend opcional

> **Lee esto antes que nada: es muy probable que no necesites este documento.**
>
> Dictar **ya no pasa por aquí**. Lo hace el propio teléfono: el reconocimiento
> de voz de Android viaja dentro del APK y corre en el aparato, sin servidor,
> sin clave, sin conexión y sin coste. Ver `src/device.js`.
>
> Este documento sirve **para una sola cosa**: entender frases totalmente libres
> («mañana pon arroz con pollo y dile a Sofía que no cena»). Todo lo demás de la
> aplicación funciona sin desplegar nada.

La primera versión mandaba todo esto a un servidor que el usuario tenía que
montar. Era un error de diseño: esta app es para una casa corriente, y una casa
corriente no despliega un Cloudflare Worker. Lo que quedó aquí es el resto.

## Qué queda aquí, y para quién

| Ruta | ¿Hace falta? | Por qué |
|---|---|---|
| `/chat` | Solo para lenguaje libre | La app reconoce sin conexión un buen puñado de frases por su forma. Un modelo grande amplía eso, pero no cabe en el APK. |
| `/transcribe` | Casi nunca | El teléfono transcribe solo. Esta ruta es el respaldo para aparatos sin reconocimiento de voz. |

**Y si lo despliegas, despliega uno solo para todos tus usuarios.** Pedirle a
cada familia que monte el suyo es volver al error de partida. La app guarda la
dirección por dispositivo porque así se puede probar, no porque sea el plan.

Una clave no puede vivir en la app: no hay forma de esconderla dentro de un
JavaScript que se descarga ni dentro de un APK que cualquiera puede abrir. Quien
la saque la gasta a tu nombre hasta que la canceles.

- El puente con lo que el teléfono hace solo: `src/device.js`
- El transporte hacia este backend: `src/providers.js`
- Un backend de verdad, listo para desplegar: `backend/ejemplo-worker.js`
- Las variables que hay que configurar: `.env.example`

---

## El contrato

Dos rutas. Las dos son `POST`, las dos reciben y devuelven `application/json`, y
las dos van con la cabecera `Authorization: Bearer <token>` si configuraste un
token compartido.

```
POST  {baseUrl}/transcribe
POST  {baseUrl}/chat
```

Si tu backend devuelve exactamente estas formas, la app funciona. Da igual con
qué proveedor de modelo hables por dentro, o si lo escribes en otro lenguaje.

### `transcribe` — audio a texto

La app envía:

```json
{
  "audio": "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAH...",
  "mimeType": "audio/webm",
  "idioma": "es-DO"
}
```

| Campo | Qué es |
|---|---|
| `audio` | La grabación en base64, sin el prefijo `data:`. El backend debe aceptarlo igual si viene con prefijo. |
| `mimeType` | Lo que grabó el navegador: `audio/webm`, `audio/mp4`, `audio/ogg`… |
| `idioma` | Siempre `es-DO`. Muchos servicios solo quieren las dos primeras letras: eso lo recorta el backend, no la app. |

El backend responde:

```json
{
  "texto": "dos libras de arroz y una docena de huevos",
  "confianza": 0.93
}
```

| Campo | Qué es |
|---|---|
| `texto` | Lo transcrito, en español, sin comillas ni adornos. Cadena vacía si no se entendió nada. |
| `confianza` | Número de 0 a 1, o `null` si el proveedor no informa ninguna. **No te inventes un 1.0**: la app usa esto para decidir si le pide al usuario que revise. |

### `chat` — entender una petición y devolver acciones

La app envía:

```json
{
  "mensajes": [
    { "rol": "persona", "contenido": "anota que compré dos libras de arroz y seis plátanos" }
  ],
  "herramientas": [
    {
      "nombre": "agregar_compra",
      "descripcion": "Registra un producto que ya se compró, con su cantidad y su unidad.",
      "parametros": {
        "properties": {
          "nombre": { "type": "string", "description": "Nombre del alimento" },
          "cantidad": { "type": "number" },
          "unidad": { "type": "string", "enum": ["unidad", "lb", "taza", "lata", "paquete", "rueda", "rebanada"] }
        },
        "required": ["nombre", "cantidad", "unidad"]
      }
    }
  ],
  "contexto": {
    "fecha": "2026-09-15",
    "productos": ["Arroz", "Habichuela", "Plátano"],
    "unidades": ["unidad", "lb", "taza", "lata", "paquete", "rueda", "rebanada"]
  }
}
```

| Campo | Qué es |
|---|---|
| `mensajes` | La conversación. `rol` es `"persona"` o `"asistente"`. El primero tiene que ser de la persona. |
| `herramientas` | Lo que la app sabe hacer. `parametros` es un JSON Schema de las propiedades; el backend lo envuelve en lo que pida su proveedor. Puede venir vacío: entonces es solo una respuesta en texto. |
| `contexto` | Lo mínimo para entender la frase: los nombres de los productos que ya existen, las unidades válidas y la fecha de hoy. **No mandes aquí las compras, ni el inventario, ni el historial.** |

El backend responde:

```json
{
  "respuesta": "Anoté dos libras de arroz y seis plátanos.",
  "acciones": [
    { "action": "agregar_compra", "arguments": { "nombre": "Arroz", "cantidad": 2, "unidad": "lb" } },
    { "action": "agregar_compra", "arguments": { "nombre": "Plátano", "cantidad": 6, "unidad": "unidad" } }
  ]
}
```

| Campo | Qué es |
|---|---|
| `respuesta` | Texto en español para enseñarle a la persona. Puede ser cadena vacía si todo fue acción. |
| `acciones` | Lista, posiblemente vacía. `action` es el `nombre` de una de las herramientas que se enviaron; `arguments` son sus parámetros. |

Una acción es una **propuesta**, no un hecho consumado: la app tiene que
enseñarla y esperar que la persona la confirme antes de tocar sus datos.

### Errores

Cualquier fallo se responde con el código HTTP que corresponda y este cuerpo:

```json
{ "error": "El audio tiene que venir en base64." }
```

La app **no le enseña ese texto a la persona** —viene de un servidor y podría
traer cualquier cosa—: usa el código HTTP y escribe su propio mensaje en
español. Esto es lo que hace con cada código:

| Código | Qué hace la app |
|---|---|
| `400`, `404`, `405`, `422` | «El servicio no entendió la petición.» No reintenta. |
| `401`, `403` | «El servicio rechazó la petición (clave no válida).» No reintenta. |
| `413` | «El envío es demasiado grande. Prueba con una grabación más corta.» No reintenta. |
| `429` | «El servicio está ocupado.» **Reintenta** a los 0,5 s y luego a los 1,5 s. |
| `500`, `501` | «El servicio falló al procesar la petición.» No reintenta. |
| `502`, `503`, `504` | «El servicio no está disponible.» **Reintenta.** |
| Sin respuesta | «No hay conexión con el servicio. La app sigue funcionando sin él.» **Reintenta.** |
| Más de 30 s | «El servicio tardó demasiado.» No reintenta: repetir algo que ya tardó medio minuto solo duplica la espera. |

Por eso importa devolver el código correcto: un `503` cuando tu servicio se está
reiniciando hace que la app lo vuelva a intentar sola; un `500` no.

---

## Qué NO debe hacer el backend

Esto no son recomendaciones. Un backend que haga cualquiera de estas cosas
convierte una app que guarda todo en el teléfono en una que no.

- **No guardar las grabaciones.** Ni en disco, ni en un bucket, ni
  «temporalmente para depurar». Un audio entra, se convierte en texto, se
  olvida.
- **No registrar el contenido.** Ni el mensaje de la persona, ni la
  transcripción, ni el `Authorization`. En el registro solo va qué ruta se
  llamó, con qué código terminó y cuánto tardó. En Cloudflare los registros se
  guardan donde el usuario no los ve y no los puede borrar.
- **No devolver JavaScript, ni HTML, ni nada que no sea JSON.** Lo que devuelva
  este servicio se procesa dentro de la app de alguien.
- **No reenviar el cuerpo del error del proveedor.** Muchos devuelven de vuelta
  parte de lo que se les mandó —la grabación incluida—. Se mira el código y se
  tira el resto.
- **No aceptar cualquier origen.** Sin `ORIGEN_PERMITIDO`, cualquier página web
  abierta en el navegador del usuario puede llamar a tu servicio y gastar tu
  clave.
- **No devolver una respuesta inventada cuando el modelo falla.** Mejor un error
  y que la persona lo escriba a mano que un dato falso metido en su inventario.

---

## Cómo desplegarlo

### Cloudflare Workers (lo recomendado)

Es lo más barato que hay para esto: el plan gratuito da 100.000 peticiones al
día y no hay servidor que mantener. `backend/ejemplo-worker.js` es un worker
completo, no un ejemplo de mentira. Las instrucciones paso a paso, con `wrangler`
y con `curl`, están en [`backend/README.md`](../backend/README.md).

Resumido:

```bash
npm install -g wrangler
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TOKEN_APP
wrangler deploy
```

### Node con Express

El worker es una función `fetch(Request, env)`, que es exactamente lo que
`Request` y `Response` de Node ya saben hacer desde la versión 18. Así que no
hace falta reescribirlo: se envuelve.

```js
// servidor.js — el mismo worker, servido por Express.
import express from 'express';
import worker from './ejemplo-worker.js';

const app = express();
// El cuerpo se pasa en crudo: el worker hace su propio JSON.parse y su propia
// validación, y así no hay dos sitios donde se decida qué es un cuerpo válido.
app.use(express.text({ type: '*/*', limit: '25mb' }));

app.all('*', async (peticion, respuesta) => {
  const url = `http://${peticion.headers.host}${peticion.originalUrl}`;
  const entrada = new Request(url, {
    method: peticion.method,
    headers: peticion.headers,
    body: ['GET', 'HEAD'].includes(peticion.method) ? undefined : peticion.body
  });
  const salida = await worker.fetch(entrada, process.env);
  respuesta.status(salida.status);
  salida.headers.forEach((valor, nombre) => respuesta.set(nombre, valor));
  respuesta.send(await salida.text());
});

app.listen(process.env.PUERTO || 8787);
```

```bash
npm install express
node --env-file=.env servidor.js
```

`--env-file` es de Node 20 en adelante y lee el `.env` que copiaste de
`.env.example`. Sin Express es igual de corto con `node:http`, si prefieres no
añadir dependencias.

Detrás hace falta HTTPS —un proxy con certificado, o un túnel—: sobre `http`
la grabación viaja en claro por la red.

---

## Cómo configurarlo en la app

En **Ajustes**, la app pide tres cosas y guarda **solo** estas tres en el
dispositivo:

1. **La dirección del servicio.** Sin barra al final: `https://que-comemos.tuusuario.workers.dev`.
2. **El token de sesión**, si configuraste `TOKEN_APP`. Es el mismo texto.
3. **Qué capacidades activar**, una por una. Activar `transcribe` y dejar `chat`
   apagado es perfectamente válido.

Aquí nunca se escribe la clave del proveedor de modelo. Si una pantalla te la
pide, algo está mal.

Guardado queda así, bajo la clave `que-comemos-proveedores-v1`:

```json
{
  "baseUrl": "https://que-comemos.tuusuario.workers.dev",
  "token": "el-token-compartido",
  "enabled": { "transcribe": true, "chat": false },
  "provider": "backend"
}
```

Vive aparte de los datos de la casa a propósito: un respaldo exportado e
importado en otro teléfono no arrastra la dirección ni el token del primero.

### Probar la interfaz sin gastar servicio

Con `provider: "mock"` la app no toca la red y devuelve respuestas inventadas,
marcadas dos veces: `data.simulated === true` y un `[simulado]` dentro de cada
texto. Sirve para ver cómo queda una pantalla sin pagar por ello. Quien consuma
`callProvider` tiene que mirar `data.simulated` y avisar: una respuesta
inventada que pase por buena es peor que no tener la función.

---

## Qué pasa si no lo despliegas

Nada deja de funcionar. La app fue escrita para trabajar sin conexión y sin
servicios, y eso no cambia.

**Sigue funcionando, completo y sin conexión:**

- Registrar productos, con su unidad de control, su unidad de compra, sus
  equivalencias y su grosor de rueda.
- El catálogo con los alimentos que ya vienen cargados.
- La canasta del mes: escribirla de corrido por nombre, línea por línea desde la
  ficha del producto, y comprar por canasta sin planificar el menú.
- Las personas de la casa, sus restricciones y sus cantidades habituales.
- Las preparaciones y el menú: calendario, comidas vinculadas, repetir semana,
  generar el mes.
- La lista de compras, por menú o por canasta, con lo que ya hay descontado.
- Las compras, las revisiones de consumo y las correcciones de existencias.
- El inventario y su historial.
- Escribir una compra o una canasta **de corrido en texto** y que la app la
  entienda: ese analizador corre en el teléfono, no necesita servicio.
- Exportar e importar el respaldo completo.
- Instalarla en el teléfono y abrirla sin datos.

**Queda fuera, y solo esto:**

- Dictar en vez de escribir (`transcribe`).
- Pedirle algo en lenguaje libre al asistente (`chat`).

Es decir: lo que se pierde es **rapidez al escribir**, no capacidad. Todo lo que
esas dos funciones hacen se puede hacer a mano, y de hecho el camino a mano es
el que manda: las dos proponen, y la persona confirma.

---

## Privacidad

### Qué sale del dispositivo, exactamente

| Capacidad | Qué sale | Qué NO sale |
|---|---|---|
| `transcribe` | La grabación de audio completa. | Nada más: ni productos, ni inventario, ni quién vive en la casa. |
| `chat` | El mensaje escrito, los nombres de las herramientas y el `contexto` que se arme: nombres de productos, unidades y la fecha. | Compras, precios, revisiones, personas, restricciones, historial. |

Una grabación hecha en la cocina puede llevar de fondo a cualquiera que estuviera
allí. Por eso no sale nunca sola.

### Nada sale sin confirmar

`src/providers.js` exporta `AVISO_ENVIO`, con el aviso de cada capacidad:
título, explicación de qué sale y hacia dónde, y los dos botones. Quien llame a
`callProvider` **tiene que enseñar ese aviso y esperar la confirmación**. No es
una sugerencia de diseño: el resto de la app no sale del dispositivo nunca, así
que la primera vez que algo sale hay que decirlo con todas las letras.

El botón de cancelar de `transcribe` no dice «Cancelar» a secas: dice
«Escribirlo a mano», porque ese camino existe siempre y está a un toque.

### El recorrido completo del dato

```
teléfono ──HTTPS──> tu backend ──HTTPS──> proveedor de modelo
                         │
                    tu clave vive aquí, y solo aquí
```

Tres partes ven el dato: el dispositivo, tu backend y el proveedor que elegiste.
Lo que ese proveedor hace con lo que recibe es cosa suya y de sus condiciones:
antes de mandarle nada de tu casa, léelas.

### Lo demás

- **Ninguna clave en la app.** Ni en el JavaScript, ni en el APK, ni en el
  respaldo exportado. Solo la dirección de tu backend y un token que tú puedes
  cambiar cuando quieras.
- **Los mensajes de error no llevan datos.** `src/providers.js` no copia nunca
  dentro de un error el cuerpo de la respuesta ni el mensaje de la excepción,
  porque ahí es justo donde se cuelan el token o el principio de la grabación.
  Hay una prueba que lo comprueba (`tests/providers.test.js`).
- **Todo se puede apagar.** Cada capacidad tiene su interruptor, y apagarlas
  todas deja la app exactamente como estaba antes de que existiera esto.
