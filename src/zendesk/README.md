# Servidor MCP para Zendesk

Un servidor Model Context Protocol (MCP) que se integra con la API de Zendesk, permitiendo la integración con Windsurf y otros clientes compatibles con MCP.

## Características

- **Búsqueda de Artículos**: Busca artículos en tu Centro de Ayuda de Zendesk
- **Detalles de Artículos**: Obtiene información detallada de artículos específicos por ID
- **Consulta de Tickets**: Obtiene detalles de tickets específicos de Zendesk por ID
- **Comentarios de Tickets**: Recupera todos los comentarios para un ticket específico de Zendesk

## Arquitectura del Proyecto

El proyecto sigue una arquitectura modular y escalable:

```plaintext
src/
  ├── types/               # Definiciones de tipos
  ├── services/            # Servicios de API
  ├── utils/               # Utilidades
  ├── tools/               # Herramientas MCP
  ├── client.ts            # Cliente principal
  ├── index.ts             # Punto de entrada para servidor MCP
  └── debug-cli.ts         # CLI para pruebas
```

## Requisitos Previos

- Node.js (v18 o superior)
- Cuenta de Zendesk con acceso a API
- Token de API de Zendesk

## Instalación

1. Clona este repositorio:

   ```bash
   git clone https://github.com/bukhr/MCPservers.git
   cd MCPservers/src/zendesk
   ```

2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Crea un archivo `.env` en el directorio raíz con tus credenciales de Zendesk:

   ```bash
   ZENDESK_SUBDOMAIN=tu-subdominio
   ZENDESK_EMAIL=tu-email@ejemplo.com
   ZENDESK_API_TOKEN=tu-token-api
   DEFAULT_LOCALE=es
   ```

   Puedes copiar el archivo `.env.example` y completar con tus datos:

   ```bash
   cp .env.example .env
   ```

## Compilación y Ejecución

1. Compila el proyecto:

   ```bash
   npm run build
   ```

2. Inicia el servidor:

   ```bash
   npm start
   ```

El servidor se ejecutará en la entrada/salida estándar, haciéndolo compatible con Windsurf y otros clientes MCP.

## Herramientas Disponibles

El servidor proporciona las siguientes herramientas:

### 1. searchArticles

Busca artículos en tu Centro de Ayuda de Zendesk.

**Parámetros:**

- `query` (string, requerido): Palabra clave para búsqueda
- `locale` (string, opcional): Código de idioma (ej., 'es', 'en', 'ja')
- `page` (número, opcional): Número de página
- `per_page` (número, opcional): Número de resultados por página (máx. 100)

### 2. getArticle

Obtiene detalles de un artículo específico del Centro de Ayuda de Zendesk por ID.

**Parámetros:**

- `id` (número, requerido): ID del artículo
- `locale` (string, opcional): Código de idioma (ej., 'es', 'en', 'ja')

### 3. getTicket

Consulta un ticket de Zendesk por su ID.

**Parámetros:**

- `ticket_id` (número, requerido): ID del ticket a consultar

### 4. getTicketComments

Recupera todos los comentarios de un ticket de Zendesk por su ID.

**Parámetros:**

- `ticket_id` (número, requerido): ID del ticket para obtener comentarios

## Uso con Windsurf

### Añadir a la Configuración `mcpServers` de Windsurf

Añade la siguiente configuración a la sección `mcpServers` en el archivo de configuración de Windsurf:

```json
{
  "mcpServers": {
    "zendesk": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/home/<nombre_usuario>/MCPservers/src/zendesk/src/index.ts"
      ],
      "env": {
        "ZENDESK_SUBDOMAIN": "buk",
        "ZENDESK_EMAIL": "email@buk.cl",
        "ZENDESK_API_TOKEN": "token",
        "DEFAULT_LOCALE": "es"
      }
    }
  }
}
```

Para obtener un API token de Zendesk, sigue los siguientes pasos:

