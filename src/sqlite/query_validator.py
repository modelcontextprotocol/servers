"""SQLite MCP Query Validator

This module provides query validation to ensure stability and performance
by enforcing query restrictions:
- SELECT queries only for read operations
- No CTEs (Common Table Expressions)
- No nested subqueries
"""

import sqlparse
from sqlparse.sql import Token
from sqlparse.tokens import DML, Keyword

class QueryValidationError(Exception):
    """Raised when a query fails validation."""
    pass

class SQLiteQueryValidator:
    """Validates SQLite queries against restrictions."""
    
    @staticmethod
    def validate_query(query: str) -> None:
        """
        Validates a SQL query against restrictions.
        
        Args:
            query: The SQL query to validate
            
        Raises:
            QueryValidationError: If the query violates any restrictions
        """
        parsed = sqlparse.parse(query.strip())[0]
        
        # Check query type
        if parsed.get_type() != 'SELECT':
            raise QueryValidationError("Only SELECT queries are allowed")
            
        # Count SELECT statements
        selects = len([token for token in parsed.flatten() 
                      if token.ttype == DML 
                      and token.value.upper() == 'SELECT'])
        if selects > 1:
            raise QueryValidationError("Nested subqueries are not allowed")
            
        # Check for CTEs
        if any(token.value.upper() == 'WITH' for token in parsed.flatten() 
               if token.ttype == Keyword):
            raise QueryValidationError("Common Table Expressions (CTEs) are not allowed")