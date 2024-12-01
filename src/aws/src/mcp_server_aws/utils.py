def get_dynamodb_type(value):
    if isinstance(value, str):
        return {'S': value}
    elif isinstance(value, (int, float)):
        return {'N': str(value)}
    elif isinstance(value, bool):
        return {'BOOL': value}
    elif value is None:
        return {'NULL': True}
    elif isinstance(value, list):
        return {'L': [get_dynamodb_type(v) for v in value]}
    elif isinstance(value, dict):
        return {'M': {k: get_dynamodb_type(v) for k, v in value.items()}}
    else:
        raise ValueError(
            f"Unsupported type for DynamoDB: {type(value)}")