> Nota:
Para generar un token de API, debe ser un administrador y el acceso con token de API tiene que estar activado en su cuenta.

### Generar un token de API

En el Centro de administración, haga clic en  Aplicaciones e integraciones en la barra lateral y luego seleccione API > API de Zendesk.
Haga clic en el botón Agregar token de API a la derecha de Tokens de API activos. [Para más información puedes consultar la guia de zendesk](https://support.zendesk.com/hc/es/articles/4408889192858-Administración-del-acceso-a-la-API-de-Zendesk#topic_mmh_gm1_2yb)

Después de añadir esta configuración, podrás usar las herramientas de Zendesk dentro de Windsurf.

## Ejemplo de uso y caso de éxito

El prompt: me llego este ticket 190594 y necesito que lo analices y me indiques si tiene alguna propuesta de solución

La respuesta:

Análisis del problema
El cliente reporta que en el libro de remuneraciones del mes de abril, los nombres de las empresas en las pestañas del Excel aparecen abreviados (con puntos suspensivos "..."), mientras que en meses anteriores se mostraban completos. El nombre de la empresa no ha cambiado entre meses, pero ahora se muestra truncado.

Causa probable
Tras revisar el código, identifico que esto probablemente está relacionado con la forma en que se crean las pestañas en los archivos Excel. Excel tiene una limitación en la longitud de los nombres de pestañas (el límite es de 31 caracteres).

En la clase Exportador::BaseXlsx encontré este código relevante:

```ruby
book.add_worksheet(sanitizar_nombre(name))
```

Y en Exportador::BaseWriteXlsx hay una implementación que trunca explícitamente el nombre:

```ruby
book.add_worksheet(sanitizar_nombre(name.truncate(30, separator: ' ')))
```

Propuesta de solución
El problema parece ser que previamente los nombres de empresa más largos se mostraban completos (posiblemente ignorando el límite de Excel), pero ahora el sistema está aplicando correctamente el truncamiento. Dos posibles soluciones:

Solución inmediata: Modificar la función sanitizar_nombre para que no trunque los nombres de las empresas en este reporte específico, permitiendo que Excel los muestre como antes (aunque esto podría causar problemas de compatibilidad con Excel).

Solución recomendada: Mantener el truncamiento pero mejorar la forma en que se muestran los nombres. En lugar de permitir que Excel abrevie con "...", podemos truncar de manera más inteligente, por ejemplo:

- Mostrar la primera parte del nombre
- Añadir un sufijo más informativo como " (Abril)"
- Utilizar acrónimos o abreviaturas consistentes para empresas con nombres largos
Esta segunda opción sería compatible con Excel y proporcionaría una experiencia más profesional para el cliente.

[https://windsurf.com/conversation-share/d46994a9-d0d6-45f2-9702-4c78d4d1f705](https://windsurf.com/conversation-share/d46994a9-d0d6-45f2-9702-4c78d4d1f705)

### Nota: Gracias a este análisis identificamos el PR que habia cambiado el comportamiento por el cual se levanto el ticket

## Desarrollo

Este proyecto utiliza TypeScript y sigue la especificación del Model Context Protocol.

Para ejecutar en modo desarrollo con recarga automática:

```bash
npm run dev
```

## Estructura del Código

El proyecto ha sido refactorizado siguiendo principios SOLID para mejorar la mantenibilidad y escalabilidad:

- **Separación de tipos**: Las interfaces están separadas en archivos específicos
- **Servicios modulares**: Cada servicio tiene una responsabilidad única
- **Utilidades reutilizables**: Funciones auxiliares extraídas a módulos independientes
- **Patrón Facade**: El cliente principal sirve como punto de acceso unificado

## Licencia

ISC

## Referencias

Este proyecto se baso en los siguientes repositorios:

- [zendesk-mcp-server](https://github.com/reminia/zendesk-mcp-server)
- [zendesk-help-center-mcp-server](https://github.com/hidechae/zendesk-help-center-mcp-server)