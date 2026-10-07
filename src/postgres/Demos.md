# Demos

Some sample usage scenarios are shown below:

## This Demo is using the HR Schema

The HR schema is a sample schema that is not included in the PostgreSQL distribution. It is a simple schema that contains a few tables and some sample data.

To start a sample docker postgres container, run the following command:

```sh
% docker run -d --name some-postgres -e POSTGRES_PASSWORD=pg_2025 -p 5432:5432 postgres
```

To load the HR schema, run the following command:

```sh
% cat hr_schema_postgres.sql|docker exec -i some-postgres psql -U postgres -d postgres
```

To load the HR data, run the following command:

```sh
% cat hr_data_postgres.sql|docker exec -i some-postgres psql -U postgres -d postgres
% docker exec -i some-postgres psql -U postgres -d postgres -c "ANALYZE hr.countries; ANALYZE hr.locations; ANALYZE hr.departments;"
```

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on macOS, use `host.docker.internal` if the server is running on the host network (eg localhost)
* Credentials are passed via environment variables `PG_USER` and `PG_PASSWORD`

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "-e",
        "PG_USER=postgres",
        "-e",
        "PG_PASSWORD=pg_2025",
        "mochoa/mcp-postgres", 
        "postgresql://host.docker.internal:5432/postgres"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-postgres",
        "postgresql://localhost:5432/postgres"
      ],
      "env": {
        "PG_USER": "postgres",
        "PG_PASSWORD": "pg_2025"
      }
    }
  }
}
```

Replace `/postgres` with your database name.

### Demo Prompts

Sample prompts using the converted HR schema for PostgreSQL.

- pg-connect to postgresql://host.docker.internal:5432/postgres using postgres as user and pg_2025 as password
- pg-query SELECT c.country_name, l.city, COUNT(d.department_id)
FROM hr.countries c
JOIN hr.locations l ON c.country_id = l.country_id
JOIN hr.departments d ON l.location_id = d.location_id
WHERE d.department_id IN
 (SELECT e.department_id FROM hr.employees e
  GROUP BY e.department_id
  HAVING COUNT(e.department_id) > 5)
GROUP BY c.country_name, l.city
- pg-explain the execution plan
- visualize above execution plan in text mode
- pg-stats of hr.countries, hr.locations and hr.departments
- based on above table and index stats rewrite above query with a better execution plan
- visualize original and rewritten execution plan
- load resource postgresql://hr/countries/schema
- pg-awr

## Using Docker AI

[Ask Gordon](https://docs.docker.com/desktop/features/gordon/) is an AI assistant designed to streamline your Docker workflow by providing contextual assistance tailored to your local environment. Currently in Beta and available in Docker Desktop version 4.38.0 or later, Ask Gordon offers intelligent support for various Docker-related tasks.

```sh
% cd src/postgres
% docker ai 'pg-stats for table countries'    
                                                    
    • Calling stats ✔️                              
                                                    
  Here are the statistics for the COUNTRIES table:  
                                                    
  ### Table Statistics:                             
                                                    
    • Schema: public                                
    • Table Name: countries                         
    • Number of Rows: 25                            
    • Size: 8192 bytes                              
    • Sequential Scans: 3                           
                                                    
  ### Index Statistics:                             
                                                    
    • Index Name: country_c_id_pk                   
        • Size: 16384 bytes                         
        • Scans: 0                                  
                                                    
  ### Column Statistics:                            
                                                    
    1. country_id:                                  
                                                    
        • Type: character(2)                        
        • Nullable: NO                              
                                                    
    2. country_name:                                
                                                    
        • Type: character varying(60)               
        • Nullable: YES                             
                                                    
    3. region_id:                                   
                                                    
        • Type: integer                             
        • Nullable: YES                             
```

Using this sample gordon-mcp.yml file in a current directory:

```yml
services:
  time:
    image: mcp/time
  postgres:
    image: mochoa/mcp-postgres
    command: ["postgresql://host.docker.internal:5432/postgres"]
    environment:
      - PG_USER=postgres
      - PG_PASSWORD=pg_2025
```

## Using Gemini CLI

[Gemini CLI](https://github.com/google-gemini/gemini-cli/) 
is an open-source AI agent that brings the power of Gemini directly
into your terminal. It provides lightweight access to Gemini, giving you the
most direct path from your prompt to our model.

Using this sample settings.json file at ~/.gemini/ directory:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "PG_USER=postgres",
        "-e",
        "PG_PASSWORD=pg_2025",
        "mochoa/mcp-postgres",
        "postgresql://host.docker.internal:5432/postgres"
      ]
    }
  },
  "security": {
    "auth": {
      "selectedType": "gemini-api-key"
    }
  },
  "ui": {
    "theme": "ANSI"
  },
  "selectedAuthType": "gemini-api-key",
  "theme": "Dracula"
}
```

### Sample prompts with Gemini CLI

- connect to postgresql://host.docker.internal:5432/postgres using postgres as user and pg_2025 as password using postgres mcp server
- pg-query SELECT c.country_name, l.city, COUNT(d.department_id)
  FROM countries c
  JOIN locations l ON c.country_id = l.country_id
  JOIN departments d ON l.location_id = d.location_id
  WHERE d.department_id IN
    (SELECT e.department_id FROM employees e
     GROUP BY e.department_id
     HAVING COUNT(e.department_id) > 5)
  GROUP BY c.country_name, l.city
- pg-explain the execution plan
- visualize above execution plan in text mode
- pg-stats of countries, locations and departments
- based on above table and index stats rewrite above query with a better execution plan
- visualize original and rewritten execution plan

## Using Antigravity Code Editor

Put this in `~/.gemini/antigravity/mcp_config.json`

```json
{
    "mcpServers": {
        "postgres": {
            "command": "docker",
            "args": [
                "run",
                "-i",
                "--rm",
                "-e",
                "PG_USER=postgres",
                "-e",
                "PG_PASSWORD=pg_2025",
                "mochoa/mcp-postgres",
                "postgresql://host.docker.internal:5432/postgres"
            ]
        }
    },
    "inputs": []
}
```
