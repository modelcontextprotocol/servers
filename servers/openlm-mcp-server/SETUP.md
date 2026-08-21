# OpenLM MCP Server - Claude Setup Guide

## Overview

The OpenLM MCP Server connects Claude to your OpenLM license management system, giving you instant access to license usage data, allocations, and analytics through natural conversation.

## Prerequisites

- An active OpenLM account with valid credentials
- - Access to the OpenLM platform (https://www.openlm.com)
  - - Claude desktop app or web interface with connector support
   
    - ## Installation Steps
   
    - ### Step 1: Add the OpenLM Connector in Claude
   
    - 1. Open Claude (desktop app or web)
      2. 2. Go to **Settings** → **Connectors** (or **Integrations**)
         3. 3. Search for **"OpenLM"** or **"OpenLM License Manager"**
            4. 4. Click **"Add"** or **"Install"**
              
               5. ### Step 2: Authenticate with OpenLM
              
               6. When prompted, you'll see the OpenLM login screen:
              
               7. 1. Enter your **OpenLM username** (or email)
                  2. 2. Enter your **OpenLM password**
                     3. 3. Click **"Sign In"**
                       
                        4. The authentication uses OAuth 2.0 through the secure OpenLM endpoint (https://cloud-us.openlm.com/mcp).
                       
                        5. ### Step 3: Grant Permissions
                       
                        6. Claude will request permission to access:
                        7. - License usage data (read-only)
                           - - License allocations (read-only)
                             - - Analytics and reporting data (read-only)
                              
                               - Click **"Allow"** to proceed.
                              
                               - ### Step 4: Verify Connection
                              
                               - Once connected, the OpenLM connector status will show as **"Connected"** in your integrations list.
                              
                               - ## Using the OpenLM Connector
                              
                               - After setup, you can ask Claude questions like:
                              
                               - - "What's my current license usage?"
                                 - - "Show me my license allocations"
                                   - - "Give me a summary of license analytics"
                                     - - "Which licenses are running low?"
                                       - - "What's my license utilization rate?"
                                        
                                         - ## Troubleshooting
                                        
                                         - ### Authentication Failed
                                         - - Verify your OpenLM credentials are correct
                                           - - Check if your account is active on the OpenLM platform
                                             - - Try logging in directly at https://www.openlm.com to confirm access
                                              
                                               - ### Permission Denied
                                               - - Ensure you granted all required permissions during authentication
                                                 - - Re-authenticate by removing and re-adding the connector
                                                  
                                                   - ### No Data Appearing
                                                   - - Verify the connector shows "Connected" status
                                                     - - Check that your OpenLM account has active licenses
                                                       - - Contact OpenLM support if issues persist
                                                        
                                                         - ## Support
                                                        
                                                         - For additional help:
                                                         - - Visit OpenLM documentation: https://www.openlm.com/docs/mcp-server
                                                           - - Contact OpenLM support: support@openlm.com
                                                             - - Check the MCP Server repository: https://openlm.visualstudio.com/OpenLM/_git/OpenlmAIReporting
                                                              
                                                               - ## Security & Privacy
                                                              
                                                               - - All authentication happens through secure OAuth 2.0
                                                                 - - Your credentials are never stored in Claude
                                                                   - - Data access is limited to read-only operations
                                                                     - - OpenLM maintains SOC 2 compliance for data security
                                                                      
                                                                       - ---

                                                                       **Version:** 0.1.0
                                                                       **Last Updated:** August 2026
                                                                       **Protocol:** Model Context Protocol (MCP)
