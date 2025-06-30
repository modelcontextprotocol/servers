# Global variables for model IDs, server script paths, etc.

# This is the model used in the
CLAUDE_3_5_SONNET: str = 'us.anthropic.claude-3-sonnet-20240229-v1:0'
CLAUDE_3_5_HAIKU: str = "us.anthropic.claude-3-5-haiku-20241022-v1:0"

# This is the server script directory that contains several server scripts for monitoring, diagnosis, and remediation
SERVER_SCRIPTS_DIR: str = "./server_scripts"
MONTITORING_SCRIPT_PATH: str = f"{SERVER_SCRIPTS_DIR}/monitoring_agent_server.py"
DIAGNOSIS_SCRIPT_PATH: str = f"{SERVER_SCRIPTS_DIR}/diagnosis_agent_server.py"