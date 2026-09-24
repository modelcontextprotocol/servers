# Demos

Some sample usage scenarios are shown below:

## This Demo is using two Mikrotik routers 

The system report for the MikroTik router at 172.29.160.1 (connected via tunnel) has been generated. This device is a hAP ac².

### 🚀 System Resources
- Model: hAP ac² (RBD52G-5HacD2HnD)
- Uptime: 1 week, 6 days, 23 hours.
RouterOS Version: 6.49.19 (stable).
- CPU: ARMv7 (4 cores) @ 716MHz.
- CPU Load: 0% (Idle/Minimum load).
- Memory: 74.2 MB free out of 128 MB total.
- Firmware: Current is 6.49.7, but there is an upgrade available to 6.49.19.

### 🌡️ Health & Storage
- Bad Blocks: 0.
- HDD Space: 1.8 MB free out of 16 MB.

### 🌐 Network Traffic Snapshot
- Interface	RX Rate	TX Rate	Status
- ether1 (WAN)	23.7 kbps	159.4 kbps	Running
- bridge	50.8 kbps	164.3 kbps	Running
- wlan4	0 bps	3.9 kbps	Running
- pptp-exactas	0 bps	0 bps	Connected/Idle

### 🔍 Observation
The router is operating very comfortably with 0% CPU load.
Firmware Update: You are running an older firmware (6.49.7) than the installed RouterOS version (6.49.19). You might want to consider running /system routerboard upgrade to synchronize them.
Storage: The 16MB flash is quite tight (1.8MB free). Avoid saving large log files or files on this device.

The system report for the MikroTik router 10.1.1.1 (CCR1009-7G-1C-1S+) has been generated. Here are the key performance and health metrics:

### 🚀 System Resources
- Uptime: 20 hours, 36 minutes.
- RouterOS Version: 6.49.19 (long-term).
- CPU: TileGx (9 cores) @ 1200MHz.
- CPU Load: 1% (Idle/Low load).
- Memory: 1.8 GB free out of 2 GB total.
- HDD Space: 81.4 MB free out of 134.2 MB.

### 🌡️ Health & Power
- Temperatures: Chassis 31°C / CPU 55°C.
- Power Redundancy: Both PSU1 and PSU2 are in OK state.
- Voltage: 24V.
- Power Consumption: 24.2W.
- Fan Speed: 5405 RPM (Active).

### 🌐 Network Traffic (Current Snapshot)
- Interface	RX Rate	TX Rate	Status
- sfpplus1	160.9 Mbps	5.8 Mbps	Running
- bridge2	7.6 Mbps	160.7 Mbps	Running
- bridge1	4.3 Mbps	6.9 Mbps	Running
- ether1-ether7	0 bps	0 bps	Not Running

### 🔍 Observation
The router is in excellent health with very low CPU utilization despite handling approximately 160 Mbps of traffic on sfpplus1 and bridge2.
Power redundancy is confirmed as both PSUs are operational.
The system is running a stable (long-term) version of RouterOS.

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your `claude_desktop_config.json`:

### Docker

* when running docker on macOS, use `host.docker.internal` if the server is running on the host network (eg localhost)
* Credentials are passed via environment variables `MK_USER` and `MK_PASSWORD`

```json
{
  "mcpServers": {
    "mikrotik": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "-e",
        "MK_USER=ai_agent",
        "-e",
        "MK_PASSWORD=ai_password",
        "mochoa/mcp-mikrotik", 
        "host.docker.internal"]
    }
  }
}
```

Note: Due Docker Desktop can not route to Mikrotik router 172.29.160.1, we use `host.docker.internal` to connect to the router using socat forwarding. For example:

```sh
socat TCP-LISTEN:8721,fork TCP:172.29.160.1:8721
```

### NPX

```json
{
  "mcpServers": {
    "mikrotik": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-mikrotik",
        "172.29.160.1"
      ],
      "env": {
        "MK_USER": "ai_agent",
        "MK_PASSWORD": "ai_password"
      }
    }
  }
}
```

### Demo Prompts

Sample prompts using above routers.

- mk-connect 172.29.160.1 ai_agent ai_password false
- mk-get system/resource
- mk-awr
- using information extracted from mikrotik routers 10.1.1.1 and 172.29.160.1 make a plan to migrate site-site actual VPN connection using pptp to a more secure implementation L2TP/IPsec, do an step by step implementation for the server running at 10.1.1.1 and a client in 172.29.160.1

