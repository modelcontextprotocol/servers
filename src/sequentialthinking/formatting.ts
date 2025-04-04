/**
 * Formatting Utilities for Sequential Thinking Server Console Output
 */
import { ThoughtData } from './types.js';
import chalk, { ChalkInstance } from 'chalk'; // Import chalk correctly

/**
 * Formats a ThoughtData object into a styled string for console logging.
 * @param thoughtData The thought data to format.
 * @returns A formatted string.
 */
export function formatThoughtForConsole(thoughtData: ThoughtData): string {
  const { 
    thoughtNumber, 
    totalThoughts, 
    thought, 
    isRevision, 
    revisesThought, 
    branchFromThought, 
    branchId,
    isChainOfThought,
    isHypothesis,
    isVerification,
    chainOfThoughtStep,
    totalChainOfThoughtSteps,
    confidenceLevel,
    hypothesisId,
    mergeBranchId,
    mergeBranchPoint,
    validationStatus,
    validationReason
  } = thoughtData;

  let prefix = '';
  let context = '';
  let additionalInfo = '';

  if (isChainOfThought) {
    if (isHypothesis) {
      prefix = chalk.magenta('🧠 Hypothesis');
      context = chainOfThoughtStep && totalChainOfThoughtSteps 
        ? ` (CoT step ${chainOfThoughtStep}/${totalChainOfThoughtSteps})` 
        : '';
      if (confidenceLevel !== undefined) {
        additionalInfo += `\n│ Confidence: ${confidenceLevel}% │`;
      }
      if (hypothesisId) {
        additionalInfo += `\n│ Hypothesis ID: ${hypothesisId} │`;
      }
    } else if (isVerification) {
      prefix = chalk.cyan('✓ Verification');
      context = chainOfThoughtStep && totalChainOfThoughtSteps 
        ? ` (CoT step ${chainOfThoughtStep}/${totalChainOfThoughtSteps})` 
        : '';
      if (validationStatus) {
        const statusColor = 
          validationStatus === 'valid' ? chalk.green :
          validationStatus === 'invalid' ? chalk.red :
          chalk.yellow;
        additionalInfo += `\n│ Status: ${statusColor(validationStatus)} │`;
        if (validationReason) {
          additionalInfo += `\n│ Reason: ${validationReason} │`;
        }
      }
    } else {
      prefix = chalk.magenta('🔗 Chain of Thought');
      context = chainOfThoughtStep && totalChainOfThoughtSteps 
        ? ` (step ${chainOfThoughtStep}/${totalChainOfThoughtSteps})` 
        : '';
    }
  } else if (isRevision) {
    prefix = chalk.yellow('🔄 Revision');
    context = ` (revising thought ${revisesThought})`;
  } else if (branchFromThought) {
    prefix = chalk.green('🌿 Branch');
    context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    if (mergeBranchId && mergeBranchPoint) {
      additionalInfo += `\n│ Merged with branch ${mergeBranchId} at point ${mergeBranchPoint} │`;
    }
  } else {
    prefix = chalk.blue('💭 Thought');
    context = '';
  }

  // Ensure thought is a string before calculating length
  const thoughtText = thought || ''; 
  const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
  // Calculate border length based on the longest line (header, thought text, or additional info lines)
  const additionalInfoLines = additionalInfo.split('\n').filter(line => line.trim() !== '');
  const maxInfoLineLength = additionalInfoLines.reduce((max, line) => Math.max(max, line.length), 0);
  const borderLength = Math.max(header.length, thoughtText.length, maxInfoLineLength) + 4;
  const border = '─'.repeat(borderLength);

  // Pad thought text and additional info lines to match border length
  const paddedThought = thoughtText.padEnd(borderLength - 2);
  const paddedInfo = additionalInfoLines.map(line => `│ ${line.padEnd(borderLength - 4)} │`).join('\n');

  return `
┌${border}┐
│ ${header.padEnd(borderLength - 2)} │
├${border}┤
│ ${paddedThought} │${paddedInfo ? '\n' + paddedInfo : ''}
└${border}┘`;
}
