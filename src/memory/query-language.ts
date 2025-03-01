import { Entity, Relation, KnowledgeGraph } from './types.js';

/**
 * Represents a search item for an entity with its searchable text
 */
export interface EntitySearchItem {
  entity: Entity;
  searchText: string;
}

/**
 * Represents a parsed query with its components
 */
export interface ParsedQuery {
  freeText: string;
  type: string | null;
  name: string | null;
  include: string[];
  exclude: string[];
  or: string[][];
}

/**
 * Parses a search query string into structured components for advanced searching.
 * 
 * @param query The raw query string to parse
 * @returns An object containing the parsed query components:
 *   - freeText: Any text not matched by special operators, used for fuzzy matching
 *   - type: Entity type filter (from type:value)
 *   - name: Entity name filter (from name:value)
 *   - include: Terms that must be included (from +term)
 *   - exclude: Terms that must not be included (from -term)
 *   - or: Groups of alternative terms (from term1|term2|term3)
 */
export function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    freeText: '',
    type: null,
    name: null,
    include: [],
    exclude: [],
    or: []
  };
  
  // Early return for empty query
  if (!query || query.trim() === '') {
    return result;
  }
  
  // Regular expression to match special query operators
  const typeRegex = /type:([^\s]+)/gi;
  const nameRegex = /name:([^\s]+)/gi;
  const includeRegex = /\+([^\s]+)/g;
  const excludeRegex = /-([^\s]+)/g;
  const orRegex = /(\w+(?:\|\w+)+)/g; // Matches words separated by pipe symbols
  
  // Extract type filter
  const typeMatch = typeRegex.exec(query);
  if (typeMatch) {
    result.type = typeMatch[1];
    query = query.replace(typeMatch[0], '');
  }
  
  // Extract name filter
  const nameMatch = nameRegex.exec(query);
  if (nameMatch) {
    result.name = nameMatch[1];
    query = query.replace(nameMatch[0], '');
  }
  
  // Extract include terms - collect all matches first
  let includeMatches = [];
  let includeMatch;
  while ((includeMatch = includeRegex.exec(query)) !== null) {
    includeMatches.push(includeMatch);
  }
  
  // Process matches in reverse order to avoid index issues when replacing
  for (let i = includeMatches.length - 1; i >= 0; i--) {
    const match = includeMatches[i];
    result.include.push(match[1]);
    query = query.slice(0, match.index) + query.slice(match.index + match[0].length);
  }
  
  // Extract exclude terms - collect all matches first
  let excludeMatches = [];
  let excludeMatch;
  while ((excludeMatch = excludeRegex.exec(query)) !== null) {
    excludeMatches.push(excludeMatch);
  }
  
  // Process matches in reverse order
  for (let i = excludeMatches.length - 1; i >= 0; i--) {
    const match = excludeMatches[i];
    result.exclude.push(match[1]);
    query = query.slice(0, match.index) + query.slice(match.index + match[0].length);
  }
  
  // Extract OR groups - collect all matches first
  let orMatches = [];
  let orMatch;
  while ((orMatch = orRegex.exec(query)) !== null) {
    orMatches.push(orMatch);
  }
  
  // Process matches in reverse order
  for (let i = orMatches.length - 1; i >= 0; i--) {
    const match = orMatches[i];
    const orTerms = match[0].split('|');
    result.or.push(orTerms);
    query = query.slice(0, match.index) + query.slice(match.index + match[0].length);
  }
  
  // Remaining text is the free text search
  result.freeText = query.trim();
  
  return result;
}

/**
 * Creates entity search items ready for filtering
 * 
 * @param entities The list of entities to prepare for search
 * @returns An array of entity search items with searchable text
 */
export function createEntitySearchItems(entities: Entity[]): EntitySearchItem[] {
  return entities.map(entity => ({
    entity,
    // Combine entity name, type, and observations for search
    searchText: [
      entity.name,
      entity.entityType,
      ...entity.observations
    ].join(' ').toLowerCase()
  }));
}

/**
 * Filters entities based on a parsed query
 * 
 * @param entitySearchItems The entity search items to filter
 * @param parsedQuery The parsed query to apply
 * @returns Filtered entity search items that match the query
 */