Based on the AWR reports and log data extracted from both routers (CCR1009 and hAP ac²), I have designed a migration plan to replace the insecure PPTP tunnel with a hardware-accelerated L2TP/IPsec site-to-site VPN.

#### 📋 Migration Strategy
- Infrastructure: Both routers support hardware encryption (TileGx on CCR and IPQ4000 on hAP ac²), so IPsec will run with minimal CPU impact.
- Security: We will use AES-256-CBC with SHA256 for the IPsec phase 2 proposal.
- Method: High-availability "Dual Stack" migration — we will keep PPTP running on a different port/id while we test L2TP, then disable PPTP once confirmed.

#### 🛠️ Step 1: Server Configuration (Router 10.1.1.1 - mk-gw2)
Run these commands on the CCR1009:

```bash
# 1. Create a specific Pool for the VPN clients
/ip pool add name=vpn-pool-l2tp ranges=10.1.252.10-10.1.252.20
# 2. Create the PPP Profile with strong encryption
/ppp profile add name=profile-l2tp-secure local-address=10.1.252.1 \
    remote-address=vpn-pool-l2tp use-encryption=yes dns-server=10.1.1.1
# 3. Create the user secret (migrating user 'mochoa')
/ppp secret add name=mochoa password=STonG_PaSSwORD service=l2tp \
    profile=profile-l2tp-secure
# 4. Enable L2TP Server with IPsec
# Note: 'use-ipsec=yes' automatically creates the Phase 1/2 IPsec identities
/interface l2tp-server server set enabled=yes use-ipsec=yes \
    ipsec-secret=MyVerySecureSharedSecret default-profile=profile-l2tp-secure
# 5. Open Firewall for IPsec (UDP 500, 4500 and IP Protocol 50/ESP)
/ip firewall filter add action=accept chain=input protocol=udp dst-port=500,4500 \
    comment="VPN: IPsec IKE/NAT-T" place-before=0
/ip firewall filter add action=accept chain=input protocol=ipsec-esp \
    comment="VPN: IPsec ESP" place-before=0
/ip firewall filter add action=accept chain=input protocol=udp dst-port=1701 \
    comment="VPN: L2TP" place-before=0
```

#### 🛠️ Step 2: Client Configuration (Router 172.29.160.1 - hAP ac²)
Run these commands on the hAP ac²:

```bash
# 1. Create the L2TP Client
# Replace [PUBLIC_IP_SERVER] with the WAN IP of mk-gw2
/interface l2tp-client add name=vpn-to-hq connect-to=[PUBLIC_IP_SERVER] \
    user=mochoa password=STonG_PaSSwORD use-ipsec=yes \
    ipsec-secret=MyVerySecureSharedSecret disabled=no profile=default-encryption
# 2. Configure Site-to-Site Routing
# This allows 172.29.160.x to reach the 10.1.1.x network
/ip route add dst-address=10.1.0.0/16 gateway=vpn-to-hq
```

#### 🛠️ Step 3: Verify the Connection
Run these commands on both routers to verify the connection:

```bash
# On mk-gw2
/interface l2tp-server server print
/interface l2tp-server session print
/interface l2tp-server statistics print

# On hAP ac²
/interface l2tp-client print
/interface l2tp-client session print
/interface l2tp-client statistics print
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
    "mikrotik": {
      "command": "npx",
      "args": [
        "-y",
        "@marcelo-ochoa/server-mikrotik",
        "172.29.160.1"
      ],
      "env": {
        "MK_USER": "ai_agent",
        "MK_PASSWORD": "ai_password"
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

- mk-connect to 172.29.160.1 using ai_agent as user and ai_password as password using mikrotik mcp server
- mk-get system/resource
- mk-awr
- using information extracted from mikrotik routers 10.1.1.1 and 172.29.160.1 make a plan to migrate site-site actual VPN connection using pptp to a more secure implementation L2TP/IPsec, do an step by step implementation for the server running at 10.1.1.1 and a client in 172.29.160.1

## Using Antigravity Code Editor

Put this in `~/.gemini/antigravity/mcp_config.json`

```json
{
    "mcpServers": {
        "mikrotik": {
      "command": "docker",
      "args": [
        "run", 
        "-i", 
        "--rm", 
        "-e",
        "MK_USER=ai_agent",
        "-e",
        "MK_PASSWORD=ai_password",
        "mochoa/mcp-mikrotik", 
        "host.docker.internal"
      ]
    }
  }
```
