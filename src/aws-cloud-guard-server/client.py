import os
import sys
import json
import asyncio
import argparse
from globals import *
from contextlib import AsyncExitStack
from langchain_aws import ChatBedrock
from typing import Optional, Dict, List
from mcp.client.stdio import stdio_client
from langgraph.prebuilt import create_react_agent
from langchain_mcp_adapters.tools import load_mcp_tools
from mcp import ClientSession, StdioServerParameters
from langchain_mcp_adapters.client import MultiServerMCPClient

def parse_arguments():
    """Parse command line arguments, falling back to environment variables when available"""
    parser = argparse.ArgumentParser(description='AWS Monitoring and Jira Ticket Client')
    
    # Jira configuration
    parser.add_argument('--jira-api-token', type=str, 
                        default=os.environ.get('JIRA_API_TOKEN', ''),
                        help='Jira API token')
    parser.add_argument('--jira-username', type=str,
                        default=os.environ.get('JIRA_USERNAME', ''),
                        help='Jira username')
    parser.add_argument('--jira-instance-url', type=str,
                        default=os.environ.get('JIRA_INSTANCE_URL', ''),
                        help='Jira instance URL')
    parser.add_argument('--jira-cloud', type=str,
                        default=os.environ.get('JIRA_CLOUD', 'True'),
                        help='Whether Jira is cloud-based (True/False)')
    parser.add_argument('--project-key', type=str,
                        default=os.environ.get('PROJECT_KEY', 'ASCRT'),
                        help='Jira project key')
    
    # Model configuration
    parser.add_argument('--model-id', type=str, default=CLAUDE_3_5_HAIKU,
                        help='Bedrock model ID')
    
    parser.add_argument('--bedrock-log-group', type=str,
                        default=os.environ.get('BEDROCK_LOG_GROUP', 'bedrockloggroup'),
                        help='Bedrock log group')
    
    # Python executable path
    parser.add_argument('--python-path', type=str,
                        default=sys.executable,
                        help='Full path to the Python executable')
    
    args = parser.parse_args()
    return args

