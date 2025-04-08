# Complete timezone mapping
TIMEZONE_MAPPING = {
    # North America
    "EST": "America/New_York",      # Eastern Standard Time
    "EDT": "America/New_York",      # Eastern Daylight Time
    "CST": "America/Chicago",       # Central Standard Time
    "CDT": "America/Chicago",       # Central Daylight Time
    "MST": "America/Denver",        # Mountain Standard Time
    "MDT": "America/Denver",        # Mountain Daylight Time
    "PST": "America/Los_Angeles",   # Pacific Standard Time
    "PDT": "America/Los_Angeles",   # Pacific Daylight Time
    "AKST": "America/Anchorage",    # Alaska Standard Time
    "AKDT": "America/Anchorage",    # Alaska Daylight Time
    "HST": "Pacific/Honolulu",      # Hawaii Standard Time
    "HAST": "Pacific/Honolulu",     # Hawaii-Aleutian Standard Time
    "HADT": "America/Adak",         # Hawaii-Aleutian Daylight Time
    
    # Europe
    "GMT": "Europe/London",         # Greenwich Mean Time
    "BST": "Europe/London",         # British Summer Time
    "WET": "Europe/Lisbon",         # Western European Time
    "WEST": "Europe/Lisbon",        # Western European Summer Time
    "CET": "Europe/Paris",          # Central European Time
    "CEST": "Europe/Paris",         # Central European Summer Time
    "EET": "Europe/Helsinki",       # Eastern European Time
    "EEST": "Europe/Helsinki",      # Eastern European Summer Time
    
    # Asia
    "IST": "Asia/Kolkata",          # Indian Standard Time
    "HKT": "Asia/Hong_Kong",        # Hong Kong Time
    "SGT": "Asia/Singapore",        # Singapore Time
    "JST": "Asia/Tokyo",            # Japan Standard Time
    "KST": "Asia/Seoul",            # Korea Standard Time
    "CST_ASIA": "Asia/Shanghai",    # China Standard Time
    "PHT": "Asia/Manila",           # Philippine Time
    "ICT": "Asia/Bangkok",          # Indochina Time
    
    # Australia & Pacific
    "AEST": "Australia/Sydney",     # Australian Eastern Standard Time
    "AEDT": "Australia/Sydney",     # Australian Eastern Daylight Time
    "ACST": "Australia/Adelaide",   # Australian Central Standard Time
    "ACDT": "Australia/Adelaide",   # Australian Central Daylight Time
    "AWST": "Australia/Perth",      # Australian Western Standard Time
    "NZST": "Pacific/Auckland",     # New Zealand Standard Time
    "NZDT": "Pacific/Auckland",     # New Zealand Daylight Time
    
    # Middle East
    "MSK": "Europe/Moscow",         # Moscow Standard Time
    "GST": "Asia/Dubai",            # Gulf Standard Time
    "TRT": "Europe/Istanbul",       # Turkey Time
    
    # South America
    "ART": "America/Argentina/Buenos_Aires",  # Argentina Time
    "BRT": "America/Sao_Paulo",     # Brasilia Time
    "BRST": "America/Sao_Paulo",    # Brasilia Summer Time
    
    # Military/NATO
    "Z": "Etc/UTC",                 # Zulu Time (UTC)
    "A": "Etc/GMT+1",               # Alpha Time Zone
    "M": "Etc/GMT+12",              # Mike Time Zone
    "Y": "Etc/GMT-12",              # Yankee Time Zone
    
    # Additional Common Abbreviations
    "UT": "Etc/UTC",                # Universal Time
    "UTC": "Etc/UTC",               # Coordinated Universal Time
    "ET": "America/New_York",       # Eastern Time (US)
    "CT": "America/Chicago",        # Central Time (US)
    "MT": "America/Denver",         # Mountain Time (US)
    "PT": "America/Los_Angeles",    # Pacific Time (US)
}

# Special case for ambiguous abbreviations that might need context
AMBIGUOUS_TIMEZONES = {
    "CST": ["America/Chicago", "Asia/Shanghai", "Australia/Darwin"],
    "IST": ["Asia/Kolkata", "Europe/Dublin", "Asia/Jerusalem"],
    "AST": ["America/Halifax", "Asia/Riyadh"],
    "EST": ["America/New_York", "Australia/Melbourne"]
}

def resolve_timezone_name(timezone_name: str) -> str:
    """
    Convert common timezone abbreviations to IANA timezone identifiers.
    
    Args:
        timezone_name: A timezone string which could be an abbreviation or IANA identifier
        
    Returns:
        The IANA timezone identifier
    """
    # If already a valid IANA name, return as is
    if "/" in timezone_name:
        return timezone_name
        
    # Check if it's in our mapping
    if timezone_name in TIMEZONE_MAPPING:
        return TIMEZONE_MAPPING[timezone_name]
        
    # Return the original name if not found in the mapping
    return timezone_name