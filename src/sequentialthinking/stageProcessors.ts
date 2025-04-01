import { ProcessingStage, ThoughtProcessingState, WorkingMemoryItem } from './types.js';
import { retrieveRelevantMemory } from './workingMemory.js';
import { decompressContent } from './utils.js'; // Import decompress

// Simple stop words set (consider centralizing)
const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'in', 'on', 'for', 'with', 'of', 'and', 'or', 'it', 'this', 'that', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'hers', 'its', 'our', 'their', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'any', 'as', 'at', 'because', 'before', 'below', 'between', 'both', 'but', 'by', 'down', 'during', 'each', 'few', 'from', 'further', 'here', 'how', 'if', 'into', 'just', 'like', 'more', 'most', 'no', 'nor', 'not', 'now', 'only', 'other', 'out', 'over', 'own', 'same', 'so', 'some', 'such', 'than', 'then', 'there', 'these', 'those', 'through', 'under', 'until', 'up', 'very', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', '', 'input', 'output', 'thought', 'analysis', 'synthesis', 'evaluation', 'context', 'memory', 'task', 'results', 'scores', 'prompt', 'objective', 'provide', 'based', 'following', 'considering', 'none', 'available', 'stage', 'step', 'cycle', 'final', 'original', 'key', 'point', 'points', 'details', 'information']);

/**
 * Extracts keywords from text.
 */
function extractKeywords(text: string, limit: number = 7): string {
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const keywords = words.filter(kw => !STOP_WORDS.has(kw)).slice(0, limit);
    return keywords.join(' ');
}


/**
 * Helper function to format relevant memory items for inclusion in prompts.
 * Attempts to decompress content, falling back to summary if needed.
 */
async function formatMemoryContext(relevantMemory: WorkingMemoryItem[]): Promise<string> {
    if (!relevantMemory || relevantMemory.length === 0) {
        return '  None available.';
    }

    const formattedItems = await Promise.all(
        relevantMemory.map(async (item, idx) => {
            let contentToShow = item.content; // Default to summary
            let contentType = 'Summary';
            if (item.compressedContent) {
                try {
                    contentToShow = await decompressContent(item.compressedContent);
                    contentType = 'Full Content';
                } catch (e) {
                    console.error(`Failed to decompress memory item ${item.id} for prompt, using summary. Error: ${e}`);
                    // Fallback to summary already set
                }
            }
            // Basic truncation for prompt safety, but much larger than before
            const truncatedContent = contentToShow.length > 1500 ? contentToShow.substring(0, 1500) + '... [truncated]' : contentToShow;
            return `  [Memory ${idx + 1} - ${item.metadata.stage} (${contentType})]: ${truncatedContent}`;
        })
    );

    return formattedItems.join('\n');
}


/**
 * Determines the current processing stage.
 */
export function determineProcessingStage(
  input: string,
  state: ThoughtProcessingState
): ProcessingStage {
  const lowerInput = input.toLowerCase();
  const thoughtNumber = state.currentThoughtNumber;

  // Keyword-based stage determination
  if (lowerInput.includes('evaluate') || lowerInput.includes('conclude') || lowerInput.includes('summarize') || lowerInput.includes('assess')) {
    return ProcessingStage.EVALUATION;
  }
  if (lowerInput.includes('synthesize') || lowerInput.includes('combine') || lowerInput.includes('integrate') || lowerInput.includes('formulate')) {
    return ProcessingStage.SYNTHESIS;
  }
  if (lowerInput.includes('analyze') || lowerInput.includes('examine') || lowerInput.includes('compare') || lowerInput.includes('investigate')) {
    return ProcessingStage.ANALYSIS;
  }
  if (lowerInput.includes('prepare') || lowerInput.includes('setup') || lowerInput.includes('context') || lowerInput.includes('gather')) {
    return ProcessingStage.PREPARATION;
  }

  // Contextual logic based on thought number
  if (thoughtNumber <= 1) {
    return ProcessingStage.PREPARATION;
  } else if (thoughtNumber % 3 === 0) {
    return ProcessingStage.EVALUATION;
  } else if (thoughtNumber % 3 === 2) {
    return ProcessingStage.SYNTHESIS;
  } else {
    return ProcessingStage.ANALYSIS;
  }
}

