# Servidor MCP para GitHub Projects

Um servidor MCP (Model Context Protocol) para interagir com a API GitHub Projects V2.

## Descrição

Este servidor MCP permite que modelos de linguagem interajam com os projetos GitHub V2 por meio de um conjunto de ferramentas que fornecem operações de criação, leitura, atualização e exclusão (CRUD) para projetos e seus recursos associados como itens, campos e visualizações.

## Funcionalidades

### Operações de Projetos
- Listar projetos para um usuário ou organização
- Obter detalhes de um projeto específico
- Criar um novo projeto
- Atualizar um projeto existente
- Excluir um projeto

### Operações de Itens
- Listar itens em um projeto
- Adicionar um issue ou pull request a um projeto
- Criar um item rascunho
- Remover um item de um projeto
- Obter detalhes de um item específico

### Operações de Campos
- Listar campos em um projeto
- Criar um novo campo personalizado
- Atualizar o valor de um campo para um item
- Excluir um campo personalizado

### Operações de Visualizações
- Listar visualizações de um projeto
- Criar uma nova visualização
- Atualizar uma visualização existente
- Excluir uma visualização

## Pré-requisitos

- Node.js (versão 18 ou superior)
- Token de acesso pessoal do GitHub com os escopos `repo` e `project`

## Instalação

```bash
npm install @modelcontextprotocol/server-github-projects
```

## Configuração

Defina a variável de ambiente `GITHUB_PERSONAL_ACCESS_TOKEN` com seu token de acesso pessoal do GitHub:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=seu_token_aqui
```

## Uso

### Como um módulo

```javascript
import { startServer } from '@modelcontextprotocol/server-github-projects';

startServer();
```

### Como um executável

```bash
npx mcp-server-github-projects
```

## Exemplo de Uso

Aqui está um exemplo de como usar este servidor com uma plataforma de IA baseada em MCP:

```
# Listar projetos de um usuário
mcp__list_projects(owner="octocat", type="user")

# Criar um novo projeto
mcp__create_project(owner="minha-org", title="Meu Novo Projeto", type="organization", description="Um projeto para gerenciar tarefas")

# Adicionar um item ao projeto
mcp__add_project_item(project_id="PVT_kwHOA...", content_id="I_kwDOA...")

# Criar um campo personalizado de seleção única
mcp__create_project_field(project_id="PVT_kwHOA...", name="Status", dataType="SINGLE_SELECT", options=["Em progresso", "Concluído", "Bloqueado"])

# Atualizar o valor de um campo para um item
mcp__update_project_field_value(project_id="PVT_kwHOA...", item_id="PVTI_lADOA...", field_id="PVTF_lADOA...", value={optionId: "PVTFO_lADOA..."})
```

## Limitações

- Este servidor utiliza a API GraphQL do GitHub para Projects V2, que requer um token de acesso pessoal com os escopos apropriados.
- Algumas operações avançadas de customização de visualizações, como configuração de filtros complexos, podem não estar disponíveis nesta versão.

## Recursos adicionais

- [Documentação do GitHub Projects V2](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [Documentação da API GraphQL do GitHub](https://docs.github.com/en/graphql)
- [Documentação do MCP (Model Context Protocol)](https://modelcontextprotocol.ai)

## Licença

MIT 