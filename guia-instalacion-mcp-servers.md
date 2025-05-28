# Guía de configuración para los MCP de Jira y GitHub

## Preparación previa

1. **Descargar el repositorio**:

   ```bash
   # Clonar el repositorio de MCP servers de Buk
   git clone git@github.com:bukhr/MCPservers.git
   cd MCPservers
   
   # Instalar dependencias
   npm install
   ```

2. **Obtener credenciales necesarias**:

### Para GitHub:
   1. Ve a [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)
   2. Haz clic en "Generate new token" y selecciona "Generate new token (classic)"
   3. Asigna un nombre descriptivo al token (ej. "MCP Server")
   4. Selecciona los siguientes permisos:
      - `repo` (acceso completo a repositorios)
      - `read:org` (acceso de lectura a organizaciones)
      - `read:user` (acceso de lectura a datos de usuario)
      - `user:email` (acceso a direcciones de correo electrónico)
      - `user:follow` (acceso para seguir a otros usuarios)
   5. Haz clic en "Generate token"
   6. **IMPORTANTE**: Copia y guarda el token generado en un lugar seguro, ya que solo se muestra una vez

### Para Jira:
   1. Ve a [Atlassian ID > Security > API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   2. Haz clic en "Create API token"
   3. Asigna un nombre descriptivo al token (ej. "MCP Server")
   4. Haz clic en "Create"
   5. Copia y guarda el token generado en un lugar seguro
   6. Para el nombre de usuario, usa tu correo electrónico corporativo (ej. "ahuertas@buk.co")
   7. La URL base de Jira es "https://buk.atlassian.net"

## Configuración del MCP de GitHub

1. **Requisitos**:
   - Node.js instalado
   - Token de acceso personal de GitHub con permisos: repo, read:org, read:user, user:email, user:follow

2. **Nota importante**:
   El desarrollo de este servidor MCP ha sido trasladado al repositorio oficial de GitHub en [github/github-mcp-server](http://github.com/github/github-mcp-server). Sin embargo, la versión incluida en este repositorio sigue siendo funcional.

3. **Configuración en el archivo MCP**:

   ```json
   "github": {
     "command": "npx",
     "args": [
       "-y",
       "@modelcontextprotocol/server-github"
     ],
     "env": {
       "GITHUB_PERSONAL_ACCESS_TOKEN": "tu_token_personal"
     }
   }
   ```

4. **Funcionalidades disponibles**:
   - `create_or_update_file`: Crear o actualizar un archivo en un repositorio
   - `push_files`: Enviar múltiples archivos en un solo commit
   - `search_repositories`: Buscar repositorios en GitHub
   - `create_repository`: Crear un nuevo repositorio
   - Gestión de issues y pull requests
   - Acceso a información de usuarios y organizaciones

## Configuración del MCP de Jira

1. **Requisitos**:
   - Node.js (v16 o superior)
   - npm o yarn
   - Cuenta de Jira con acceso a la API
   - Token de API generado desde [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

2. **Instalación de dependencias**:

   ```bash
   cd /Users/andryut/Development/MCPservers/src/jira
   npm install
   ```

3. **Configuración en el archivo MCP**:

   ```json
   "jira": {
     "command": "npx",
     "args": [
       "-y",
       "tsx",
       "/ruta/a/MCPservers/src/jira/main.ts"
     ],
     "env": {
       "JIRA_USERNAME": "tu_correo@ejemplo.com",
       "JIRA_API_KEY": "tu_token_de_api",
       "JIRA_BASE_URL": "https://buk.atlassian.net"
     }
   }
   ```

4. **Funcionalidades disponibles**:
   - `get_issue`: Obtener información detallada de issues por su clave (ej. "RMPRE-123")
   - Consultar tareas asignadas
   - Ver metadatos de proyectos

## Implementación final

1. **Crear o actualizar el archivo de configuración**:

   ```bash
   mkdir -p ~/.codeium/windsurf/
   ```

   > **Importante**: Para el MCP de Jira, asegúrate de reemplazar `/ruta/a/MCPservers/src/jira/main.ts` con la ruta absoluta correcta en tu sistema.

2. **Guardar la configuración completa**:

   ```json
   {
     "mcpServers": {
       "github": {
         "command": "npx",
         "args": [
           "-y",
           "@modelcontextprotocol/server-github"
         ],
         "env": {
           "GITHUB_PERSONAL_ACCESS_TOKEN": "tu_token_personal"
         }
       },
       "jira": {
         "command": "npx",
         "args": [
           "-y",
           "tsx",
           "/ruta/a/MCPservers/src/jira/main.ts"
         ],
         "env": {
           "JIRA_USERNAME": "tu_correo@ejemplo.com",
           "JIRA_API_KEY": "tu_token_de_api",
           "JIRA_BASE_URL": "https://buk.atlassian.net"
         }
       }
     }
   }
   ```

3. **Reiniciar el cliente MCP** (Claude Desktop o Codeium) para que los cambios surtan efecto.

## Verificación

Para comprobar que la configuración funciona correctamente, puedes hacer preguntas como:
- "Muéstrame información sobre el issue PROYECTO-123 en Jira"
- "¿Cuáles son mis repositorios en GitHub?"

Los servidores MCP se iniciarán automáticamente cuando el cliente los necesite y se comunicarán a través de la entrada/salida estándar (stdio).

## Ejemplo completo: Implementación de una tarjeta con MCP

A continuación se presenta un ejemplo completo de cómo utilizar los MCP de Jira y GitHub para implementar una tarjeta, desde la consulta de información hasta la creación de un Pull Request.

### 1. Consultar información de la tarjeta en Jira

Primero, consultamos los detalles de la tarjeta en Jira para entender qué debemos implementar:

---

Usuario: Necesito obtener la información completa de la tarjeta CALC-483 de Jira para implementarla.

Asistente: Voy a consultar la información de esa tarjeta en Jira.
[El asistente usa el MCP de Jira para obtener los detalles]

```bash
Detalles de la tarjeta CALC-483:
Título: "Cambiar nombre de general Habilitar Descripción en Asignaciones"
Descripción: "Cambiar el nombre de la general _Habilitar Descripción en Asignaciones_ por _Habilitar Detalle en Asignaciones._
Al asignar ítems, de manera individual en el formulario y de manera masiva en el template, se refieren a detalle, el cambio es para que queden coherente el nombre en todas partes."
Estado: "Por hacer"
Reportado por: "Laura Hess"
Creado: "24 de abril de 2025"
```

---

### 2. Entender el estado actual y el cambio esperado

Antes de comenzar con la implementación, es importante entender el estado actual y el cambio esperado:

---

Usuario: Ahora necesito entender exactamente qué código debo modificar y cuál es el cambio esperado para esta tarjeta. ¿Puedes buscar en el repositorio dónde aparece el texto "Habilitar Descripción en Asignaciones"?

Asistente: Voy a ayudarte a entender el contexto completo. Primero, vamos a examinar dónde aparece actualmente el texto "Habilitar Descripción en Asignaciones" en la aplicación.
[El asistente usa el MCP de GitHub para buscar en el código]

He encontrado que el texto "Habilitar Descripción en Asignaciones" aparece en:

1. El modelo General (app/models/general.rb) como una constante:

   ```ruby
   GENERAL_HABILITAR_DESCRIPCION_EN_ASIGNACIONES = 'habilitar_descripcion_en_asignaciones'
   ```

2. En los archivos de traducciones (config/locales/es.yml):

   ```yaml
   es:
     generals:
       habilitar_descripcion_en_asignaciones: "Habilitar Descripción en Asignaciones"
   ```

3. En la migración que creó esta general:

   ```ruby
   # db/migrate/20240215123456_add_general_habilitar_descripcion_en_asignaciones.rb
   def up
     General.create!(
       nombre: 'habilitar_descripcion_en_asignaciones',
       valor: 'false',
       descripcion: 'Habilitar Descripción en Asignaciones'
     )
   end
   ```

Según la tarjeta CALC-483, el cambio esperado es:

1. Cambiar el nombre de la general de "Habilitar Descripción en Asignaciones" a "Habilitar Detalle en Asignaciones"
2. Este cambio debe aplicarse en todos los lugares donde aparece el texto
3. La razón del cambio es mantener coherencia, ya que en los formularios de asignación individual y en el template de asignación masiva se usa el término "detalle" en lugar de "descripción"

Este cambio afectará cómo se muestra esta opción en la interfaz de usuario, pero no cambiará su funcionalidad.

---

### 3. Proponer pruebas automatizadas

Antes de comenzar con la implementación, es importante definir cómo se probará el cambio:

---

Usuario: Antes de implementar el cambio, necesito proponer pruebas automatizadas para verificar que la implementación sea correcta. ¿Qué tipos de pruebas recomiendas para este tipo de cambio?

Asistente: Voy a proponer algunas pruebas automatizadas para verificar que el cambio se implemente correctamente.
[El asistente analiza el código y los requisitos]

Propongo las siguientes pruebas automatizadas:

1. Pruebas unitarias:
   - Verificar que la constante GENERAL_HABILITAR_DETALLE_EN_ASIGNACIONES esté definida en el modelo General
   - Verificar que la constante GENERAL_HABILITAR_DESCRIPCION_EN_ASIGNACIONES ya no exista
   - Comprobar que la general se cree correctamente con el nuevo nombre en la migración

2. Pruebas de integración:
   - Verificar que la opción aparezca correctamente en la interfaz de administración con el nuevo nombre
   - Comprobar que la funcionalidad siga funcionando igual después del cambio

3. Pruebas de regresión:
   - Asegurar que los formularios de asignación individual y masiva sigan funcionando correctamente

---

### 4. Actualizar la pestaña de calidad

Ahora que tenemos las pruebas propuestas, seleccionamos las más importantes y actualizamos la pestaña de calidad en Jira:

---

Usuario: De las pruebas propuestas, debemos centrarnos solo en las pruebas unitarias por ahora debido a restricciones de tiempo. ¿Puedes actualizar la pestaña de calidad de la tarjeta CALC-483 en Jira con esa selección y los criterios de aceptación correspondientes?

Asistente: Entendido, nos centraremos en las pruebas unitarias. Voy a actualizar la pestaña de calidad de la tarjeta CALC-483 en Jira con esta selección.
[El asistente usa el MCP de Jira para actualizar la tarjeta]

He actualizado la pestaña de calidad de la tarjeta CALC-483 con las pruebas unitarias seleccionadas y he añadido los siguientes criterios de aceptación:

- La general debe aparecer como "Habilitar Detalle en Asignaciones" en la interfaz de administración
- La funcionalidad debe seguir funcionando igual que antes
- Las pruebas unitarias deben pasar correctamente, verificando:
  - La constante GENERAL_HABILITAR_DETALLE_EN_ASIGNACIONES está definida
  - La constante GENERAL_HABILITAR_DESCRIPCION_EN_ASIGNACIONES ya no existe
  - La general se crea correctamente con el nuevo nombre

---

### 5. Crear una rama para la implementación

A continuación, creamos una rama a partir de master para nuestra implementación:

---

Usuario: Necesito crear una rama git para esta tarjeta a partir de master. Ya tengo el repositorio clonado localmente en /path/to/buk-webapp y estoy posicionado en la raíz del proyecto.

Asistente: Perfecto. Vamos a asegurarnos de tener la última versión de la rama principal y luego crear una nueva rama para esta tarjeta.

```bash
# Nos aseguramos de estar en la rama principal (master o main) y actualizarla
$ git checkout master
$ git pull origin master

# Creamos una nueva rama para la tarjeta
$ git checkout -b feature/CALC-483-cambiar-nombre-general-asignaciones
```

> **_NOTE:_** Es importante crear la rama a partir de la última versión de master para evitar problemas de integración posteriores.

---

### 6. Implementar la funcionalidad

Ahora implementamos la funcionalidad requerida:

---

Usuario: Ahora necesito implementar el cambio de nombre en todos los archivos identificados. ¿Puedes darme los comandos exactos o instrucciones paso a paso para modificar cada archivo correctamente?

Asistente: Basándome en la estructura del proyecto, necesitamos encontrar dónde está definida esta configuración general.
[El asistente analiza la estructura del código]

He encontrado que la configuración está definida en varios archivos. Primero, vamos a cambiar la definición de la general en el archivo app/models/general.rb:

> **_NOTE:_** Buscar la línea donde se define la general
```ruby
GENERAL_HABILITAR_DESCRIPCION_EN_ASIGNACIONES = 'habilitar_descripcion_en_asignaciones'
```

> **_NOTE:_** Cambiarla por
```ruby
GENERAL_HABILITAR_DETALLE_EN_ASIGNACIONES = 'habilitar_detalle_en_asignaciones'
```

> **_NOTE:_** También necesitamos actualizar las referencias en la migración que crea esta general en db/migrate/YYYYMMDDHHMMSS_add_general_habilitar_descripcion_en_asignaciones.rb

```ruby
def up
  General.create!(
    nombre: 'habilitar_detalle_en_asignaciones',
    valor: 'false',
    descripcion: 'Habilitar Detalle en Asignaciones'
  )
end
```

> **_NOTE:_** Y finalmente, actualizar las traducciones en config/locales/es.yml

```yaml
es:
  generals:
    habilitar_detalle_en_asignaciones: "Habilitar Detalle en Asignaciones"
```

---

### 7. Probar la implementación

Realizamos pruebas para verificar que la implementación funciona correctamente, enfocándonos en las pruebas unitarias seleccionadas en el paso 4:

---

Usuario: He implementado los cambios en todos los archivos. ¿Cómo puedo ejecutar las pruebas unitarias que definimos para verificar que todo funciona correctamente?

Asistente: Vamos a implementar las pruebas unitarias que seleccionamos anteriormente. Crearé un archivo de prueba para verificar los tres criterios que definimos:

```ruby
# En spec/models/general_spec.rb
require 'rails_helper'

RSpec.describe General, type: :model do
  describe 'generals' do
    # Prueba 1: Verificar que la constante esté definida correctamente
    it 'tiene la constante GENERAL_HABILITAR_DETALLE_EN_ASIGNACIONES definida' do
      expect(defined?(General::GENERAL_HABILITAR_DETALLE_EN_ASIGNACIONES)).to eq('constant')
      expect(General::GENERAL_HABILITAR_DETALLE_EN_ASIGNACIONES).to eq('habilitar_detalle_en_asignaciones')
    end
    
    # Prueba 2: Verificar que la constante antigua ya no exista
    it 'no tiene la constante GENERAL_HABILITAR_DESCRIPCION_EN_ASIGNACIONES' do
      expect(defined?(General::GENERAL_HABILITAR_DESCRIPCION_EN_ASIGNACIONES)).to be_nil
    end
    
    # Prueba 3: Comprobar que la general se cree correctamente con el nuevo nombre
    it 'tiene la general de habilitar detalle en asignaciones' do
      general = General.find_by(nombre: 'habilitar_detalle_en_asignaciones')
      expect(general).not_to be_nil
      expect(general.descripcion).to eq('Habilitar Detalle en Asignaciones')
    end
    
    it 'no tiene la general antigua de habilitar descripción en asignaciones' do
      general = General.find_by(nombre: 'habilitar_descripcion_en_asignaciones')
      expect(general).to be_nil
    end
  end
end
```

Para ejecutar estas pruebas unitarias, usamos:

```bash
$ bundle exec rspec spec/models/general_spec.rb
```

También podemos verificar manualmente que la migración se haya aplicado correctamente:

```bash
$ bundle exec rails db:migrate:status
```

Y finalmente, aunque no implementaremos pruebas de integración por ahora, podemos verificar visualmente que el cambio se refleje en la interfaz de usuario:

```bash
$ bundle exec rails s
```

Luego visitamos la página de administración de generales en el navegador y confirmamos que aparece "Habilitar Detalle en Asignaciones" en lugar de "Habilitar Descripción en Asignaciones".


---

### 8. Crear un Pull Request

Finalmente, creamos un Pull Request para que nuestra implementación sea revisada:

---

Usuario: Las pruebas han pasado correctamente. Ahora necesito crear un Pull Request en GitHub con estos cambios. ¿Cuál es el proceso completo, incluyendo la actualización desde master y el formato correcto para el mensaje de commit?

Asistente: Antes de crear el Pull Request, es importante asegurarnos de que nuestra rama esté actualizada con los últimos cambios de la rama principal. Luego prepararemos los cambios y crearemos un commit con un mensaje bien estructurado.

> **_NOTE:_** Es una buena práctica hacer pull de la rama principal (master o main) antes de hacer commit para evitar conflictos posteriores.

```bash
# Primero, nos aseguramos de que nuestra rama esté actualizada con los últimos cambios de main
$ git checkout feature/CALC-483-cambiar-nombre-general-asignaciones
$ git pull origin main

# Luego, añadimos nuestros cambios
$ git add .
```

> **_NOTE:_** El mensaje de commit debe seguir esta estructura:
> 1. Primera línea: Código de la tarjeta y resumen breve (máx. 50 caracteres)
> 2. Línea en blanco
> 3. Descripción detallada del cambio (por qué se hizo)
> 4. Línea en blanco
> 5. Lista de cambios específicos (qué se hizo)

```bash
# Creamos el commit con un mensaje bien estructurado
$ git commit -m "CALC-483: Cambiar nombre de general Habilitar Descripción en Asignaciones\n\nSe cambió el nombre de la general para mantener coherencia con los formularios de asignación individual y masiva, donde se usa el término 'detalle' en lugar de 'descripción'.\n\nCambios realizados:\n- Actualizada la constante GENERAL_HABILITAR_DESCRIPCION_EN_ASIGNACIONES a GENERAL_HABILITAR_DETALLE_EN_ASIGNACIONES\n- Actualizado el nombre en la migración\n- Actualizadas las traducciones en los archivos de localización\n- Agregadas pruebas unitarias para verificar el cambio"

# Finalmente, enviamos los cambios a GitHub
$ git push origin feature/CALC-483-cambiar-nombre-general-asignaciones
```

[El asistente usa el MCP de GitHub para crear el Pull Request]

He creado un Pull Request con título "CALC-483: Cambiar nombre de general Habilitar Descripción en Asignaciones" desde la rama feature/CALC-483-cambiar-nombre-general-asignaciones hacia main.

Descripción del PR:
"Este PR cambia el nombre de la general 'Habilitar Descripción en Asignaciones' por 'Habilitar Detalle en Asignaciones' para mantener coherencia en toda la aplicación, según lo solicitado en la tarjeta CALC-483.

Cambios realizados:
- Actualizada la constante en el modelo General
- Actualizada la migración que crea esta general
- Actualizadas las traducciones en los archivos de localización
- Agregadas pruebas para verificar el cambio

Por favor, revisar y aprobar."

Puedes ver el PR en: https://github.com/bukhr/buk-webapp/pull/87

---

### 9. Actualizar la tarjeta en Jira

Por último, actualizamos el estado de la tarjeta en Jira:

---

Usuario: El Pull Request ha sido creado exitosamente. Antes de actualizar la tarjeta en Jira, necesito saber cuáles son los posibles estados a los que puede transicionar desde su estado actual "Backlog". ¿Puedes consultar esa información usando el MCP de Jira?

Asistente: Claro, voy a usar el MCP de Jira para consultar las posibles transiciones de estado para la tarjeta CALC-483.
[El asistente usa el MCP de Jira para consultar las transiciones disponibles]

He consultado las posibles transiciones para la tarjeta CALC-483. Actualmente está en estado "Backlog" y puede transicionar a los siguientes estados:

- "Por hacer" (To Do)
- "En progreso" (In Progress)
- "En revisión" (In Review)
- "Bloqueada" (Blocked)

La transición recomendada en este punto del flujo de trabajo es a "En revisión", ya que hemos completado la implementación y creado un Pull Request para revisión.

Usuario: Perfecto, ahora actualiza la tarjeta CALC-483 a estado "En revisión" y añade un comentario que incluya el enlace al Pull Request que acabamos de crear.

Asistente: Voy a usar el MCP de Jira para actualizar el estado de la tarjeta CALC-483.
[El asistente usa el MCP de Jira para actualizar la tarjeta]

He actualizado la tarjeta CALC-483 en Jira:
- Estado: Cambiado de "Backlog" a "En revisión"
- Comentario: "Implementación completada. Pull Request creado: https://github.com/bukhr/buk-webapp/pull/87"

---

Este ejemplo muestra cómo los MCP de Jira y GitHub pueden integrarse en tu flujo de trabajo para facilitar la implementación de tareas, desde la consulta de información hasta la creación de Pull Requests y actualización de tarjetas.

## Conclusiones y consideraciones importantes

### La importancia del review humano

A pesar de la potencia de los MCP servers para automatizar tareas, es fundamental mantener un proceso de review humano por las siguientes razones:

- **Validación de contexto**: Los MCP servers trabajan con la información disponible, pero los desarrolladores aportan contexto adicional y conocimiento del negocio que puede no estar documentado.

- **Evaluación de impacto**: Un desarrollador experimentado puede identificar posibles efectos secundarios o impactos en otras partes del sistema que no son evidentes para la herramienta.

- **Mejora continua**: El feedback humano sobre las soluciones propuestas por los MCP servers permite mejorar tanto las implementaciones como el uso de la herramienta.

- **Consideraciones de seguridad y calidad**: El review humano es esencial para garantizar que las implementaciones cumplen con los estándares de seguridad y calidad del código.

### La necesidad de un mejor slicing

La efectividad de los MCP servers depende directamente de la calidad del slicing de las tareas:

- **Granularidad adecuada**: Las tareas demasiado grandes o ambiguas dificultan el trabajo con MCP servers. Un buen slicing produce tareas concretas, bien definidas y con alcance limitado.

- **Contexto claro**: Cada tarea debe incluir suficiente contexto para ser entendida, pero sin abarcar demasiados aspectos diferentes del sistema.

- **Dependencias explícitas**: Un buen slicing identifica claramente las dependencias entre tareas, permitiendo trabajar en ellas en el orden correcto.

- **Criterios de aceptación precisos**: Definir criterios de aceptación claros y verificables mejora significativamente la capacidad de los MCP servers para proponer e implementar soluciones adecuadas.

### Mejora en tiempos de implementación sin sacrificar análisis

Los MCP servers no reemplazan el análisis, pero optimizan el tiempo de implementación:

- **Análisis asistido**: Los MCP servers pueden ayudar en el análisis inicial, identificando patrones en el código y proponiendo enfoques, pero el análisis final sigue requiriendo criterio humano.

- **Automatización de tareas repetitivas**: Tareas como la creación de ramas, commits con formato estandarizado, y actualizaciones de estado en Jira pueden automatizarse, liberando tiempo para el análisis de mayor valor.

- **Implementación acelerada**: Una vez definida la solución, los MCP servers pueden generar rápidamente el código necesario siguiendo patrones establecidos y mejores prácticas.

- **Pruebas más completas**: El tiempo ahorrado en la implementación puede invertirse en pruebas más exhaustivas y en mejorar la calidad general del código.

### Integración progresiva en el flujo de trabajo existente

La adopción de MCP servers debe realizarse de manera progresiva e integrada con los flujos de trabajo existentes:

- **Adopción incremental**: Comenzar con tareas simples y bien definidas antes de avanzar a casos más complejos permite a los equipos adaptarse gradualmente a la herramienta.

- **Complemento, no reemplazo**: Los MCP servers deben verse como un complemento a las habilidades del equipo, no como un reemplazo de roles o responsabilidades existentes.

- **Personalización por proyecto**: Cada proyecto puede requerir configuraciones específicas de los MCP servers para adaptarse a sus particularidades, tecnologías y procesos.

- **Documentación de patrones exitosos**: Documentar los casos de uso donde los MCP servers han sido más efectivos ayuda a establecer mejores prácticas y a optimizar su uso en futuros proyectos.

---

*Nota: Esta guía de instalación y configuración de MCP servers fue creada completamente utilizando Cascade.*
