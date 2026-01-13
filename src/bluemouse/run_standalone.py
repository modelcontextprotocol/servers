# Copyright (C) 2026 BlueMouse Project
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import os
import sys
import asyncio
import uuid
import json

import uvicorn
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from typing import Dict, List, Any, Optional


# Import the Original MCP Server
try:
    from server import mcp
    print("✅ Loaded BlueMouse MCP Server")
except ImportError as e:
    print(f"❌ MCP Server import error: {e}")
    mcp = None

# Import Core Logic Modules
try:
    from socratic_generator import generate_socratic_questions
    from code_generator import generate_code
    from project_exporter import export_project
except ImportError as e:
    print(f"❌ Core module import error: {e}")
    generate_socratic_questions = None
    generate_code = None
    export_project = None

# 1. Initialize FastAPI App
app = FastAPI(title="BlueMouse Hybrid Server (MCP + REST)")

# 2. Config CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local file access and external agents
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Define Request Models
class SocraticRequest(BaseModel):
    requirement: str
    language: str = "zh-TW"
    api_key: Optional[str] = None

class CodeGenRequest(BaseModel):
    module: Dict[str, Any]
    answers: Dict[str, Any]
    framework: str = "django"

class ExportRequest(BaseModel):
    blueprint: Dict[str, Any]
    code: Dict[str, Any]
    diagrams: Optional[Dict[str, Any]] = {}
    estimation: Optional[Dict[str, Any]] = {}

# 4. Define REST Endpoints (for Web UI)

@app.get("/health")
async def health_check():
    """Health check endpoint for UI."""
    return {
        "status": "healthy", 
        "version": "v6.1-hybrid",
        "mcp_mounted": mcp is not None
    }

@app.post("/api/generate_socratic_questions")
async def api_generate_socratic_questions(req: SocraticRequest):
    """Proxy to Socratic Generator."""
    print(f"🔍 Socratic Request: lang={req.language}, req={req.requirement[:20]}...")
    if not generate_socratic_questions:
        raise HTTPException(status_code=500, detail="Socratic generator module missing")
    
    try:
        result = await generate_socratic_questions(req.requirement, req.language, req.api_key)
        print(f"✅ Socratic Result: {json.dumps(result, ensure_ascii=False)[:100]}...")
        return {"success": True, "questions": result.get("questions", [])}
    except Exception as e:
        print(f"❌ Error generating questions: {e}")
        return JSONResponse(
            status_code=500, 
            content={"success": False, "error": str(e)}
        )

@app.post("/api/generate_code")
async def api_generate_code(req: CodeGenRequest):
    """Proxy to Code Generator."""
    if not generate_code:
        raise HTTPException(status_code=500, detail="Code generator module missing")

    try:
        # Pass empty list for answers as demo logic largely ignores it or handles it internally
        result = generate_code(req.module, [], req.framework)
        return {"success": True, "code": result}
    except Exception as e:
        print(f"Error generating code: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

@app.post("/api/export_project")
async def api_export_project(req: ExportRequest):
    """Proxy to Project Exporter."""
    if not export_project:
        raise HTTPException(status_code=500, detail="Project exporter module missing")
        
    try:
        project_data = {
            "name": req.blueprint.get("title", "Project"),
            "code": req.code,
            "diagrams": [],
            "cost": req.estimation
        }
        zip_bytes = export_project(project_data)
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=project.zip"}
        )
    except Exception as e:
        print(f"Error exporting project: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

# 5. Mount MCP Server (for Agents)
if mcp:
    try:
        # Mount FastMCP onto the FastAPI app
        # This typically adds /sse and /messages endpoints
        mcp.mount(app)
        print("✅ MCP Server mounted successfully")
    except Exception as e:
        print(f"❌ Failed to mount MCP server: {e}")

if __name__ == "__main__":
    print("🚀 Starting BlueMouse Hybrid Server (MCP + REST)...")
    print("👉 UI Bridge: http://localhost:8001/api/...")
    print("👉 MCP Endpoint: http://localhost:8001/sse")
    uvicorn.run(app, host="0.0.0.0", port=8001)