/**
 * PREPARATION Stage: Generates the prompt for the ANALYSIS LLM call.
 */
export async function processPreparationStage(
  input: string,
  state: ThoughtProcessingState
): Promise<string> {
  console.log(`Stage: ${ProcessingStage.PREPARATION} (Thought ${state.currentThoughtNumber})`);
  // Use the full input thought as the query for retrieving relevant memory
  const retrievalQuery = input;
  console.log(`Retrieval Query (Preparation): "${retrievalQuery.substring(0, 100)}..."`);
  const relevantMemory = await retrieveRelevantMemory(state, retrievalQuery, 3);
  const memoryContext = await formatMemoryContext(relevantMemory); // Use helper

  const analysisPrompt = `
Objective: Analyze the following input thoroughly, considering the provided context from previous thoughts.

Input Thought (${state.currentThoughtNumber}):
"${input}"

Relevant Context from Working Memory:
${memoryContext}

Analysis Task:
1. Identify the core subject and intent of the input thought.
2. Extract key entities, concepts, and relationships mentioned.
3. Compare the input thought with the retrieved context. Note any consistencies, contradictions, or new information.
4. Identify potential ambiguities or areas needing clarification.
5. Formulate 2-3 key analytical points or questions based on this analysis.

Provide the output strictly as "Analysis Results: [Your detailed analysis covering points 1-5]".
  `.trim();

  return analysisPrompt;
}

/**
 * ANALYSIS Stage: Takes LLM analysis output, generates the prompt for the SYNTHESIS LLM call.
 */
export async function processAnalysisStage(
  analysisOutput: string, // Actual LLM output from the analysis prompt
  state: ThoughtProcessingState
): Promise<string> {
  console.log(`Stage: ${ProcessingStage.ANALYSIS} (Thought ${state.currentThoughtNumber})`);
  // Clean up the analysis output first
  const cleanedAnalysis = analysisOutput.replace(/^Analysis Results:\s*/i, '').trim();
  // Use the cleaned analysis output as the query for retrieving relevant memory
  const retrievalQuery = cleanedAnalysis;
  console.log(`Retrieval Query (Analysis): "${retrievalQuery.substring(0, 100)}..."`);
  const relevantMemory = await retrieveRelevantMemory(state, retrievalQuery, 4);
  const memoryContext = await formatMemoryContext(relevantMemory); // Use helper

  // Use the already cleaned analysis output for the prompt
  // const cleanedAnalysis = analysisOutput.replace(/^Analysis Results:\s*/i, '').trim(); // Removed duplicate declaration

  const synthesisPrompt = `
Objective: Synthesize the provided analysis results into a coherent next thought or conclusion, incorporating relevant context.

Analysis Results:
"${cleanedAnalysis}"

Additional Relevant Context from Working Memory:
${memoryContext}

Synthesis Task:
1. Summarize the key findings from the analysis.
2. Integrate these findings with the additional context. Resolve contradictions or highlight tensions if necessary.
3. Formulate a single, concise, and actionable synthesized thought. This could be a refined understanding, a next step, a hypothesis, or a question.
4. Ensure the synthesized thought logically follows from the analysis and context.

Provide the output strictly as "Synthesized Thought: [Your single, concise synthesized thought]".
  `.trim();

  return synthesisPrompt;
}

/**
 * SYNTHESIS Stage: Takes LLM synthesized thought, generates the prompt for the EVALUATION LLM call.
 */
