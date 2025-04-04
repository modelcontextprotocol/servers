import { ThoughtData, OptimizedPrompt, ExtendedThoughtData } from './types.js';

// Token estimation function (can be used internally or exported if needed elsewhere)
function estimateTokens(text: string): number {
  // Extremely simple token estimation: return character count divided by 4
  const chars = text ? text.length : 0;
  return Math.max(1, Math.ceil(chars / 4));
}

/**
 * Generates structured analysis details based on thought, optimized prompt, and LLM analysis.
 * @param thought The processed thought data (ExtendedThoughtData).
 * @param optimizedPrompt The optimized prompt object, containing original/optimized text and stats.
 * @param claudeAnalysis The final analysis text from the Claude LLM.
 * @returns An object containing key points, Claude's analysis, and metrics.
 */
export function generateAnalysisDetails(
  thought: ExtendedThoughtData, 
  optimizedPrompt: OptimizedPrompt | undefined, 
  claudeAnalysis: string
): { 
  keyPoints: string; 
  claudeAnalysis: string; 
  metrics: { 
    originalTokens: number; 
    optimizedTokens: number; 
    compressionRatio: string; 
  } 
} {
  // Use the original thought text for Key Points
  const keyPoints = thought.thought; 
  // Use internal estimateTokens for consistency if optimizedPrompt is missing
  const originalTokens = optimizedPrompt ? optimizedPrompt.compressionStats.originalTokens : estimateTokens(thought.thought);
  const optimizedTokens = optimizedPrompt ? optimizedPrompt.compressionStats.optimizedTokens : estimateTokens(thought.thought); 
  const compressionRatio = optimizedPrompt ? (optimizedPrompt.compressionStats.compressionRatio).toFixed(1) : "0";

  return {
    keyPoints: keyPoints,
    claudeAnalysis: claudeAnalysis, // Raw analysis from Claude
    metrics: {
      originalTokens: originalTokens,
      optimizedTokens: optimizedTokens, // This represents the tokens for the *optimized* prompt sent to Gemini
      compressionRatio: `${compressionRatio}%`
    }
  };
}

// Export estimateTokens if it needs to be used directly elsewhere, otherwise keep it internal.
// For now, keeping it internal as it's only used by generateAnalysisDetails here.
// export { estimateTokens };
