# Demos

Some sample usage scenarios are shown below:

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on macOS, use `host.docker.internal` if the server is running on the host network (eg localhost)
* Credentials are passed via environment variables `QNAP_USER` and `QNAP_PASSWORD`

```json
{
  "mcpServers": {
    "qnap": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "-e",
        "QNAP_USER=admin",
        "-e",
        "QNAP_PASSWORD=password",
        "mochoa/mcp-qnap", 
        "http://10.1.1.241:8080"]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "qnap": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-qnap",
        "http://10.1.1.241:8080"
      ],
      "env": {
        "QNAP_USER": "admin",
        "QNAP_PASSWORD": "password"
      }
    }
  }
}
```

### Demo Prompts

Sample prompts using above server.

- qnap-connect http://10.1.1.241:8080 admin password
- qnap-report
- qnap-dir /Public
- qnap-file-info /Public/test.txt
- analyze backup files in several subdirectories of `/backup/stacks` on the QNAP NAS. For each subdirectory compare the two most recent backups (daily or weekly, identified by filenames like `alldb_backup-2.sql.gz` for weekly and `alldb_backup-09.sql.gz` for daily). The comparison should be based on file size, considering backups with similar sizes as correct. Generate a report indicating the status (OK or Error) for each directory based on this comparison.

### Using Resources

You can interact with QNAP resources directly:

- `list resources from qnap`
- `read resource qnap://10.1.1.241:8080/volume/1`
- `show health for all disks on qnap using resources`
- `check storage usage for Docker volume using qnap resources`


### Backup Analysis Report Example

Prompt: Using information about files of sub-folders from qnap-dir /backup/stacks
   - ayudarg
   - glpi
   - invop
   - kanboard
   - mon
   - moodle
   - mygis
   - ocular-vet
   - patogis
   - piexa
   - web
   - yact

files into above sub-dirs are backups daily or weekly, for example: alldb_backup-2.sql.gz (meaning last backup of week 2 of current month) alldb_backup-09.sql.gz (meaning last daily backup) in some folder there are weekly backups and other are daily backups. please compare last (weekly/daily) with the previous one sorted descending by modification date using the size information of the file. A correct backup will be similar in size, for example 31.41 Mb and 31.33Mb. Make report in tabular format including the directory name, the two most recent backup files with their modification date and size, the size difference and the status (OK or Error) based on explained failed.

Response:
I have verified the two most recent backup files for each directory, comparing their timestamps and file sizes. "Similar size" is interpreted as a difference of less than 5%, which indicates a successful backup chain.

#### QNAP Backup Status Report
**Date:** 2026-02-09

| Directory | Frequency | Latest Backup | Previous Backup | Size Comparison | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ayudarg** | Weekly | `alldb_backup-2.sql.gz`<br>(Feb 08, 868.7 KB) | `alldb_backup-1.sql.gz`<br>(Feb 01, 868.7 KB) | Diff: 2 bytes (~0%) | **OK** |
| **glpi** | Daily | `alldb_backup-09.sql.gz`<br>(Feb 09, 32.9 MB) | `alldb_backup-08.sql.gz`<br>(Feb 08, 32.8 MB) | Diff: ~89 KB (~0.2%) | **OK** |
| **invop** | Weekly | `alldb_backup-2.sql.gz`<br>(Feb 08, 1.41 MB) | `alldb_backup-1.sql.gz`<br>(Feb 01, 1.41 MB) | Diff: 1 byte (~0%) | **OK** |
| **kanboard** | Daily | `alldb_backup-09.sql.gz`<br>(Feb 09, 2.97 MB) | `alldb_backup-08.sql.gz`<br>(Feb 08, 2.92 MB) | Diff: ~45 KB (~1.5%) | **OK** |
| **mon** | Weekly | `alldb_backup-2.sql.gz`<br>(Feb 08, 33.6 MB) | `alldb_backup-1.sql.gz`<br>(Feb 01, 33.7 MB) | Diff: ~117 KB (~0.3%) | **OK** |
| **moodle** | Daily | `full-backup-09.sql.gz`<br>(Feb 09, 654 MB) | `full-backup-08.sql.gz`<br>(Feb 08, 653 MB) | Diff: ~234 KB (~0.03%) | **OK** |
| **mygis** | Weekly | `full-backup-2.dump`<br>(Feb 08, 314 KB) | `full-backup-1.dump`<br>(Feb 01, 314 KB) | Diff: 0 bytes (0%) | **OK** |
| **ocular-vet** | Weekly | `backup-OcularVetDB-2.dump`<br>(Feb 08, 251 KB) | `backup-OcularVetDB-1.dump`<br>(Feb 01, 251 KB) | Diff: ~623 bytes (0.2%) | **OK** |
| **patogis** | Weekly | `full-backup-2.dump`<br>(Feb 08, 438 KB) | `full-backup-1.dump`<br>(Feb 01, 438 KB) | Diff: 0 bytes (0%) | **OK** |
| **piexa** | Daily | `full-backup-09.sql.gz`<br>(Feb 09, 162 MB) | `full-backup-08.sql.gz`<br>(Feb 08, 163 MB) | Diff: ~2.2 MB (~0.1%) | **OK** |
| **web** | Daily | `wordpress_backup-09.sql.gz`<br>(Feb 09, 23.8 MB) | `wordpress_backup-08.sql.gz`<br>(Feb 08, 23.8 MB) | Diff: ~12 KB (~0.05%) | **OK** |
| **yact** | Weekly | `backup-YactDB-2.gz`<br>(Feb 08, 2.14 MB) | `backup-YactDB-1.gz`<br>(Feb 01, 2.14 MB) | Diff: 0 bytes (0%) | **OK** |