export async function processSynthesisStage(
  synthesizedThought: string, // Actual LLM output from the synthesis prompt
  state: ThoughtProcessingState
): Promise<string> {
  console.log(`Stage: ${ProcessingStage.SYNTHESIS} (Thought ${state.currentThoughtNumber})`);
  // Clean up the synthesized thought first
  const cleanedSynthesizedThought = synthesizedThought.replace(/^Synthesized Thought:\s*/i, '').trim();
  // Use the cleaned synthesized thought as the query for retrieving relevant memory
  const retrievalQuery = cleanedSynthesizedThought;
   console.log(`Retrieval Query (Synthesis): "${retrievalQuery.substring(0, 100)}..."`);
  const relevantMemory = await retrieveRelevantMemory(state, retrievalQuery, 3);
  const memoryContext = await formatMemoryContext(relevantMemory); // Use helper

  // Use the already cleaned synthesized thought for the prompt
  const evaluationPrompt = `
Objective: Critically evaluate the provided synthesized thought for coherence, relevance, and potential impact, considering the context.

Synthesized Thought:
"${cleanedSynthesizedThought}"

Relevant Context from Working Memory (for evaluation reference):
${memoryContext}

Evaluation Task:
1. Assess the Coherence: Is the thought logically sound and well-formed? (Score 1-5)
2. Assess the Relevance: Does the thought directly address the preceding analysis/context? (Score 1-5)
3. Assess the Novelty/Insight: Does the thought offer new perspective or simply restate? (Score 1-5)
4. Assess the Actionability/Potential: Does the thought lead to a clear next step or useful conclusion? (Score 1-5)
5. Provide a brief justification for each score (1-2 sentences per score).
6. Suggest one specific, concrete refinement to improve the synthesized thought, if applicable. If no refinement is needed, state 'None'.

Provide the output strictly in the format:
"Evaluation Scores: Coherence=[1-5], Relevance=[1-5], Novelty=[1-5], Actionability=[1-5]
Justification: [Brief text justifying scores]
Refinement Suggestion: [Specific suggestion or 'None']"
  `.trim();

  return evaluationPrompt;
}

/**
 * EVALUATION Stage: Processes the LLM's evaluation output to determine the final thought content for this cycle.
 */
export function processEvaluationStage(
  evaluationOutput: string, // Actual LLM output from the evaluation prompt
  state: ThoughtProcessingState,
  originalSynthesizedThought: string // The thought that was evaluated by the LLM
): string {
  console.log(`Stage: ${ProcessingStage.EVALUATION} (Thought ${state.currentThoughtNumber})`);

  // Parse the structured evaluation output from the LLM
  const scoresMatch = evaluationOutput.match(/Coherence=\[(\d)\].*Relevance=\[(\d)\].*Novelty=\[(\d)\].*Actionability=\[(\d)\]/i);
  const justificationMatch = evaluationOutput.match(/Justification:\s*([\s\S]*?)Refinement Suggestion:/im); // Capture multi-line justification
  const refinementMatch = evaluationOutput.match(/Refinement Suggestion:\s*(.*)/im);

  const scores = scoresMatch ? `Coherence=${scoresMatch[1]}, Relevance=${scoresMatch[2]}, Novelty=${scoresMatch[3]}, Actionability=${scoresMatch[4]}` : "Scores not parsed";
  const justification = justificationMatch ? justificationMatch[1].trim() : "Justification not parsed";
  const refinement = refinementMatch ? refinementMatch[1].trim() : "Refinement not parsed";

  console.log(`Evaluation Parsed: Scores='${scores}', Justification='${justification.substring(0,50)}...', Refinement='${refinement}'`);

  // Determine the final thought content based on evaluation
  let finalThought = originalSynthesizedThought.replace(/^Synthesized Thought:\s*/i, '').trim(); // Start with the cleaned original synthesis

  // Apply refinement only if it's provided, not 'None', and seems substantial
  if (refinement && refinement.toLowerCase() !== 'none' && refinement.length > 5) {
      console.log("Applying refinement suggestion from evaluation.");
      finalThought = refinement; // Use the LLM's refinement suggestion
  } else {
      console.log("No significant refinement suggested or refinement was 'None'. Using original synthesized thought.");
  }

  // The content returned here is what gets stored in working memory for the *next* thought cycle
  return finalThought;
}
