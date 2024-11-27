package github

import (
	"context"
	"fmt"
	"github.com/google/go-github/v60/github"
	"golang.org/x/oauth2"
)

type Server struct {
	client *github.Client
}

func NewServer(token string) *Server {
	ctx := context.Background()
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	tc := oauth2.NewClient(ctx, ts)
	client := github.NewClient(tc)
	return &Server{client: client}
}

func (s *Server) MergePullRequest(ctx context.Context, owner string, repo string, number int, commitTitle string, commitMessage string) error {
	opts := &github.PullRequestOptions{
		CommitTitle: commitTitle,
		MergeMethod: "merge",
	}
	
	_, _, err := s.client.PullRequests.Merge(ctx, owner, repo, number, commitMessage, opts)
	if err != nil {
		return fmt.Errorf("failed to merge pull request: %v", err)
	}
	
	return nil
}