import pytest
from unittest.mock import Mock, MagicMock
from src.servers.github.issues import IssueService, Issue, IssueCreate, IssueUpdate

@pytest.fixture
def mock_github_client():
    return Mock()

@pytest.fixture
def mock_repo():
    repo = Mock()
    repo.get_issues = MagicMock(return_value=[])
    return repo

@pytest.fixture
def issue_service(mock_github_client):
    return IssueService(mock_github_client)

def test_get_issues(issue_service, mock_github_client, mock_repo):
    mock_github_client.get_repo.return_value = mock_repo
    mock_issue = Mock(
        number=1,
        title="Test Issue",
        body="Test Body",
        state="open",
        labels=[Mock(name="bug")],
        assignees=[Mock(login="user1")]
    )
    mock_repo.get_issues.return_value = [mock_issue]

    issues = issue_service.get_issues("owner", "repo")
    assert len(issues) == 1
    assert issues[0].number == 1
    assert issues[0].title == "Test Issue"

def test_create_issue(issue_service, mock_github_client, mock_repo):
    mock_github_client.get_repo.return_value = mock_repo
    mock_issue = Mock(
        number=1,
        title="New Issue",
        body="New Body",
        state="open",
        labels=[],
        assignees=[]
    )
    mock_repo.create_issue.return_value = mock_issue

    issue_data = IssueCreate(title="New Issue", body="New Body")
    issue = issue_service.create_issue("owner", "repo", issue_data)
    
    assert issue.title == "New Issue"
    assert issue.body == "New Body"

def test_update_issue(issue_service, mock_github_client, mock_repo):
    mock_github_client.get_repo.return_value = mock_repo
    mock_issue = Mock(
        number=1,
        title="Old Title",
        body="Old Body",
        state="open",
        labels=[],
        assignees=[],
        edit=MagicMock()
    )
    mock_repo.get_issue.return_value = mock_issue

    issue_data = IssueUpdate(title="Updated Title")
    issue_service.update_issue("owner", "repo", 1, issue_data)
    
    mock_issue.edit.assert_called_with(title="Updated Title")
