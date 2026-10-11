# Hybrid Math Solver - MCP Server

Fixes Claude's math hallucination. Stops averaging inconsistent linear systems.

## The Problem it Solves
When Claude sees:
A = [[1,0],[1,0]], b = [1,2] -> x=1 and x=2
Claude hallucinates x=1.5 (average)

Truth: A·x - b = [0, -1] != 0 -> No solution.

## What this server does
1. Verification: Checks A·x - b = 0 for every solution
2. Inconsistency detection: Rejects fake averages
3. Hybrid solving: Deterministic + AI verification

## Features
- 100/100 tests passed
- MCP compatible with Claude Desktop
- Fixes x=1, x=2 -> 1.5 bug

## Author
Faissal Ait Jana - TU Delft
GitHub: https://github.com/ObitoUchiha30/Hybrid-Math-Solver-V3