#### Summary
All analyzed directories show consistent backup sizes and up-to-date timestamps (Feb 08 for weekly, Feb 09 for daily). No errors were detected.

## Using Gemini CLI

[Gemini CLI](https://github.com/google-gemini/gemini-cli/) 
is an open-source AI agent that brings the power of Gemini directly
into your terminal. It provides lightweight access to Gemini, giving you the
most direct path from your prompt to our model.

Using this sample settings.json file at ~/.gemini/ directory:

```json
{
  "mcpServers": {
    "qnap": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-qnap",
        "http://10.1.1.241:8080"
      ],
      "env": {
        "QNAP_USER": "admin",
        "QNAP_PASSWORD": "password"
      }
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

- qnap-connect to http://10.1.1.241:8080 using admin as user and password as password using qnap mcp server
- qnap-report
- analyze backup files in several subdirectories of `/backup/stacks` on the QNAP NAS. For each subdirectory compare the two most recent backups (daily or weekly, identified by filenames like `alldb_backup-2.sql.gz` for weekly and `alldb_backup-09.sql.gz` for daily). The comparison should be based on file size, considering backups with similar sizes as correct. Generate a report indicating the status (OK or Error) for each directory based on this comparison.

### qnap-report Output Example

The `qnap-report` tool now returns a professionally formatted Markdown report with tabular data, making it easy for both humans and AI models to read.

# QNAP System Report
**Timestamp:** 2/12/2026, 12:21 PM
**Host:** http://10.254.0.158:8080

## Resource Usage
- **CPU Usage:** 7.9 %
- **Memory:** 1262MB / 4075MB (31.0% used)
- **Uptime:** 29 days, 2 hours, 3 minutes
- **System Temperature:** 34°C

## Disk Health
| Alias | Model | Serial | Capacity | Health | Temperature |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 3.5" SATA HDD 1 | WD40EFAX-68JH4N1 | WD-WXV2A8296XZ5 | 3.64 TB | OK | 35°C |
| 3.5" SATA HDD 2 | WD40EFAX-68JH4N1 | WD-WXW2A82FPRD1 | 3.64 TB | OK | 34°C |
| ... | ... | ... | ... | ... | ... |

## Storage Information
| Name | Total | Used | Free | Usage |
| :--- | :--- | :--- | :--- | :--- |
| System | 503.32 GB | 27.14 GB | 476.18 GB | 5.4% |
| Docker | 793.05 GB | 258.59 GB | 534.46 GB | 32.6% |
| ... | ... | ... | ... | ... | ... |

## Using Antigravity Code Editor

Put this in `~/.gemini/antigravity/mcp_config.json`

```json
{
    "mcpServers": {
        "qnap": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "-e",
        "QNAP_USER=admin",
        "-e",
        "QNAP_PASSWORD=password",
        "mochoa/mcp-qnap", 
        "http://10.1.1.241:8080"
      ]
    }
  }
}
```