class MCPClient:
    def __init__(self, args):
        # Initialize session and client objects
        self.monitoring_session: Optional[ClientSession] = None
        self.jira_session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.monitoring_tools = None
        self.jira_tools = None
        self.monitoring_system_prompt = None
        self.jira_system_prompt = None
        
        # Store arguments
        self.args = args
        
        # Set environment variables from args
        os.environ['JIRA_API_TOKEN'] = args.jira_api_token
        os.environ['JIRA_USERNAME'] = args.jira_username
        os.environ['JIRA_INSTANCE_URL'] = args.jira_instance_url
        os.environ['JIRA_CLOUD'] = args.jira_cloud
        os.environ['PROJECT_KEY'] = args.project_key
        os.environ['BEDROCK_LOG_GROUP'] = args.bedrock_log_group
        
        # Print startup information
        print(f"Using Python executable: {args.python_path}")
        print(f"Jira configuration:")
        print(f"  - Username: {args.jira_username}")
        print(f"  - Instance URL: {args.jira_instance_url}")
        print(f"  - Project Key: {args.project_key}")
        print(f"  - Bedrock log group: {args.bedrock_log_group}")
        print(f"  - API Token: {'Configured' if args.jira_api_token else 'Not configured'}")
        
    async def connect_to_servers(self):
        """Connect to both MCP servers"""
        # Connect to monitoring server
        monitoring_params = StdioServerParameters(
            command=self.args.python_path,  # Use full path to Python
            args=[MONTITORING_SCRIPT_PATH]
        )

        monitoring_transport = await self.exit_stack.enter_async_context(stdio_client(monitoring_params))
        monitoring_stdio, monitoring_write = monitoring_transport
        self.monitoring_session = await self.exit_stack.enter_async_context(
            ClientSession(monitoring_stdio, monitoring_write)
        )

        # Initialize the monitoring MCP server
        await self.monitoring_session.initialize()
        print(f"Connected to the AWS Monitoring server")
        
        # Connect to Jira server with environment variables
        env_vars = {
            'JIRA_API_TOKEN': self.args.jira_api_token,
            'JIRA_USERNAME': self.args.jira_username,
            'JIRA_INSTANCE_URL': self.args.jira_instance_url,
            'JIRA_CLOUD': self.args.jira_cloud,
            'PROJECT_KEY': self.args.project_key,
            'BEDROCK_LOG_GROUP': self.args.bedrock_log_group
        }
        
        jira_params = StdioServerParameters(
            command=self.args.python_path,  # Use full path to Python
            args=[DIAGNOSIS_SCRIPT_PATH],
            env=env_vars
        )

        jira_transport = await self.exit_stack.enter_async_context(stdio_client(jira_params))
        jira_stdio, jira_write = jira_transport
        self.jira_session = await self.exit_stack.enter_async_context(
            ClientSession(jira_stdio, jira_write)
        )

        # Initialize the Jira MCP server
        await self.jira_session.initialize()
        print(f"Connected to the AWS Jira Tickets server")
        
        # Get prompts from both servers
        try:
            # Get monitoring prompt
            self.monitoring_prompt_response = await self.monitoring_session.get_prompt("analyze_aws_logs")
            
            if hasattr(self.monitoring_prompt_response, 'messages') and self.monitoring_prompt_response.messages:
                self.monitoring_system_prompt = self.monitoring_prompt_response.messages[0].content.text
                print(f"Monitoring system prompt loaded")
            else:
                self.monitoring_system_prompt = """
                You are the monitoring agent responsible for analyzing CloudWatch logs for AWS services.
                """
                
            # Get Jira prompt
            self.jira_prompt_response = await self.jira_session.get_prompt("create_aws_jira_tickets")
            
            if hasattr(self.jira_prompt_response, 'messages') and self.jira_prompt_response.messages:
                self.jira_system_prompt = self.jira_prompt_response.messages[0].content.text
                print(f"Jira system prompt loaded")
            else:
                self.jira_system_prompt = """
                You are the AWS Jira Ticket Creation Agent.
                """
        except Exception as e:
            print(f"Error extracting prompts: {e}")
            raise e
            
        # Load tools from both servers
        self.monitoring_tools = await load_mcp_tools(self.monitoring_session)
        self.jira_tools = await load_mcp_tools(self.jira_session)
        
        # Combine all tools
        self.all_tools = self.monitoring_tools + self.jira_tools
        
        print("Available tools:", [tool.name for tool in self.all_tools])
        
        # List available resources from both servers
        try:
            monitoring_resources_response = await self.monitoring_session.list_resources()
            self.monitoring_resources = monitoring_resources_response.resources
            print("Monitoring resources:", [resource.uri for resource in self.monitoring_resources])
            
            jira_resources_response = await self.jira_session.list_resources()
            self.jira_resources = jira_resources_response.resources
            print("Jira resources:", [resource.uri for resource in self.jira_resources])
        except Exception as e:
            print(f"Error listing resources: {e}")

    async def process_query(self, query: str, conversation_history=None) -> str:
        """Process a query using ReAct agent and available tools from both servers"""
        if not self.monitoring_session or not self.jira_session:
            return "Error: Not connected to servers. Please connect first."
        
        # Initialize conversation history if not provided
        if conversation_history is None:
            conversation_history = []
        
        # Combine the system prompts
        combined_system_prompt = f"""
        You are an AWS Monitoring and Jira Ticket Agent with access to multiple tools. 
        
        IMPORTANT:
        Follow the instructions carefully and use the tools as needed:
        - Your first question should be to ask the user for which account they want to monitor: their own or a cross-account.
        - If the user says "my account", use the default account.
        - If the user says "cross account", ask for the account_id and role_name to assume the role in that account.
        - If the user doesn't provide an account, always ask for this.
        - Use the account id and role_name parameters in the tools you call as strings if provided.
        - CONVERT THE ACCOUNT_ID AND ROLE_NAME TO STRING VALUES BEFORE PASSING THEM TO THE TOOLS.
        
        MONITORING CAPABILITIES:
        {self.monitoring_system_prompt}
        
        JIRA TICKET CREATION CAPABILITIES:
        {self.jira_system_prompt}
        
        First, if the user asks for monitoring information in AWS, ask the user always to provide which account.
        If the users says "my account", then use the default account. If the user says another account, then use the account_id and 
        the role_name to assume the role in that account. Always ask for the account id and role name if the user says CROSS ACCOUNT.
        If the user doesn't provide an account, then ALWAYS ask the user for this.
        Once the user provides this, use the setup_cross_account_access tool to assume the role.
        
        You should first analyze CloudWatch logs and alarms using the monitoring tools.
        THEN use create_jira_issue tool to create a ticket that includes these AWS-recommended steps.
        
        IMPORTANT: Always create comprehensive tickets that include all information found during monitoring 
        and the AWS remediation steps found via search_aws_remediation. When the user says "create a JIRA ticket", 
        you MUST run search_aws_remediation BEFORE creating the ticket, and include those remediation steps in the ticket.
        
        FOLLOW THESE STEPS IN ORDER WHEN CREATING A TICKET:
        1. Analyze logs or collect issue information (if not done already)
        2. Search for AWS remediation steps using search_aws_remediation
        3. Create the JIRA ticket using create_jira_issue, including the remediation steps from step 2
        
        Available tools:
        - Monitoring tools: setup_cross_account_access, list_cloudwatch_dashboards, fetch_cloudwatch_logs_for_service, get_cloudwatch_alarms_for_service, get_dashboard_summary
        - Jira tools: create_jira_issue
        
        The user MUST EXPLICITLY ask you to create a ticket, don't create tickets unprompted.
        """
        
        try:
            # Create a model instance
            model = ChatBedrock(model_id=self.args.model_id)
            
            # Create a ReAct agent with all tools
            agent = create_react_agent(
                model,
                self.all_tools
            )
            print(f"Initialized the AWS combined ReAct agent...")
            
            # Format messages including conversation history
            formatted_messages = [
                {"role": "system", "content": combined_system_prompt}
            ]
            
            # Add conversation history
            for message in conversation_history:
                formatted_messages.append(message)
                
            # Add current query
            formatted_messages.append({"role": "user", "content": query})
            
            print(f"Formatted messages prepared")
            
            # Invoke the agent
            response = await agent.ainvoke({"messages": formatted_messages})
            
            # Process the response
            if response and "messages" in response and response["messages"]:
                last_message = response["messages"][-1]
                if isinstance(last_message, dict) and "content" in last_message:
                    # Save this interaction in the conversation history
                    conversation_history.append({"role": "user", "content": query})
                    conversation_history.append({"role": "assistant", "content": last_message["content"]})
                    return last_message["content"], conversation_history
                else:
                    conversation_history.append({"role": "user", "content": query})
                    conversation_history.append({"role": "assistant", "content": str(last_message.content)})
                    return str(last_message.content), conversation_history
            else:
                return "No valid response received", conversation_history
                
        except Exception as e:
            print(f"Error details: {e}")
            import traceback
            traceback.print_exc()
            return f"Error processing query: {str(e)}", conversation_history

    async def chat_loop(self):
        """Run an interactive chat loop"""
        print("\nAWS Monitoring and Jira Ticket Client Started!")
        print("Type your queries or 'quit' to exit.")
        print("\nExample queries you can try:")
        print("- List some of the logs in my account")
        print("- Check if there are any errors in the Lambda logs")
        print("- Are there any alarms in the CloudWatch logs?")
        print("- Create a Jira ticket for the S3 access denied issues")
        print("- What remediation steps does AWS recommend for RDS performance issues?")

        # Initialize conversation history
        conversation_history = []

        while True:
            try:
                query = input("\nQuery: ").strip()

                if query.lower() == 'quit':
                    break

                response, conversation_history = await self.process_query(query, conversation_history)
                print("\n" + response)

            except Exception as e:
                print(f"\nError: {str(e)}")

    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()

async def main():
    # Parse arguments
    args = parse_arguments()
    
    client = MCPClient(args)
    try:
        await client.connect_to_servers()
        await client.chat_loop()
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        await client.cleanup()

if __name__ == "__main__":
    asyncio.run(main())