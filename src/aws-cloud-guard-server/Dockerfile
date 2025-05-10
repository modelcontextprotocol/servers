FROM python:3.12-slim

WORKDIR /app

# Install astral uv for Python dependencies
RUN pip install uv

# Copy project files
COPY pyproject.toml .
COPY globals.py .
COPY server_scripts/ server_scripts/

# Install dependencies using uv
RUN uv pip install --no-cache --system -e .

# Add AWS configuration directory
RUN mkdir -p /root/.aws

# Expose port for SSE transport (if needed later)
EXPOSE 8000

# Entry point with selectable server script
ENTRYPOINT ["python"]
