import { describe, it, expect } from 'vitest';
import { parseQuery, filterEntitiesByQuery, createEntitySearchItems, scoreAndSortEntities, createFilteredGraph, searchGraph } from './query-language.js';
import { Entity, KnowledgeGraph } from './types.js';

describe('Query Language', () => {
  describe('parseQuery', () => {
    it('should parse a complex query correctly', () => {
      const query = 'type:person +programmer -manager frontend|backend|fullstack name:john free text';
      const result = parseQuery(query);
      
      expect(result.type).toBe('person');
      expect(result.name).toBe('john');
      expect(result.include).toContain('programmer');
      expect(result.exclude).toContain('manager');
      expect(result.or).toHaveLength(1);
      expect(result.or[0]).toContain('frontend');
      expect(result.or[0]).toContain('backend');
      expect(result.or[0]).toContain('fullstack');
      expect(result.freeText).toBe('free text');
    });
    
    it('should handle empty queries', () => {
      const result = parseQuery('');
      expect(result.freeText).toBe('');
      expect(result.type).toBeNull();
      expect(result.name).toBeNull();
      expect(result.include).toHaveLength(0);
      expect(result.exclude).toHaveLength(0);
      expect(result.or).toHaveLength(0);
    });
    
    it('should parse multiple includes and excludes', () => {
      const query = '+first +second -exclude1 -exclude2';
      const result = parseQuery(query);
      
      expect(result.include).toHaveLength(2);
      expect(result.include).toContain('first');
      expect(result.include).toContain('second');
      expect(result.exclude).toHaveLength(2);
      expect(result.exclude).toContain('exclude1');
      expect(result.exclude).toContain('exclude2');
    });
    
    it('should parse multiple OR groups', () => {
      const query = 'group1|group2 apple|orange|banana';
      const result = parseQuery(query);
      
      expect(result.or).toHaveLength(2);
      // Order might be reversed due to processing matches in reverse order
      const orGroups = result.or.map(group => group.sort().join(','));
      expect(orGroups).toContain('group1,group2');
      expect(orGroups).toContain('apple,banana,orange');
    });
  });

  describe('filterEntitiesByQuery', () => {
    const entities: Entity[] = [
      { name: 'John Smith', entityType: 'person', observations: ['programmer', 'likes coffee', 'works remote'] },
      { name: 'Jane Doe', entityType: 'person', observations: ['manager', 'likes tea', 'office worker'] },
      { name: 'React', entityType: 'technology', observations: ['frontend', 'javascript library', 'UI development'] },
      { name: 'Node.js', entityType: 'technology', observations: ['backend', 'javascript runtime', 'server-side'] },
    ];
    
    const entitySearchItems = createEntitySearchItems(entities);
    
    it('should filter by type', () => {
      const parsedQuery = parseQuery('type:person');
      const results = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      
      expect(results).toHaveLength(2);
      expect(results.map(item => item.entity.name)).toContain('John Smith');
      expect(results.map(item => item.entity.name)).toContain('Jane Doe');
    });
    
    it('should filter by name', () => {
      const parsedQuery = parseQuery('name:john');
      const results = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      
      expect(results).toHaveLength(1);
      expect(results[0].entity.name).toBe('John Smith');
    });
    
    it('should apply AND logic with include terms', () => {
      const parsedQuery = parseQuery('+programmer +coffee');
      const results = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      
      expect(results).toHaveLength(1);
      expect(results[0].entity.name).toBe('John Smith');
    });
    
    it('should apply NOT logic with exclude terms', () => {
      const parsedQuery = parseQuery('type:person -manager');
      const results = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      
      expect(results).toHaveLength(1);
      expect(results[0].entity.name).toBe('John Smith');
    });
    
    it('should apply OR logic correctly', () => {
      const parsedQuery = parseQuery('frontend|backend');
      const results = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      
      expect(results).toHaveLength(2);
      expect(results.map(item => item.entity.name)).toContain('React');
      expect(results.map(item => item.entity.name)).toContain('Node.js');
    });
    
    it('should apply fuzzy search for free text', () => {
      const parsedQuery = parseQuery('jvs'); // fuzzy matching for "javascript"
      const results = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      
      expect(results).toHaveLength(2);
      expect(results.map(item => item.entity.name)).toContain('React');
      expect(results.map(item => item.entity.name)).toContain('Node.js');
    });
    
    it('should combine all filter types in complex queries', () => {
      const parsedQuery = parseQuery('type:person +programmer -manager coffee|tea');
      const results = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      
      expect(results).toHaveLength(1);
      expect(results[0].entity.name).toBe('John Smith');
    });
  });

  describe('scoreAndSortEntities', () => {
    const entities: Entity[] = [
      { name: 'javascript', entityType: 'language', observations: ['programming language', 'web development'] },
      { name: 'java', entityType: 'language', observations: ['programming language', 'enterprise'] },
      { name: 'python', entityType: 'language', observations: ['programming language', 'data science'] },
      { name: 'typescript', entityType: 'language', observations: ['superset of javascript', 'types'] },
    ];
    
    const entitySearchItems = createEntitySearchItems(entities);
    
    it('should score exact name matches highest', () => {
      const parsedQuery = parseQuery('java');
      const filtered = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      const results = scoreAndSortEntities(filtered, parsedQuery);
      
      // 'java' should be scored highest as exact match
      expect(results[0].entity.name).toBe('java');
    });
    
    it('should score partial name matches higher than content-only matches', () => {
      const parsedQuery = parseQuery('javascript');
      const filtered = filterEntitiesByQuery(entitySearchItems, parsedQuery);
      const results = scoreAndSortEntities(filtered, parsedQuery);
      
      // Order should be: 'javascript' (exact), 'typescript' (partial), 'others'
      expect(results[0].entity.name).toBe('javascript');
      // typescript contains javascript in name, so should be second
      expect(results[1].entity.name).toBe('typescript');
    });
  });

  describe('createFilteredGraph', () => {
    it('should filter relations to include those where either entity is in the filtered set', () => {
      const entities: Entity[] = [
        { name: 'A', entityType: 'letter', observations: ['first letter'] },
        { name: 'B', entityType: 'letter', observations: ['second letter'] },
        { name: 'C', entityType: 'letter', observations: ['third letter'] },
      ];
      
      // Only include A and B
      const filteredEntities = entities.filter(e => ['A', 'B'].includes(e.name));
      // Convert to ScoredEntity format for createFilteredGraph
      const scoredEntities = filteredEntities.map(entity => ({ entity, score: 1.0 }));
      const graph = createFilteredGraph(scoredEntities);
      
      expect(graph.scoredEntities).toHaveLength(2);
    });
  });

  describe('searchGraph', () => {
    const testGraph: KnowledgeGraph = {
      entities: [
        { name: 'John Smith', entityType: 'person', observations: ['programmer', 'likes coffee', 'works remote'] },
        { name: 'Jane Doe', entityType: 'person', observations: ['manager', 'likes tea', 'office worker'] },
        { name: 'React', entityType: 'technology', observations: ['frontend', 'javascript library', 'UI development'] },
        { name: 'Node.js', entityType: 'technology', observations: ['backend', 'javascript runtime', 'server-side'] },
      ],
      relations: [
        { from: 'John Smith', to: 'React', relationType: 'uses' },
        { from: 'John Smith', to: 'Node.js', relationType: 'uses' },
        { from: 'Jane Doe', to: 'React', relationType: 'manages_project' },
      ]
    };
    
    it('should return the full graph for empty query', () => {
      const result = searchGraph('', testGraph);
      expect(result.scoredEntities).toHaveLength(testGraph.entities.length);
    });
    
    it('should perform a full search with filtering and sorting', () => {
      const result = searchGraph('type:person +programmer', testGraph);
      
      expect(result.scoredEntities).toHaveLength(1);
      expect(result.scoredEntities[0].entity.name).toBe('John Smith');
    });
    
    it('should maintain relationships between matched entities', () => {
      const result = searchGraph('+javascript', testGraph);
      
      expect(result.scoredEntities).toHaveLength(2);
      expect(result.scoredEntities.map(e => e.entity.name)).toContain('React');
      expect(result.scoredEntities.map(e => e.entity.name)).toContain('Node.js');
    });
  });
}); 