# jira_server.py
import json
import os
import requests
from datetime import datetime
from typing import Dict, Any, Optional
from mcp.server.fastmcp import FastMCP, Context

# Create MCP server for Jira ticket creation
jira_server = FastMCP("AWS-Jira-Tickets-Server")


# Get Jira configuration from environment variables
JIRA_API_TOKEN = os.environ.get("JIRA_API_TOKEN")
JIRA_USERNAME = os.environ.get("JIRA_USERNAME")
JIRA_INSTANCE_URL = os.environ.get("JIRA_INSTANCE_URL")
JIRA_CLOUD = os.environ.get("JIRA_CLOUD", "True").lower() == "true"
DEFAULT_PROJECT_KEY = os.environ.get("PROJECT_KEY", "ASCRT")

print(f"Server started with:")
print(f"  - Username: {JIRA_USERNAME}")
print(f"  - Instance URL: {JIRA_INSTANCE_URL}")
print(f"  - Cloud: {JIRA_CLOUD}")
print(f"  - Default Project Key: {DEFAULT_PROJECT_KEY}")

class JiraAPIWrapper:
    def __init__(self, username=None, api_token=None, instance_url=None, is_cloud=True):
        self.username = username or JIRA_USERNAME
        self.api_token = api_token or JIRA_API_TOKEN
        self.instance_url = instance_url or JIRA_INSTANCE_URL
        if self.instance_url:
            self.instance_url = self.instance_url.rstrip('/')
        self.is_cloud = is_cloud if is_cloud is not None else JIRA_CLOUD
        
        print(f"JiraAPIWrapper initialized with:")
        print(f"  - Username: {self.username}")
        print(f"  - Instance URL: {self.instance_url}")
        print(f"  - Cloud: {self.is_cloud}")
        
    def issue_create(self, fields_json):
        """Creates a Jira issue using the Jira REST API."""
        # Validate required attributes
        if not self.username:
            raise ValueError("JIRA_USERNAME is not set")
        if not self.api_token:
            raise ValueError("JIRA_API_TOKEN is not set")
        if not self.instance_url:
            raise ValueError("JIRA_INSTANCE_URL is not set")
        
        # Set up auth and headers
        auth = (self.username, self.api_token)
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        
        # API endpoint for issue creation - using API v3 for Cloud
        url = f"{self.instance_url}/rest/api/3/issue"
        
        print(f"Creating issue at: {url}")
        
        # Parse the JSON to extract project key for logging
        fields = json.loads(fields_json)
        if "fields" in fields and "project" in fields["fields"]:
            print(f"Creating issue in project: {fields['fields']['project']['key']}")
            print(f"Issue summary: {fields['fields']['summary']}")
        
        # Make the API request
        response = requests.post(url, auth=auth, headers=headers, data=fields_json)
        
        # Check response status
        if response.status_code == 201:
            return response.json()
        else:
            print(f"Error: {response.status_code} - {response.text}")
            raise Exception(f"Failed to create issue: {response.text}")

@jira_server.tool()
def create_jira_issue(
    summary: str, 
    description: str
) -> Dict[str, Any]:
    """
    Creates a new issue in Jira with the specified details.
    
    Args:
        summary (str): Summary/title of the issue
        description (str): Detailed description of the issue
        
    Returns:
        Dictionary with issue creation details
    """
    try:
        # Use project key from environment variables
        project_key = DEFAULT_PROJECT_KEY
        print(f"Creating Jira issue for project: {project_key}")
        
        # Create Jira API wrapper
        jira = JiraAPIWrapper()
        
        # Create issue fields - formatted for Jira Cloud API v3
        issue_fields = {
            "fields": {
                "summary": summary,
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "text",
                                    "text": description
                                }
                            ]
                        }
                    ]
                },
                "issuetype": {"name": "Task"},
                "project": {"key": project_key}
            }
        }
        
        # Convert to JSON
        issue_fields_json = json.dumps(issue_fields)
        print(f"Sending JSON: {issue_fields_json}")
        
        # Create the issue
        result = jira.issue_create(issue_fields_json)
        print(f"CREATED THE JIRA TICKET! Check your JIRA dashboard.")
        
        # Return success result
        return {
            "status": "success",
            "message": "Jira issue created successfully",
            "issue_key": result.get("key"),
            "issue_id": result.get("id"),
            "issue_url": f"{jira.instance_url}/browse/{result.get('key')}",
            "created_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return {
            "status": "error", 
            "message": f"Error creating Jira issue: {str(e)}"
        }

@jira_server.prompt()
def create_aws_jira_tickets() -> str:
    """Prompt for creating Jira tickets for AWS issues."""
    return """
    You are the AWS Jira Ticket Creation Agent. You have access to a tool that can create well-formatted Jira tickets for AWS issues and incidents.

    Your workflow is:
    
    1. **Gather Information for Jira Ticket:**
       - Collect necessary details about the AWS issue from the user.
       - Ensure you have enough information to create a comprehensive ticket.
       - Ask clarifying questions if needed to get complete information.
    
    2. **Create Well-Structured Jira Tickets:**
       - Use the `create_jira_issue` tool to create formatted tickets.
       - Structure the ticket with a clear summary, detailed description, and recommended actions.
    
    **Guidelines for Creating Effective Jira Tickets:**
    
    - **Summary:** Keep it concise yet descriptive. Format as: "[SERVICE] - [BRIEF ISSUE DESCRIPTION]" 
      Example: "EC2 - High CPU Utilization on Production Servers"
    
    - **Description:** Structure with the following sections:
      * **Issue:** Detailed explanation of the problem
      * **Impact:** Who/what is affected and how severely
      * **Evidence:** Relevant log excerpts, timestamps, and metrics
      * **Recommendations:** Suggested resolution steps
    
    When communicating with users:
    1. Confirm ticket details before creation
    2. Provide a summary of the created ticket
    3. Suggest any follow-up actions
    
    Your goal is to ensure AWS issues are properly documented in Jira for tracking and resolution.
    """

if __name__ == "__main__":
    # Debug: print environment variables
    print("Environment variables check:")
    print(f"JIRA_USERNAME: {JIRA_USERNAME or 'NOT SET'}")
    print(f"JIRA_INSTANCE_URL: {JIRA_INSTANCE_URL or 'NOT SET'}")
    print(f"PROJECT_KEY: {DEFAULT_PROJECT_KEY or 'NOT SET'}")
    print(f"JIRA_API_TOKEN: {'SET' if JIRA_API_TOKEN else 'NOT SET'}")
    
    # Run the server
    jira_server.run(transport='stdio')