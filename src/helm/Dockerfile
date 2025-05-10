FROM python:3.10-slim

# Install Helm and required dependencies
RUN apt-get update && \
    apt-get install -y curl apt-transport-https gnupg2 && \
    curl https://baltocdn.com/helm/signing.asc | apt-key add - && \
    echo "deb https://baltocdn.com/helm/stable/debian/ all main" | tee /etc/apt/sources.list.d/helm-stable-debian.list && \
    apt-get update && \
    apt-get install -y helm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set up work directory
WORKDIR /app

# Install MCP package
RUN pip install --no-cache-dir mcp>=0.1.0

# Copy the MCP server code
COPY ./src/mcp_server_helm/server.py .

# Set the entrypoint to run the server directly
ENTRYPOINT ["python", "/app/server.py"]