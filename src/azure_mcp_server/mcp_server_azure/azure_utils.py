# azure_utils.py
# azure_utils.py
def get_cosmosdb_type(value):
    # For Cosmos DB NoSQL API, you usually don't need to explicitly define types like DynamoDB.
    # JSON serialization handles most types. You might need custom handling for specific cases if necessary.
    return value


# If you were using Azure Table Storage, you might need a function similar to get_dynamodb_type
# to convert Python types to Table Storage entity property types.
# For example:
# def get_table_storage_type(value):
#     if isinstance(value, str):
#         return {'type': 'String', 'value': value}
#     elif isinstance(value, int):
#         return {'type': 'Int64', 'value': value}
#     elif isinstance(value, bool):
#         return {'type': 'Boolean', 'value': value}
#     # ... and so on for other types
#     else:
#         return {'type': 'String', 'value': str(value)} # Default to string
