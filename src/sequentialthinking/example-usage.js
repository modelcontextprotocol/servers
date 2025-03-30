#!/usr/bin/env node

/**
 * Example usage of the Sequential Thinking server with Enhanced Features
 * 
 * This script demonstrates how to use the functionality
 * in the Sequential Thinking server. It shows how to:
 * 
 * 1. Use regular sequential thinking
 * 2. Use Chain of Thought reasoning
 * 3. Create a hypothesis with confidence level
 * 4. Create multiple hypotheses
 * 5. Verify a hypothesis
 * 6. Create and merge branches
 * 7. Use Chain of Thought validation
 * 
 * To run this example:
 * 1. Start the Sequential Thinking server
 * 2. Run this script with Node.js
 */

// Example of a regular sequential thought
const regularThought = {
  thought: "This is a regular sequential thought that breaks down a problem.",
  thoughtNumber: 1,
  totalThoughts: 8,
  nextThoughtNeeded: true
};

console.log("Regular Sequential Thought Example:");
console.log(JSON.stringify(regularThought, null, 2));
console.log("\n");

// Example of a Chain of Thought reasoning step
const chainOfThoughtStep = {
  thought: "This is a Chain of Thought reasoning step that explicitly follows a structured reasoning process.",
  thoughtNumber: 2,
  totalThoughts: 8,
  nextThoughtNeeded: true,
  isChainOfThought: true,
  chainOfThoughtStep: 1,
  totalChainOfThoughtSteps: 3
};

console.log("Chain of Thought Step Example:");
console.log(JSON.stringify(chainOfThoughtStep, null, 2));
console.log("\n");

// Example of a hypothesis in Chain of Thought with confidence level
const hypothesisStep = {
  thought: "Based on the previous reasoning, I hypothesize that the solution is X because of Y and Z.",
  thoughtNumber: 3,
  totalThoughts: 8,
  nextThoughtNeeded: true,
  isChainOfThought: true,
  isHypothesis: true,
  chainOfThoughtStep: 2,
  totalChainOfThoughtSteps: 3,
  confidenceLevel: 75,
  hypothesisId: "hypothesis-1"
};

console.log("Hypothesis Step with Confidence Level Example:");
console.log(JSON.stringify(hypothesisStep, null, 2));
console.log("\n");

// Example of an alternative hypothesis
const alternativeHypothesisStep = {
  thought: "Alternatively, I hypothesize that the solution could be A because of B and C.",
  thoughtNumber: 4,
  totalThoughts: 8,
  nextThoughtNeeded: true,
  isChainOfThought: true,
  isHypothesis: true,
  chainOfThoughtStep: 2,
  totalChainOfThoughtSteps: 3,
  confidenceLevel: 60,
  hypothesisId: "hypothesis-2"
};

console.log("Alternative Hypothesis Example:");
console.log(JSON.stringify(alternativeHypothesisStep, null, 2));
console.log("\n");

// Example of a verification in Chain of Thought with validation
const verificationStep = {
  thought: "To verify hypothesis-1, I'll check if conditions A, B, and C are met. A is true because... B is true because... C is true because... Therefore, my hypothesis is correct.",
  thoughtNumber: 5,
  totalThoughts: 8,
  nextThoughtNeeded: true,
  isChainOfThought: true,
  isVerification: true,
  chainOfThoughtStep: 3,
  totalChainOfThoughtSteps: 3,
  validationStatus: "valid",
  validationReason: "All conditions are met"
};

console.log("Verification Step with Validation Example:");
console.log(JSON.stringify(verificationStep, null, 2));
console.log("\n");

// Example of a branch
const branchThought = {
  thought: "Let's explore a different approach to this problem.",
  thoughtNumber: 6,
  totalThoughts: 8,
  nextThoughtNeeded: true,
  branchFromThought: 2,
  branchId: "branch-1"
};

console.log("Branch Example:");
console.log(JSON.stringify(branchThought, null, 2));
console.log("\n");

// Example of merging branches
const mergeBranchThought = {
  thought: "Both approaches lead to similar conclusions, so let's merge them.",
  thoughtNumber: 7,
  totalThoughts: 8,
  nextThoughtNeeded: true,
  branchId: "main",
  mergeBranchId: "branch-1",
  mergeBranchPoint: 5
};

console.log("Merge Branch Example:");
console.log(JSON.stringify(mergeBranchThought, null, 2));
console.log("\n");

// Example of a final conclusion
const conclusionThought = {
  thought: "After going through the Chain of Thought reasoning process and exploring multiple hypotheses, I can confidently conclude that the answer is X.",
  thoughtNumber: 8,
  totalThoughts: 8,
  nextThoughtNeeded: false
};

console.log("Conclusion Example:");
console.log(JSON.stringify(conclusionThought, null, 2));
