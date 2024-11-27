from typing import List, Optional
from pydantic import BaseModel
from github import Github
from github.Issue import Issue as GithubIssue

class IssueCreate(BaseModel):
    title: str
    body: Optional[str] = None
    labels: Optional[List[str]] = None
    assignees: Optional[List[str]] = None

class IssueUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    state: Optional[str] = None
    labels: Optional[List[str]] = None
    assignees: Optional[List[str]] = None

class Issue(BaseModel):
    number: int
    title: str
    body: Optional[str]
    state: str
    labels: List[str]
    assignees: List[str]

    @classmethod
    def from_github_issue(cls, issue: GithubIssue) -> 'Issue':
        return cls(
            number=issue.number,
            title=issue.title,
            body=issue.body,
            state=issue.state,
            labels=[label.name for label in issue.labels],
            assignees=[assignee.login for assignee in issue.assignees]
        )

class IssueService:
    def __init__(self, github_client: Github):
        self.github = github_client

    def get_issues(self, owner: str, repo: str, state: str = 'all') -> List[Issue]:
        repo = self.github.get_repo(f"{owner}/{repo}")
        issues = repo.get_issues(state=state)
        return [Issue.from_github_issue(issue) for issue in issues]

    def get_issue(self, owner: str, repo: str, number: int) -> Issue:
        repo = self.github.get_repo(f"{owner}/{repo}")
        issue = repo.get_issue(number)
        return Issue.from_github_issue(issue)

    def create_issue(self, owner: str, repo: str, issue_data: IssueCreate) -> Issue:
        repo = self.github.get_repo(f"{owner}/{repo}")
        issue = repo.create_issue(
            title=issue_data.title,
            body=issue_data.body,
            labels=issue_data.labels,
            assignees=issue_data.assignees
        )
        return Issue.from_github_issue(issue)

    def update_issue(self, owner: str, repo: str, number: int, issue_data: IssueUpdate) -> Issue:
        repo = self.github.get_repo(f"{owner}/{repo}")
        issue = repo.get_issue(number)

        update_data = {}
        if issue_data.title is not None:
            update_data['title'] = issue_data.title
        if issue_data.body is not None:
            update_data['body'] = issue_data.body
        if issue_data.state is not None:
            if issue_data.state == 'closed':
                issue.edit(state='closed')
            else:
                issue.edit(state='open')
        if issue_data.labels is not None:
            issue.edit(labels=issue_data.labels)
        if issue_data.assignees is not None:
            issue.edit(assignees=issue_data.assignees)

        if update_data:
            issue.edit(**update_data)

        return Issue.from_github_issue(issue)
