/**
 * AI Advisor for Sequential Thinking
 *
 * This module implements the AI Advisor component that analyzes thinking sessions
 * and provides guidance on next steps, helping the AI make decisions about
 * which thinking path to take.
 */
/**
 * AI Advisor class
 */
export class AIAdvisor {
    /**
     * Analyze a thinking session and provide guidance on next steps
     */
    analyzeSession(sessionData) {
        // Analyze the current state of the thinking session
        const thoughtHistory = sessionData.thoughtHistory;
        const branches = sessionData.branches;
        // Identify patterns and issues in the thinking
        const patterns = this.identifyPatterns(thoughtHistory);
        const issues = this.identifyIssues(thoughtHistory);
        // Generate advice based on the analysis
        const advice = this.generateAdvice(patterns, issues, thoughtHistory, branches);
        return advice;
    }
    /**
     * Validate Chain of Thought reasoning
     */
    validateChainOfThought(thoughts) {
        // Filter to only Chain of Thought thoughts
        const cotThoughts = thoughts.filter(t => t.isChainOfThought);
        if (cotThoughts.length === 0) {
            return this.createEmptyValidationFeedback();
        }
        // Analyze logical structure
        const logicalStructureScore = this.analyzeLogicalStructure(cotThoughts);
        // Analyze evidence quality
        const evidenceQualityScore = this.analyzeEvidenceQuality(cotThoughts);
        // Analyze assumption validity
        const assumptionValidityScore = this.analyzeAssumptionValidity(cotThoughts);
        // Analyze conclusion strength
        const conclusionStrengthScore = this.analyzeConclusionStrength(cotThoughts);
        // Detect fallacies
        const detectedFallacies = this.detectFallacies(cotThoughts);
        // Identify gaps
        const gaps = this.identifyGaps(cotThoughts);
        // Calculate overall score
        const overallScore = Math.round((logicalStructureScore + evidenceQualityScore + assumptionValidityScore + conclusionStrengthScore) / 4);
        // Identify strengths
        const strengths = this.identifyStrengths(cotThoughts, {
            logicalStructureScore,
            evidenceQualityScore,
            assumptionValidityScore,
            conclusionStrengthScore
        });
        // Identify improvement areas
        const improvementAreas = this.identifyImprovementAreas(cotThoughts, {
            logicalStructureScore,
            evidenceQualityScore,
            assumptionValidityScore,
            conclusionStrengthScore
        });
        return {
            overallScore,
            logicalStructureScore,
            evidenceQualityScore,
            assumptionValidityScore,
            conclusionStrengthScore,
            detectedFallacies,
            gaps,
            strengths,
            improvementAreas
        };
    }
    /**
     * Generate a thought based on the current thinking session
     */
    generateThought(thoughtHistory, currentThoughtNumber, generationStrategy, topicFocus, constraintDescription) {
        // Get the current thought
        const currentThought = thoughtHistory.find(t => t.thoughtNumber === currentThoughtNumber);
        if (!currentThought) {
            throw new Error(`Thought number ${currentThoughtNumber} not found`);
        }
        // Generate a thought based on the strategy
        switch (generationStrategy) {
            case 'continue':
                return this.generateContinueThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
            case 'alternative':
                return this.generateAlternativeThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
            case 'challenge':
                return this.generateChallengeThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
            case 'deepen':
                return this.generateDeepenThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
            case 'summarize':
                return this.generateSummarizeThought(thoughtHistory, currentThought, topicFocus, constraintDescription);
            default:
                throw new Error(`Unknown generation strategy: ${generationStrategy}`);
        }
    }
    /**
     * Get coaching suggestions for a thinking session
     */
    getCoachingSuggestions(thoughtHistory, coachingAspect, detailLevel = 'brief') {
        // Generate coaching suggestions based on the aspect
        switch (coachingAspect) {
            case 'structure':
                return this.getStructureCoachingSuggestions(thoughtHistory, detailLevel);
            case 'depth':
                return this.getDepthCoachingSuggestions(thoughtHistory, detailLevel);
            case 'breadth':
                return this.getBreadthCoachingSuggestions(thoughtHistory, detailLevel);
            case 'creativity':
                return this.getCreativityCoachingSuggestions(thoughtHistory, detailLevel);
            case 'critical':
                return this.getCriticalCoachingSuggestions(thoughtHistory, detailLevel);
            case 'overall':
                return [
                    ...this.getStructureCoachingSuggestions(thoughtHistory, 'brief'),
                    ...this.getDepthCoachingSuggestions(thoughtHistory, 'brief'),
                    ...this.getBreadthCoachingSuggestions(thoughtHistory, 'brief'),
                    ...this.getCreativityCoachingSuggestions(thoughtHistory, 'brief'),
                    ...this.getCriticalCoachingSuggestions(thoughtHistory, 'brief')
                ];
            default:
                throw new Error(`Unknown coaching aspect: ${coachingAspect}`);
        }
    }
    /**
     * Identify patterns in the thinking
     */
    identifyPatterns(thoughtHistory) {
        const patterns = [];
        // Look for linear thinking pattern
        if (this.hasLinearThinking(thoughtHistory)) {
            patterns.push({
                type: 'linear_thinking',
                description: 'Thoughts follow a linear progression without branching or revision',
                thoughtNumbers: thoughtHistory.map(t => t.thoughtNumber),
                significance: 'neutral'
            });
        }
        // Look for branching pattern
        const branchingThoughts = thoughtHistory.filter(t => t.branchFromThought);
        if (branchingThoughts.length > 0) {
            patterns.push({
                type: 'branching',
                description: 'Thinking branches into multiple paths',
                thoughtNumbers: branchingThoughts.map(t => t.thoughtNumber),
                significance: 'positive'
            });
        }
        // Look for revision pattern
        const revisionThoughts = thoughtHistory.filter(t => t.isRevision);
        if (revisionThoughts.length > 0) {
            patterns.push({
                type: 'revision',
                description: 'Previous thoughts are revised based on new insights',
                thoughtNumbers: revisionThoughts.map(t => t.thoughtNumber),
                significance: 'positive'
            });
        }
        // Look for chain of thought pattern
        const cotThoughts = thoughtHistory.filter(t => t.isChainOfThought);
        if (cotThoughts.length > 0) {
            patterns.push({
                type: 'chain_of_thought',
                description: 'Explicit chain of thought reasoning',
                thoughtNumbers: cotThoughts.map(t => t.thoughtNumber),
                significance: 'positive'
            });
        }
        // Look for hypothesis-verification pattern
        const hypothesisThoughts = thoughtHistory.filter(t => t.isHypothesis);
        const verificationThoughts = thoughtHistory.filter(t => t.isVerification);
        if (hypothesisThoughts.length > 0 && verificationThoughts.length > 0) {
            patterns.push({
                type: 'hypothesis_verification',
                description: 'Hypotheses are generated and then verified',
                thoughtNumbers: [
                    ...hypothesisThoughts.map(t => t.thoughtNumber),
                    ...verificationThoughts.map(t => t.thoughtNumber)
                ],
                significance: 'positive'
            });
        }
        // Look for repetitive thinking pattern
        if (this.hasRepetitiveThinking(thoughtHistory)) {
            patterns.push({
                type: 'repetitive_thinking',
                description: 'Similar thoughts are repeated without significant progress',
                thoughtNumbers: this.getRepetitiveThoughtNumbers(thoughtHistory),
                significance: 'negative'
            });
        }
        return patterns;
    }
    /**
     * Identify issues in the thinking
     */
    identifyIssues(thoughtHistory) {
        const issues = [];
        // Look for lack of evidence
        const lacksEvidenceThoughts = this.getThoughtsLackingEvidence(thoughtHistory);
        if (lacksEvidenceThoughts.length > 0) {
            issues.push({
                type: 'lack_of_evidence',
                description: 'Claims are made without sufficient supporting evidence',
                thoughtNumbers: lacksEvidenceThoughts.map(t => t.thoughtNumber),
                severity: 'medium'
            });
        }
        // Look for logical fallacies
        const fallacies = this.detectLogicalFallacies(thoughtHistory);
        for (const fallacy of fallacies) {
            issues.push({
                type: `logical_fallacy_${fallacy.type}`,
                description: `Logical fallacy detected: ${fallacy.description}`,
                thoughtNumbers: fallacy.thoughtNumbers,
                severity: 'high'
            });
        }
        // Look for gaps in reasoning
        const gaps = this.detectReasoningGaps(thoughtHistory);
        for (const gap of gaps) {
            issues.push({
                type: 'reasoning_gap',
                description: `Gap in reasoning: ${gap.description}`,
                thoughtNumbers: [gap.betweenThoughts[0], gap.betweenThoughts[1]],
                severity: 'medium'
            });
        }
        // Look for confirmation bias
        if (this.hasConfirmationBias(thoughtHistory)) {
            issues.push({
                type: 'confirmation_bias',
                description: 'Evidence that supports pre-existing beliefs is favored over contradictory evidence',
                thoughtNumbers: this.getConfirmationBiasThoughtNumbers(thoughtHistory),
                severity: 'high'
            });
        }
        // Look for premature conclusion
        if (this.hasPrematureConclusion(thoughtHistory)) {
            issues.push({
                type: 'premature_conclusion',
                description: 'Conclusion is reached before sufficient evidence or analysis',
                thoughtNumbers: this.getPrematureConclusionThoughtNumbers(thoughtHistory),
                severity: 'high'
            });
        }
        return issues;
    }
    /**
     * Generate advice based on the analysis
     */
    generateAdvice(patterns, issues, thoughtHistory, branches) {
        // Generate recommended next steps
        const recommendedNextSteps = this.generateRecommendedNextSteps(patterns, issues, thoughtHistory, branches);
        // Generate suggested thoughts
        const suggestedThoughts = this.generateSuggestedThoughts(patterns, issues, thoughtHistory, branches);
        // Format identified issues
        const identifiedIssues = issues.map(issue => ({
            type: issue.type,
            description: issue.description,
            affectedThoughts: issue.thoughtNumbers,
            suggestionForResolution: this.generateSuggestionForIssue(issue, thoughtHistory)
        }));
        // Generate overall assessment
        const overallAssessment = this.generateOverallAssessment(patterns, issues, thoughtHistory, branches);
        return {
            recommendedNextSteps,
            suggestedThoughts,
            identifiedIssues,
            overallAssessment
        };
    }
    // Implementation of helper methods would go here
    // For brevity, I'm providing simplified implementations of some methods
    createEmptyValidationFeedback() {
        return {
            overallScore: 0,
            logicalStructureScore: 0,
            evidenceQualityScore: 0,
            assumptionValidityScore: 0,
            conclusionStrengthScore: 0,
            detectedFallacies: [],
            gaps: [],
            strengths: [],
            improvementAreas: []
        };
    }
    analyzeLogicalStructure(thoughts) {
        // Simplified implementation
        return 75; // Example score
    }
    analyzeEvidenceQuality(thoughts) {
        // Simplified implementation
        return 70; // Example score
    }
    analyzeAssumptionValidity(thoughts) {
        // Simplified implementation
        return 80; // Example score
    }
    analyzeConclusionStrength(thoughts) {
        // Simplified implementation
        return 65; // Example score
    }
    detectFallacies(thoughts) {
        // Simplified implementation
        return []; // Example empty array
    }
    identifyGaps(thoughts) {
        // Simplified implementation
        return []; // Example empty array
    }
    identifyStrengths(thoughts, scores) {
        // Simplified implementation
        return [
            'Clear logical progression between thoughts',
            'Good use of evidence to support claims'
        ]; // Example strengths
    }
    identifyImprovementAreas(thoughts, scores) {
        // Simplified implementation
        return [
            'Consider alternative explanations for the evidence',
            'Strengthen the conclusion by addressing potential counterarguments'
        ]; // Example improvement areas
    }
    generateContinueThought(thoughtHistory, currentThought, topicFocus, constraintDescription) {
        // Simplified implementation
        return {
            thought: 'This is a continuation of the previous thought, building on the ideas presented.',
            rationale: 'Continuing the current line of thinking allows for deeper exploration of the ideas.',
            strategy: 'continue',
            confidenceScore: 85
        };
    }
    generateAlternativeThought(thoughtHistory, currentThought, topicFocus, constraintDescription) {
        // Simplified implementation
        return {
            thought: 'Alternatively, we could consider a different approach to this problem.',
            rationale: 'Exploring alternative perspectives can lead to more comprehensive understanding.',
            strategy: 'alternative',
            confidenceScore: 75
        };
    }
    generateChallengeThought(thoughtHistory, currentThought, topicFocus, constraintDescription) {
        // Simplified implementation
        return {
            thought: 'However, there are reasons to question the assumptions made in the previous thought.',
            rationale: 'Challenging assumptions helps identify potential weaknesses in the reasoning.',
            strategy: 'challenge',
            confidenceScore: 70
        };
    }
    generateDeepenThought(thoughtHistory, currentThought, topicFocus, constraintDescription) {
        // Simplified implementation
        return {
            thought: 'Delving deeper into this aspect reveals additional nuances worth considering.',
            rationale: 'Exploring specific aspects in more depth can uncover important details.',
            strategy: 'deepen',
            confidenceScore: 80
        };
    }
    generateSummarizeThought(thoughtHistory, currentThought, topicFocus, constraintDescription) {
        // Simplified implementation
        return {
            thought: 'To summarize the key points discussed so far...',
            rationale: 'Summarizing helps consolidate understanding and identify key insights.',
            strategy: 'summarize',
            confidenceScore: 90
        };
    }
    getStructureCoachingSuggestions(thoughtHistory, detailLevel) {
        // Simplified implementation
        return [{
                aspect: 'structure',
                observation: 'The thinking process could benefit from a more explicit logical structure.',
                suggestion: 'Consider organizing thoughts into premise-reasoning-conclusion format.',
                exampleImplementation: detailLevel === 'detailed' ? 'Start with a clear premise, then provide reasoning, and end with a conclusion that follows from the reasoning.' : undefined,
                priority: 'medium'
            }];
    }
    getDepthCoachingSuggestions(thoughtHistory, detailLevel) {
        // Simplified implementation
        return [{
                aspect: 'depth',
                observation: 'Some ideas could be explored in more depth.',
                suggestion: 'Consider using the "deepen" strategy to explore key concepts more thoroughly.',
                exampleImplementation: detailLevel === 'detailed' ? 'For important concepts, ask "why" multiple times to get to deeper understanding.' : undefined,
                priority: 'medium'
            }];
    }
    getBreadthCoachingSuggestions(thoughtHistory, detailLevel) {
        // Simplified implementation
        return [{
                aspect: 'breadth',
                observation: 'The thinking could benefit from considering more alternatives.',
                suggestion: 'Use the "alternative" strategy to explore different perspectives.',
                exampleImplementation: detailLevel === 'detailed' ? 'For each main idea, try to generate at least two alternative approaches or perspectives.' : undefined,
                priority: 'medium'
            }];
    }
    getCreativityCoachingSuggestions(thoughtHistory, detailLevel) {
        // Simplified implementation
        return [{
                aspect: 'creativity',
                observation: 'The thinking process could benefit from more creative approaches.',
                suggestion: 'Try techniques like analogical thinking or random association to generate novel ideas.',
                exampleImplementation: detailLevel === 'detailed' ? 'Compare the current problem to something completely different to see if new insights emerge.' : undefined,
                priority: 'low'
            }];
    }
    getCriticalCoachingSuggestions(thoughtHistory, detailLevel) {
        // Simplified implementation
        return [{
                aspect: 'critical',
                observation: 'Some claims could benefit from more critical examination.',
                suggestion: 'Use the "challenge" strategy to question assumptions and claims.',
                exampleImplementation: detailLevel === 'detailed' ? 'For each major claim, ask "What evidence contradicts this?" and "What assumptions am I making?"' : undefined,
                priority: 'high'
            }];
    }
    hasLinearThinking(thoughtHistory) {
        // Simplified implementation
        return !thoughtHistory.some(t => t.branchFromThought || t.isRevision);
    }
    hasRepetitiveThinking(thoughtHistory) {
        // Simplified implementation
        return false; // Example result
    }
    getRepetitiveThoughtNumbers(thoughtHistory) {
        // Simplified implementation
        return []; // Example empty array
    }
    getThoughtsLackingEvidence(thoughtHistory) {
        // Simplified implementation
        return []; // Example empty array
    }
    detectLogicalFallacies(thoughtHistory) {
        // Simplified implementation
        return []; // Example empty array
    }
    detectReasoningGaps(thoughtHistory) {
        // Simplified implementation
        return []; // Example empty array
    }
    hasConfirmationBias(thoughtHistory) {
        // Simplified implementation
        return false; // Example result
    }
    getConfirmationBiasThoughtNumbers(thoughtHistory) {
        // Simplified implementation
        return []; // Example empty array
    }
    hasPrematureConclusion(thoughtHistory) {
        // Simplified implementation
        return false; // Example result
    }
    getPrematureConclusionThoughtNumbers(thoughtHistory) {
        // Simplified implementation
        return []; // Example empty array
    }
    generateRecommendedNextSteps(patterns, issues, thoughtHistory, branches) {
        // Simplified implementation
        return [
            {
                type: 'continue',
                description: 'Continue the current line of thinking',
                rationale: 'The current direction is promising and has more to explore',
                priority: 'high'
            },
            {
                type: 'branch',
                description: 'Branch to explore an alternative perspective',
                rationale: 'Considering alternative viewpoints will lead to a more comprehensive understanding',
                priority: 'medium'
            }
        ];
    }
    generateSuggestedThoughts(patterns, issues, thoughtHistory, branches) {
        // Simplified implementation
        return [
            {
                thought: 'Building on the previous analysis, we can see that...',
                type: 'continue',
                rationale: 'This continues the logical progression of the current thinking path'
            },
            {
                thought: 'An alternative approach would be to consider...',
                type: 'branch',
                rationale: 'This explores a different perspective that could yield new insights'
            }
        ];
    }
    generateSuggestionForIssue(issue, thoughtHistory) {
        // Simplified implementation
        switch (issue.type) {
            case 'lack_of_evidence':
                return 'Strengthen the argument by providing specific evidence or examples to support the claims.';
            case 'reasoning_gap':
                return 'Bridge the gap by explaining the logical connection between these thoughts.';
            default:
                if (issue.type.startsWith('logical_fallacy_')) {
                    return 'Restructure the argument to avoid this logical fallacy.';
                }
                return 'Address this issue by revisiting and revising the affected thoughts.';
        }
    }
    generateOverallAssessment(patterns, issues, thoughtHistory, branches) {
        // Simplified implementation
        const positivePatterns = patterns.filter(p => p.significance === 'positive');
        const negativePatterns = patterns.filter(p => p.significance === 'negative');
        const highSeverityIssues = issues.filter(i => i.severity === 'high');
        if (positivePatterns.length > 0 && highSeverityIssues.length === 0) {
            return 'The thinking process demonstrates several strengths, including ' +
                positivePatterns.map(p => p.description.toLowerCase()).join(', ') +
                '. Continue building on these strengths while exploring additional perspectives.';
        }
        else if (highSeverityIssues.length > 0) {
            return 'The thinking process has some significant issues that should be addressed, including ' +
                highSeverityIssues.map(i => i.description.toLowerCase()).join(', ') +
                '. Addressing these issues will strengthen the overall reasoning.';
        }
        else {
            return 'The thinking process is progressing adequately. Consider incorporating more explicit chain of thought reasoning and exploring alternative perspectives to enhance the analysis.';
        }
    }
}
