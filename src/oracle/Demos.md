# Demos

Some sample usage scenarios are shown below:

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on macOS, use `host.docker.internal` if the server is running on the host network (eg localhost)
* Credentials are passed via environment variables `ORACLE_USER` and `ORACLE_PASSWORD`

```json
{
  "mcpServers": {
    "oracle": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "-e",
        "ORACLE_USER=scott",
        "-e",
        "ORACLE_PASSWORD=tiger",
        "mochoa/mcp-oracle", 
        "host.docker.internal:1521/freepdb1"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "oracle": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-oracle",
        "localhost:1521/freepdb1"
      ],
      "env": {
        "ORACLE_USER": "scott",
        "ORACLE_PASSWORD": "tiger"
      }
    }
  }
}
```

Replace `/freepdb1` with your database name.

### Demo Prompts

Sample prompts using the Oracle Database sample HR schema and 
[Oracle Database 23ai Free embedded database - Faststart - Docker Desktop Extension](https://open.docker.com/extensions/marketplace?extensionId=mochoa/oraclefree-docker-extension) .

- orcl-connect to host.docker.internal:1521/freepdb1 using hr as user and hr_2025 as password using oracle mcp server
- orcl-query SELECT COUNTRY_NAME, CITY, COUNT(DEPARTMENT_ID)
FROM HR.COUNTRIES JOIN HR.LOCATIONS USING (COUNTRY_ID) JOIN HR.DEPARTMENTS USING (LOCATION_ID)
WHERE DEPARTMENT_ID IN
 (SELECT DEPARTMENT_ID FROM HR.EMPLOYEES
  GROUP BY DEPARTMENT_ID
  HAVING COUNT(DEPARTMENT_ID)>5)
GROUP BY COUNTRY_NAME, CITY
- orcl-explain the execution plan
- visualize above execution plan in text mode
- orcl-stats of HR.COUNTRIES, HR.LOCATIONS and HR.DEPARTMENTS
- based on above table and index stats rewrite above query with a better execution plan
- visualize original and rewritten execution plan
- load resource oracle://HR/COUNTRIES/schema

See in action using Claude Desktop App

![Oracle MCP Server demo](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/demo-prompts.gif?raw=true)

## Using Docker AI

[Ask Gordon](https://docs.docker.com/desktop/features/gordon/) is an AI assistant designed to streamline your Docker workflow by providing contextual assistance tailored to your local environment. Currently in Beta and available in Docker Desktop version 4.38.0 or later, Ask Gordon offers intelligent support for various Docker-related tasks.

```sh
% cd src/oracle
% docker ai 'orcl-stats for table countries'    
                                                    
    • Calling stats ✔️                              
                                                    
  Here are the statistics for the COUNTRIES table:  
                                                    
  ### Table Statistics:                             
                                                    
    • Owner: HR                                     
    • Table Name: COUNTRIES                         
    • Number of Rows: 25                            
    • Average Row Length: 16 bytes                  
    • Last Analyzed: 2025-03-10 22:00:38            
                                                    
  ### Index Statistics:                             
                                                    
    • Index Name: COUNTRY_C_ID_PK                   
        • B-Level: 0                                
        • Leaf Blocks: 1                            
        • Distinct Keys: 25                         
        • Number of Rows: 25                        
        • Clustering Factor: 0                      
        • Last Analyzed: 2025-03-10 22:00:38        
                                                    
  ### Column Statistics:                            
                                                    
    1. COUNTRY_ID:                                  
                                                    
        • Number of Distinct Values: 25             
        • Density: 0.04                             
        • Histogram: NONE                           
        • Last Analyzed: 2025-03-10 22:00:38        
                                                    
    2. COUNTRY_NAME:                                
                                                    
        • Number of Distinct Values: 25             
        • Density: 0.04                             
        • Histogram: NONE                           
        • Last Analyzed: 2025-03-10 22:00:38        
                                                    
    3. REGION_ID:                                   
                                                    
        • Number of Distinct Values: 5              
        • Density: 0.02                             
        • Histogram: FREQUENCY                      
        • Last Analyzed: 2025-03-10 22:00:38        
```

Using this sample gordon-mcp.yml file in a current directory:

```yml
services:
  time:
    image: mcp/time
  oracle:
    image: mochoa/mcp-oracle
    command: ["host.docker.internal:1521/freepdb1"]
    environment:
      - ORACLE_USER=scott
      - ORACLE_PASSWORD=tiger
```

## Using Gemini CLI

![Gemini CLI Screenshot](https://github.com/google-gemini/gemini-cli/blob/c583b510e09ddf9d58cca5b6132bf19a8f5a8091/docs/assets/gemini-screenshot.png?raw=true)

[Gemini CLI](https://github.com/google-gemini/gemini-cli/) 
is an open-source AI agent that brings the power of Gemini directly
into your terminal. It provides lightweight access to Gemini, giving you the
most direct path from your prompt to our model.

Using this sample settings.json file at ~/.gemini/ directory:

```json
{
  "mcpServers": {
    "oracle": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "ORACLE_USER=sh",
        "-e",
        "ORACLE_PASSWORD=sh_2025",
        "mochoa/mcp-oracle",
        "host.docker.internal:1521/freepdb1"
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

- connect to host.docker.internal:1521/freepdb1 using hr as user and hr_2025 as password using oracle mcp server
  ![connect](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-connect.png?raw=true)

- orcl-query SELECT COUNTRY_NAME, CITY, COUNT(DEPARTMENT_ID)
  FROM COUNTRIES JOIN LOCATIONS USING (COUNTRY_ID) JOIN DEPARTMENTS USING (LOCATION_ID)
  WHERE DEPARTMENT_ID IN
    (SELECT DEPARTMENT_ID FROM EMPLOYEES
     GROUP BY DEPARTMENT_ID
     HAVING COUNT(DEPARTMENT_ID)>5)
  GROUP BY COUNTRY_NAME, CITY
  ![query](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-query.png?raw=true)

- orcl-explain the execution plan
  ![explain top](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-explain-1.png?raw=true)
  ![explain botton](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-explain-2.png?raw=true)

- visualize above execution plan in text mode
  ![visualize](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-visualize.png?raw=true)

- orcl-stats of COUNTRIES, LOCATIONS and DEPARTMENTS
  ![stats top](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-stats-1.png?raw=true)
  ![stats botton](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-stats-2.png?raw=true)

- based on above table and index stats rewrite above query with a better execution plan
  ![new-query](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-new-query.png?raw=true)

- visualize original and rewritten execution plan
  ![bot-plans](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/gemini-cli-both-plans.png?raw=true)

## Using Antigravity Code Editor

![antigravity](https://github.com/marcelo-ochoa/servers/blob/main/src/oracle/images/antigravity.png?raw=true)

Put this in `~/.gemini/antigravity/mcp_config.json`

```json
{
    "mcpServers": {
        "oracle": {
            "command": "docker",
            "args": [
                "run",
                "-i",
                "--rm",
                "-e",
                "ORACLE_USER=hr",
                "-e",
                "ORACLE_PASSWORD=hr_2025",
                "mochoa/mcp-oracle",
                "host.docker.internal:1521/freepdb1"
            ]
        }
    },
    "inputs": []
}
```
