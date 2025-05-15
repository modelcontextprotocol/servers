# Servidor MCP de Jira

Este es un servidor de Protocolo de Control de Máquina (MCP) para interactuar con la API de Jira.

## Requisitos previos

- Node.js (v16 o superior)
- npm o yarn
- Una cuenta de Jira con acceso a la API

## Configuración

1. Instalar dependencias dentro de esta carpeta:

   ```bash
   npm install
   ```

2. Configurar Codeium MCP:
   - Añade la siguiente configuración a tu archivo de configuración de Codeium MCP (`~/.codeium/windsurf/mcp_config.json`):

   ```json
   {
     "mcpServers": {
       "jira": {
         "command": "npx",
         "args": [
           "-y",
           "tsx",
           "/path/to/jira_mcp/main.ts"
         ],
         "env": {
           "JIRA_USERNAME": "tu_nombre_de_usuario",
           "JIRA_API_KEY": "tu_token_de_api",
           "JIRA_BASE_URL": "https://buk.atlassian.net"
         }
       }
     }
   }
   ```

Para el nombre de usuario, normalmente es tu correo corporativo. Y el token de API se puede encontrar en la página de jira [aquí](<https://id.atlassian.com/manage-profile/security/api-tokens>).

En `path/to/jira_mcp/main.ts` reemplaza `path/to` con la ruta absoluta en tu máquina.

## Uso

El servidor MCP será iniciado automáticamente por Codeium cuando sea necesario. Comandos disponibles:

- `get_issue`: Obtener información sobre un issue específico de Jira por su clave (ej. "RMPRE-123")

## Desarrollo

Para ejecutar el servidor localmente en modo desarrollo:

```bash
npm start
```

## Hacer pruebas

Recomendamos probar haciendole preguntas. Una tarjeta tipo para probar es la BIT-25, la primera tarjeta del BIT.

Algunos prompts de prueba:

- ¿Cuáles archivos debo modificar para poder desarrollar la tarjeta de Jira BIT-25?
- ¿Qué debo hacer a grandes rasgos en la tarjeta de Jira BIT-25?

## Ejemplos de Uso

### Inicio de una tarjeta

Un buen caso de uso es preguntarle inicialmente lo que se debe hacer en la tarjeta y por dónde partir

Por ejemplo: Tenemos una tarjeta para sacar unas Feature Flags del código después de una épica.

Prompt

``` md
Tengo la tarjeta de jira con código BENEFAD-93. ¿Me podrías decir lo que se debe hacer y qué archivos debo modificar
```

Respuesta

``` md
Tarea BENEFAD-93: Eliminar Feature Flag de banners cruzados
Contexto:
Existe un Feature Flag (FF) llamado banners_cruzados_beneficios que debe ser eliminado ahora que la épica relacionada ha sido completada.

Lo que se debe hacer:

Eliminar el Feature Flag banners_cruzados_beneficios de todo el código
Mantener otros FF relacionados con banners cruzados:

* banner_seguros_vencibles
* base_seguros_vencibles
* benef_desactivar_banners

Verificar que todos los tests sigan funcionando correctamente después de la eliminación

Archivos a modificar:
1. Eliminar la definición del Feature Flag:
buk-webapp/packs/benefit/core/config/feature_flags.yml. Eliminar la línea 10: banners_cruzados_beneficios
2. Modificar los servicios para quitar la condición del Feature Flag:
buk-webapp/packs/benefit/core/app/services/benefits_upselling/banner_adelantos.rb. Modificar línea 13: Eliminar Buk::Feature.enabled?(:banners_cruzados_beneficios) && dejando solo !Buk::Feature.enabled?(:benef_desactivar_banners)
```

Tip: darle el mayor contexto posible. Por ejemplo, si tengo que trabajar en un pack específico mencionarlo.

### Comparar lo que tengo que hacer vs lo que ya se hizo

Cuando ya hemos desarrollado por un tiempo y no estamos seguros de qué nos falta, podemos consultarlo:

Por ejemplo: teníamos una tarjeta para crear un nuevo sub-pack dentro de beneficios.

Prompt

``` md
Tengo que desarrollar la tarjeta de jira BENEFAD-100, ¿podrías decirme qué cosas ya he completado versus las que me faltan?
```

Respuesta

``` md
Tarea BENEFAD-100: 
Basado en mi análisis de la tarjeta BEBEFAD-100 y tu progreso hasta ahora, aqui un resumen de lo que has hecho y lo que falta:

Lo que has hecho:

✅ Crear un nuevo directorio con la estructura de subpack:

Se creó buk-webapp/packs/benefit/aditional_benefits/service_cards/
✅ Agregar archivos de configuración básica:

Se creó README.md con la descripción de la funcionalidad de las tarjetas de servicio
Se creó package.yml con la configuración básica
✅ Actualizar CODEOWNERS:

Se agregó packs/benefit/aditional_benefits @bukhr/beneficios-adicionales al archivo CODEOWNERS

Lo que falta:
❌ Mover los archivos relevantes al nuevo subpack:

Archivos relacionados con Pluxee CL y Minu MX que deben ser movidos de sus ubicaciones actuales al nuevo subpack service_cards
Basado en mi búsqueda, hay varios archivos en packs/benefit/core/ que deben ser movidos, incluyendo:
app/services/nomina/output/structure/pluxee.rb
app/services/exportador/person_and_card_subscription.rb
app/services/exportador/benefit_asset_and_item_information.rb
Archivos de pruebas relacionados: test/services/nomina/output/structure/pluxee_test.rb
Archivos de documentación: docs/exportadores_pluxee.md
```