export function filterEntitiesByQuery(
  entitySearchItems: EntitySearchItem[], 
  parsedQuery: ParsedQuery
): EntitySearchItem[] {
  return entitySearchItems.filter(item => {
    const entity = item.entity;
    const searchText = item.searchText;
    
    // Apply special filters first
    if (parsedQuery.type && !entity.entityType.toLowerCase().includes(parsedQuery.type.toLowerCase())) {
      return false;
    }
    
    if (parsedQuery.name && !entity.name.toLowerCase().includes(parsedQuery.name.toLowerCase())) {
      return false;
    }
    
    // Check for positive includes (AND logic)
    for (const term of parsedQuery.include) {
      if (!searchText.includes(term.toLowerCase())) {
        return false;
      }
    }
    
    // Check for excluded terms (NOT logic)
    for (const term of parsedQuery.exclude) {
      if (searchText.includes(term.toLowerCase())) {
        return false;
      }
    }
    
    // Check for OR term groups (any term in the group must match)
    for (const orGroup of parsedQuery.or) {
      let orMatched = false;
      for (const term of orGroup) {
        if (searchText.includes(term.toLowerCase())) {
          orMatched = true;
          break;
        }
      }
      // If none of the terms in the OR group matched, filter out this entity
      if (!orMatched) {
        return false;
      }
    }
    
    // If there's a free text search, apply fuzzy search
    if (parsedQuery.freeText) {
      // Basic fuzzy match using character sequence matching
      let lastIndex = -1;
      const queryLower = parsedQuery.freeText.toLowerCase();
      
      for (const char of queryLower) {
        const index = searchText.indexOf(char, lastIndex + 1);
        if (index === -1) {
          return false;
        }
        lastIndex = index;
      }
    }
    
    return true;
  });
}

/**
 * Scores and sorts entities by relevance to the query
 * 
 * @param entitySearchItems The filtered entity search items to score
 * @param parsedQuery The parsed query used for scoring
 * @returns Entity search items sorted by relevance score
 */
export function scoreAndSortEntities(
  entitySearchItems: EntitySearchItem[], 
  parsedQuery: ParsedQuery
): Entity[] {
  // Score entities based on relevance
  const scoredEntities = entitySearchItems.map(item => {
    let score = 1.0;
    
    // Exact match on name gives highest score
    if (parsedQuery.freeText && 
        item.entity.name.toLowerCase() === parsedQuery.freeText.toLowerCase()) {
      score = 2.0;
    }
    // Partial match on name gives medium score
    else if (parsedQuery.freeText && 
             item.entity.name.toLowerCase().includes(parsedQuery.freeText.toLowerCase())) {
      score = 1.5;
    }
    
    return {
      item,
      score
    };
  }).sort((a, b) => b.score - a.score);
  
  // Return sorted entities
  return scoredEntities.map(result => result.item.entity);
}

/**
 * Creates a filtered knowledge graph from a list of entities
 * 
 * @param entities The filtered entities to include in the graph
 * @param allRelations All relations to filter
 * @returns A knowledge graph with only relevant entities and relations
 */
export function createFilteredGraph(
  entities: Entity[], 
  allRelations: Relation[]
): KnowledgeGraph {
  // Create a Set of filtered entity names for quick lookup
  const filteredEntityNames = new Set(entities.map(e => e.name));

  // Filter relations to only include those between filtered entities
  const filteredRelations = allRelations.filter(r => 
    filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
  );

  return {
    entities,
    relations: filteredRelations
  };
}

/**
 * Executes a search query on a knowledge graph
 * 
 * @param query The raw query string
 * @param graph The knowledge graph to search
 * @returns A filtered knowledge graph containing only matching entities and their relations
 */
export function searchGraph(query: string, graph: KnowledgeGraph): KnowledgeGraph {
  // Early return for empty query
  if (!query || query.trim() === '') {
    return graph;
  }
  
  // Parse the query
  const parsedQuery = parseQuery(query);
  
  // Create entity search items
  const entitySearchItems = createEntitySearchItems(graph.entities);
  
  // Filter entities based on parsed query
  const matchingEntities = filterEntitiesByQuery(entitySearchItems, parsedQuery);
  
  // Score and sort by relevance
  const sortedEntities = scoreAndSortEntities(matchingEntities, parsedQuery);
  
  // Create and return the filtered graph
  return createFilteredGraph(sortedEntities, graph.relations);
} 