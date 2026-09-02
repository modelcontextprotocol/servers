# Demos

Some sample usage scenarios are shown below:

## This Demo is using the HR Schema

The HR schema is a sample schema that is not included in the MySQL distribution. It is a simple schema that contains a few tables and some sample data.

To start a sample docker mysql container, run the following command:

```sh
% docker run -d --name some-mysql -e MYSQL_ROOT_PASSWORD=my_2025 -p 3306:3306 mariadb:10
```

To load the HR schema, run the following command:

```sh
% cat hr_schema_mysql.sql|docker exec -i some-mysql mysql -u root -pmy_2025
```

To load the HR data, run the following command:

```sh
% cat hr_data_mysql.sql|docker exec -i some-mysql mysql -u root -pmy_2025 hr
```

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on macOS, use `host.docker.internal` if the server is running on the host network (eg localhost)
* Credentials are passed via environment variables `MYSQL_USER` and `MYSQL_PASSWORD`

```json
{
  "mcpServers": {
    "mysql": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "-e",
        "MYSQL_USER=root",
        "-e",
        "MYSQL_PASSWORD=my_2025",
        "mochoa/mcp-mysql", 
        "host.docker.internal:3306/hr"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-mysql",
        "localhost:3306/hr"
      ],
      "env": {
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "my_2025"
      }
    }
  }
}
```

Replace `/hr` with your database name.

### Demo Prompts

Sample prompts using the converted HR schema for MySQL.

- mysql-connect to host.docker.internal:3306/hr using root as user and my_2025 as password using mysql mcp server
- mysql-query SELECT c.country_name, l.city, COUNT(d.department_id)
FROM countries c
JOIN locations l ON c.country_id = l.country_id
JOIN departments d ON l.location_id = d.location_id
WHERE d.department_id IN
 (SELECT e.department_id FROM employees e
  GROUP BY e.department_id
  HAVING COUNT(e.department_id) > 5)
GROUP BY c.country_name, l.city
- mysql-explain the execution plan
- visualize above execution plan in text mode
- mysql-stats of countries, locations and departments
- based on above table and index stats rewrite above query with a better execution plan
- visualize original and rewritten execution plan
- load resource mysql://hr/countries/schema
- mysql-awr

## Using Docker AI

[Ask Gordon](https://docs.docker.com/desktop/features/gordon/) is an AI assistant designed to streamline your Docker workflow by providing contextual assistance tailored to your local environment. Currently in Beta and available in Docker Desktop version 4.38.0 or later, Ask Gordon offers intelligent support for various Docker-related tasks.

```sh
% cd src/mysql
% docker ai 'mysql-stats for table countries'    
                                                    
    • Calling stats ✔️                              
                                                    
  Here are the statistics for the COUNTRIES table:  
                                                    
  ### Table Statistics:                             
                                                    
    • Schema: hr                                    
    • Table Name: countries                         
    • Number of Rows: 25                            
    • Average Row Length: 655 bytes                 
    • Last Analyzed: 2025-12-11 22:00:38            
                                                    
  ### Index Statistics:                             
                                                    
    • Index Name: PRIMARY                           
        • Non Unique: 0                             
        • Cardinality: 25                           
        • Index Type: BTREE                         
                                                    
  ### Column Statistics:                            
                                                    
    1. country_id:                                  
                                                    
        • Type: char(2)                             
        • Nullable: NO                              
        • Key: PRI                                  
                                                    
    2. country_name:                                
                                                    
        • Type: varchar(60)                         
        • Nullable: YES                             
                                                    
    3. region_id:                                   
                                                    
        • Type: int                                 
        • Nullable: YES                             
        • Key: MUL                                  
```

Using this sample gordon-mcp.yml file in a current directory:

```yml
services:
  time:
    image: mcp/time
  mysql:
    image: mochoa/mcp-mysql
    command: ["host.docker.internal:3306/hr"]
    environment:
      - MYSQL_USER=root
      - MYSQL_PASSWORD=my_2025
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
    "mysql": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "MYSQL_USER=root",
        "-e",
        "MYSQL_PASSWORD=my_2025",
        "mochoa/mcp-mysql",
        "host.docker.internal:3306/hr"
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

- connect to host.docker.internal:3306/hr using root as user and my_2025 as password using mysql mcp server

- mysql-query SELECT c.country_name, l.city, COUNT(d.department_id)
  FROM countries c
  JOIN locations l ON c.country_id = l.country_id
  JOIN departments d ON l.location_id = d.location_id
  WHERE d.department_id IN
    (SELECT e.department_id FROM employees e
     GROUP BY e.department_id
     HAVING COUNT(e.department_id) > 5)
  GROUP BY c.country_name, l.city

- mysql-explain the execution plan

- visualize above execution plan in text mode

- mysql-stats of countries, locations and departments

- based on above table and index stats rewrite above query with a better execution plan

- visualize original and rewritten execution plan

## Using Antigravity Code Editor

Put this in `~/.gemini/antigravity/mcp_config.json`

```json
{
    "mcpServers": {
        "mysql": {
            "command": "docker",
            "args": [
                "run",
                "-i",
                "--rm",
                "-e",
                "MYSQL_USER=root",
                "-e",
                "MYSQL_PASSWORD=my_2025",
                "mochoa/mcp-mysql",
                "host.docker.internal:3306/hr"
            ]
        }
    },
    "inputs": []
}
```
