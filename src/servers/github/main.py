from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends
from github import Github
from .issues import IssueService, Issue, IssueCreate, IssueUpdate

app = FastAPI()

def get_github_client():
    # Update this to use your preferred authentication method
    return Github("your-token-here")

def get_issue_service(github_client: Github = Depends(get_github_client)):
    return IssueService(github_client)

@app.get("/repos/{owner}/{repo}/issues", response_model=List[Issue])
async def list_issues(
    owner: str,
    repo: str,
    state: str = 'all',
    issue_service: IssueService = Depends(get_issue_service)
):
    try:
        return issue_service.get_issues(owner, repo, state)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/repos/{owner}/{repo}/issues/{number}", response_model=Issue)
async def get_issue(
    owner: str,
    repo: str,
    number: int,
    issue_service: IssueService = Depends(get_issue_service)
):
    try:
        return issue_service.get_issue(owner, repo, number)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/repos/{owner}/{repo}/issues", response_model=Issue)
async def create_issue(
    owner: str,
    repo: str,
    issue_data: IssueCreate,
    issue_service: IssueService = Depends(get_issue_service)
):
    try:
        return issue_service.create_issue(owner, repo, issue_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.patch("/repos/{owner}/{repo}/issues/{number}", response_model=Issue)
async def update_issue(
    owner: str,
    repo: str,
    number: int,
    issue_data: IssueUpdate,
    issue_service: IssueService = Depends(get_issue_service)
):
    try:
        return issue_service.update_issue(owner, repo, number, issue_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
