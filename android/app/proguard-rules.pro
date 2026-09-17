# Reglas para la versión de publicación.
#
# Minificar renombra y borra lo que parece no usarse. El problema es que
# «parece» se calcula mirando quién llama a quién, y aquí hay dos cosas que no
# se llaman por su nombre en ningún sitio:
#
#   · Los complementos de Capacitor, que se buscan por su anotación.
#   · Todo lo que el JavaScript de la app invoca a través del puente.
#
# Si el minificador los borra o los renombra, el fallo no aparece al compilar:
# aparece al abrir la app ya publicada, que es el peor sitio posible. De ahí que
# estas reglas sean generosas: cuestan unos kilobytes y evitan eso.
#
# Capacitor ya trae sus propias reglas y las aplica solo (`consumerProguardFiles`
# en su build.gradle), así que aquí no se repiten: cubren cualquier clase que
# extienda `com.getcapacitor.Plugin`, que hoy es el único complemento nativo que
# queda, el del reconocimiento de voz.

# La actividad principal la nombra el manifiesto, no el código.
-keep class com.nexocore.quecomemos.** { *; }

# Las clases con anotaciones se registran solas al arrancar; sin el atributo las
# anotaciones desaparecen y Capacitor no encuentra sus complementos.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# El puente entre el WebView y el código nativo: los métodos marcados así los
# llama el JavaScript por su nombre, y renombrarlos los deja inalcanzables.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Las respuestas de los complementos viajan como objetos que Capacitor convierte
# a JSON leyendo sus campos.
-keepclassmembers class com.capacitorjs.plugins.** { *; }

# Deja los números de línea en los informes de fallo. Sin esto, un error de
# Play Console llega como una pila de nombres de una letra y no dice nada.
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile
