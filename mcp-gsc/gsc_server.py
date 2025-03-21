from typing import Any, Dict, List, Optional
import os
import json
from datetime import datetime, timedelta

import google.auth
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# MCP
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("gsc-server")

# Path to your service account JSON or user credentials JSON
# First check if GSC_CREDENTIALS_PATH environment variable is set
# Then try looking in the script directory and current working directory as fallbacks
GSC_CREDENTIALS_PATH = os.environ.get("GSC_CREDENTIALS_PATH")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
POSSIBLE_CREDENTIAL_PATHS = [
    GSC_CREDENTIALS_PATH,  # First try the environment variable if set
    os.path.join(SCRIPT_DIR, "service_account_credentials.json"),
    os.path.join(os.getcwd(), "service_account_credentials.json"),
    # Add any other potential paths here
]

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]

def get_gsc_service():
    """
    Returns an authorized Search Console service object.
    Checks for credentials in environment variable first, then fallback locations.
    """
    for cred_path in POSSIBLE_CREDENTIAL_PATHS:
        if cred_path and os.path.exists(cred_path):
            try:
                creds = service_account.Credentials.from_service_account_file(
                    cred_path, scopes=SCOPES
                )
                return build("searchconsole", "v1", credentials=creds)
            except Exception as e:
                continue  # Try the next path if this one fails
    
    # If we get here, none of the paths worked
    raise FileNotFoundError(
        f"Credentials file not found. Please set the GSC_CREDENTIALS_PATH environment variable "
        f"or place credentials file in one of these locations: "
        f"{', '.join([p for p in POSSIBLE_CREDENTIAL_PATHS[1:] if p])}"
    )

@mcp.tool()
async def list_properties() -> str:
    """
    Retrieves and returns the user's Search Console properties.
    """
    try:
        service = get_gsc_service()
        site_list = service.sites().list().execute()

        # site_list is typically something like:
        # {
        #   "siteEntry": [
        #       {"siteUrl": "...", "permissionLevel": "..."},
        #       ...
        #   ]
        # }
        sites = site_list.get("siteEntry", [])

        if not sites:
            return "No Search Console properties found."

        # Format the results for easy reading
        lines = []
        for site in sites:
            site_url = site.get("siteUrl", "Unknown")
            permission = site.get("permissionLevel", "Unknown permission")
            lines.append(f"- {site_url} ({permission})")

        return "\n".join(lines)
    except FileNotFoundError as e:
        return (
            "Error: Service account credentials file not found.\n\n"
            "To access Google Search Console, please:\n"
            "1. Create a service account in Google Cloud Console\n"
            "2. Download the JSON credentials file\n"
            "3. Save it as 'service_account_credentials.json' in the same directory as this script\n"
            "4. Share your GSC properties with the service account email"
        )
    except Exception as e:
        return f"Error retrieving properties: {str(e)}"

@mcp.tool()
async def get_search_analytics(site_url: str, days: int = 28, dimensions: str = "query") -> str:
    """
    Get search analytics data for a specific property.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        days: Number of days to look back (default: 28)
        dimensions: Dimensions to group by (default: query). Options: query, page, device, country, date
                   You can provide multiple dimensions separated by comma (e.g., "query,page")
    """
    try:
        service = get_gsc_service()
        
        # Calculate date range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        # Parse dimensions
        dimension_list = [d.strip() for d in dimensions.split(",")]
        
        # Build request
        request = {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d"),
            "dimensions": dimension_list,
            "rowLimit": 20  # Limit to top 20 results
        }
        
        # Execute request
        response = service.searchanalytics().query(siteUrl=site_url, body=request).execute()
        
        if not response.get("rows"):
            return f"No search analytics data found for {site_url} in the last {days} days."
        
        # Format results
        result_lines = [f"Search analytics for {site_url} (last {days} days):"]
        result_lines.append("\n" + "-" * 80 + "\n")
        
        # Create header based on dimensions
        header = []
        for dim in dimension_list:
            header.append(dim.capitalize())
        header.extend(["Clicks", "Impressions", "CTR", "Position"])
        result_lines.append(" | ".join(header))
        result_lines.append("-" * 80)
        
        # Add data rows
        for row in response.get("rows", []):
            data = []
            # Add dimension values
            for dim_value in row.get("keys", []):
                data.append(dim_value[:30])  # Truncate long values
            
            # Add metrics
            data.append(str(row.get("clicks", 0)))
            data.append(str(row.get("impressions", 0)))
            data.append(f"{row.get('ctr', 0) * 100:.2f}%")
            data.append(f"{row.get('position', 0):.1f}")
            
            result_lines.append(" | ".join(data))
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error retrieving search analytics: {str(e)}"

@mcp.tool()
async def get_site_details(site_url: str) -> str:
    """
    Get detailed information about a specific Search Console property.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
    """
    try:
        service = get_gsc_service()
        
        # Get site details
        site_info = service.sites().get(siteUrl=site_url).execute()
        
        # Format the results
        result_lines = [f"Site details for {site_url}:"]
        result_lines.append("-" * 50)
        
        # Add basic info
        result_lines.append(f"Permission level: {site_info.get('permissionLevel', 'Unknown')}")
        
        # Add verification info if available
        if "siteVerificationInfo" in site_info:
            verify_info = site_info["siteVerificationInfo"]
            result_lines.append(f"Verification state: {verify_info.get('verificationState', 'Unknown')}")
            
            if "verifiedUser" in verify_info:
                result_lines.append(f"Verified by: {verify_info['verifiedUser']}")
                
            if "verificationMethod" in verify_info:
                result_lines.append(f"Verification method: {verify_info['verificationMethod']}")
        
        # Add ownership info if available
        if "ownershipInfo" in site_info:
            owner_info = site_info["ownershipInfo"]
            result_lines.append("\nOwnership Information:")
            result_lines.append(f"Owner: {owner_info.get('owner', 'Unknown')}")
            
            if "verificationMethod" in owner_info:
                result_lines.append(f"Ownership verification: {owner_info['verificationMethod']}")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error retrieving site details: {str(e)}"

@mcp.tool()
async def get_sitemaps(site_url: str) -> str:
    """
    List all sitemaps for a specific Search Console property.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
    """
    try:
        service = get_gsc_service()
        
        # Get sitemaps list
        sitemaps = service.sitemaps().list(siteUrl=site_url).execute()
        
        if not sitemaps.get("sitemap"):
            return f"No sitemaps found for {site_url}."
        
        # Format the results
        result_lines = [f"Sitemaps for {site_url}:"]
        result_lines.append("-" * 80)
        
        # Header
        result_lines.append("Path | Last Downloaded | Status | Indexed URLs | Errors")
        result_lines.append("-" * 80)
        
        # Add each sitemap
        for sitemap in sitemaps.get("sitemap", []):
            path = sitemap.get("path", "Unknown")
            last_downloaded = sitemap.get("lastDownloaded", "Never")
            
            # Format last downloaded date if it exists
            if last_downloaded != "Never":
                try:
                    # Convert to more readable format
                    dt = datetime.fromisoformat(last_downloaded.replace('Z', '+00:00'))
                    last_downloaded = dt.strftime("%Y-%m-%d %H:%M")
                except:
                    pass
            
            status = "Valid"
            if "errors" in sitemap and sitemap["errors"] > 0:
                status = "Has errors"
            
            # Get counts
            warnings = sitemap.get("warnings", 0)
            errors = sitemap.get("errors", 0)
            
            # Get contents if available
            indexed_urls = "N/A"
            if "contents" in sitemap:
                for content in sitemap["contents"]:
                    if content.get("type") == "web":
                        indexed_urls = content.get("submitted", "0")
                        break
            
            result_lines.append(f"{path} | {last_downloaded} | {status} | {indexed_urls} | {errors}")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error retrieving sitemaps: {str(e)}"

@mcp.tool()
async def inspect_url_enhanced(site_url: str, page_url: str) -> str:
    """
    Enhanced URL inspection to check indexing status and rich results in Google.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match, for domain properties use format: sc-domain:example.com)
        page_url: The specific URL to inspect
    """
    try:
        service = get_gsc_service()
        
        # Build request
        request = {
            "inspectionUrl": page_url,
            "siteUrl": site_url
        }
        
        # Execute request
        response = service.urlInspection().index().inspect(body=request).execute()
        
        if not response or "inspectionResult" not in response:
            return f"No inspection data found for {page_url}."
        
        inspection = response["inspectionResult"]
        
        # Format the results
        result_lines = [f"URL Inspection for {page_url}:"]
        result_lines.append("-" * 80)
        
        # Add inspection result link if available
        if "inspectionResultLink" in inspection:
            result_lines.append(f"Search Console Link: {inspection['inspectionResultLink']}")
            result_lines.append("-" * 80)
        
        # Indexing status section
        index_status = inspection.get("indexStatusResult", {})
        verdict = index_status.get("verdict", "UNKNOWN")
        
        result_lines.append(f"Indexing Status: {verdict}")
        
        # Coverage state
        if "coverageState" in index_status:
            result_lines.append(f"Coverage: {index_status['coverageState']}")
        
        # Last crawl
        if "lastCrawlTime" in index_status:
            try:
                crawl_time = datetime.fromisoformat(index_status["lastCrawlTime"].replace('Z', '+00:00'))
                result_lines.append(f"Last Crawled: {crawl_time.strftime('%Y-%m-%d %H:%M')}")
            except:
                result_lines.append(f"Last Crawled: {index_status['lastCrawlTime']}")
        
        # Page fetch
        if "pageFetchState" in index_status:
            result_lines.append(f"Page Fetch: {index_status['pageFetchState']}")
        
        # Robots.txt status
        if "robotsTxtState" in index_status:
            result_lines.append(f"Robots.txt: {index_status['robotsTxtState']}")
        
        # Indexing state
        if "indexingState" in index_status:
            result_lines.append(f"Indexing State: {index_status['indexingState']}")
        
        # Canonical information
        if "googleCanonical" in index_status:
            result_lines.append(f"Google Canonical: {index_status['googleCanonical']}")
        
        if "userCanonical" in index_status and index_status.get("userCanonical") != index_status.get("googleCanonical"):
            result_lines.append(f"User Canonical: {index_status['userCanonical']}")
        
        # Crawled as
        if "crawledAs" in index_status:
            result_lines.append(f"Crawled As: {index_status['crawledAs']}")
        
        # Referring URLs
        if "referringUrls" in index_status and index_status["referringUrls"]:
            result_lines.append("\nReferring URLs:")
            for url in index_status["referringUrls"][:5]:  # Limit to 5 examples
                result_lines.append(f"- {url}")
            
            if len(index_status["referringUrls"]) > 5:
                result_lines.append(f"... and {len(index_status['referringUrls']) - 5} more")
        
        # Rich results
        if "richResultsResult" in inspection:
            rich = inspection["richResultsResult"]
            result_lines.append(f"\nRich Results: {rich.get('verdict', 'UNKNOWN')}")
            
            if "detectedItems" in rich and rich["detectedItems"]:
                result_lines.append("Detected Rich Result Types:")
                
                for item in rich["detectedItems"]:
                    rich_type = item.get("richResultType", "Unknown")
                    result_lines.append(f"- {rich_type}")
                    
                    # If there are items with names, show them
                    if "items" in item and item["items"]:
                        for i, subitem in enumerate(item["items"][:3]):  # Limit to 3 examples
                            if "name" in subitem:
                                result_lines.append(f"  • {subitem['name']}")
                        
                        if len(item["items"]) > 3:
                            result_lines.append(f"  • ... and {len(item['items']) - 3} more items")
            
            # Check for issues
            if "richResultsIssues" in rich and rich["richResultsIssues"]:
                result_lines.append("\nRich Results Issues:")
                for issue in rich["richResultsIssues"]:
                    severity = issue.get("severity", "Unknown")
                    message = issue.get("message", "Unknown issue")
                    result_lines.append(f"- [{severity}] {message}")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error inspecting URL: {str(e)}"

@mcp.tool()
async def batch_url_inspection(site_url: str, urls: str) -> str:
    """
    Inspect multiple URLs in batch (within API limits).
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match, for domain properties use format: sc-domain:example.com)
        urls: List of URLs to inspect, one per line
    """
    try:
        service = get_gsc_service()
        
        # Parse URLs
        url_list = [url.strip() for url in urls.split('\n') if url.strip()]
        
        if not url_list:
            return "No URLs provided for inspection."
        
        if len(url_list) > 10:
            return f"Too many URLs provided ({len(url_list)}). Please limit to 10 URLs per batch to avoid API quota issues."
        
        # Process each URL
        results = []
        
        for page_url in url_list:
            # Build request
            request = {
                "inspectionUrl": page_url,
                "siteUrl": site_url
            }
            
            try:
                # Execute request with a small delay to avoid rate limits
                response = service.urlInspection().index().inspect(body=request).execute()
                
                if not response or "inspectionResult" not in response:
                    results.append(f"{page_url}: No inspection data found")
                    continue
                
                inspection = response["inspectionResult"]
                index_status = inspection.get("indexStatusResult", {})
                
                # Get key information
                verdict = index_status.get("verdict", "UNKNOWN")
                coverage = index_status.get("coverageState", "Unknown")
                last_crawl = "Never"
                
                if "lastCrawlTime" in index_status:
                    try:
                        crawl_time = datetime.fromisoformat(index_status["lastCrawlTime"].replace('Z', '+00:00'))
                        last_crawl = crawl_time.strftime('%Y-%m-%d')
                    except:
                        last_crawl = index_status["lastCrawlTime"]
                
                # Check for rich results
                rich_results = "None"
                if "richResultsResult" in inspection:
                    rich = inspection["richResultsResult"]
                    if rich.get("verdict") == "PASS" and "detectedItems" in rich and rich["detectedItems"]:
                        rich_types = [item.get("richResultType", "Unknown") for item in rich["detectedItems"]]
                        rich_results = ", ".join(rich_types)
                
                # Format result
                results.append(f"{page_url}:\n  Status: {verdict} - {coverage}\n  Last Crawl: {last_crawl}\n  Rich Results: {rich_results}\n")
            
            except Exception as e:
                results.append(f"{page_url}: Error - {str(e)}")
        
        # Combine results
        return f"Batch URL Inspection Results for {site_url}:\n\n" + "\n".join(results)
    
    except Exception as e:
        return f"Error performing batch inspection: {str(e)}"

@mcp.tool()
async def check_indexing_issues(site_url: str, urls: str) -> str:
    """
    Check for specific indexing issues across multiple URLs.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match, for domain properties use format: sc-domain:example.com)
        urls: List of URLs to check, one per line
    """
    try:
        service = get_gsc_service()
        
        # Parse URLs
        url_list = [url.strip() for url in urls.split('\n') if url.strip()]
        
        if not url_list:
            return "No URLs provided for inspection."
        
        if len(url_list) > 10:
            return f"Too many URLs provided ({len(url_list)}). Please limit to 10 URLs per batch to avoid API quota issues."
        
        # Track issues by category
        issues_summary = {
            "not_indexed": [],
            "canonical_issues": [],
            "robots_blocked": [],
            "fetch_issues": [],
            "indexed": []
        }
        
        # Process each URL
        for page_url in url_list:
            # Build request
            request = {
                "inspectionUrl": page_url,
                "siteUrl": site_url
            }
            
            try:
                # Execute request
                response = service.urlInspection().index().inspect(body=request).execute()
                
                if not response or "inspectionResult" not in response:
                    issues_summary["not_indexed"].append(f"{page_url} - No inspection data found")
                    continue
                
                inspection = response["inspectionResult"]
                index_status = inspection.get("indexStatusResult", {})
                
                # Check indexing status
                verdict = index_status.get("verdict", "UNKNOWN")
                coverage = index_status.get("coverageState", "Unknown")
                
                if verdict != "PASS" or "not indexed" in coverage.lower() or "excluded" in coverage.lower():
                    issues_summary["not_indexed"].append(f"{page_url} - {coverage}")
                else:
                    issues_summary["indexed"].append(page_url)
                
                # Check canonical issues
                google_canonical = index_status.get("googleCanonical", "")
                user_canonical = index_status.get("userCanonical", "")
                
                if google_canonical and user_canonical and google_canonical != user_canonical:
                    issues_summary["canonical_issues"].append(
                        f"{page_url} - Google chose: {google_canonical} instead of user-declared: {user_canonical}"
                    )
                
                # Check robots.txt status
                robots_state = index_status.get("robotsTxtState", "")
                if robots_state == "BLOCKED":
                    issues_summary["robots_blocked"].append(page_url)
                
                # Check fetch issues
                fetch_state = index_status.get("pageFetchState", "")
                if fetch_state != "SUCCESSFUL":
                    issues_summary["fetch_issues"].append(f"{page_url} - {fetch_state}")
            
            except Exception as e:
                issues_summary["not_indexed"].append(f"{page_url} - Error: {str(e)}")
        
        # Format results
        result_lines = [f"Indexing Issues Report for {site_url}:"]
        result_lines.append("-" * 80)
        
        # Summary counts
        result_lines.append(f"Total URLs checked: {len(url_list)}")
        result_lines.append(f"Indexed: {len(issues_summary['indexed'])}")
        result_lines.append(f"Not indexed: {len(issues_summary['not_indexed'])}")
        result_lines.append(f"Canonical issues: {len(issues_summary['canonical_issues'])}")
        result_lines.append(f"Robots.txt blocked: {len(issues_summary['robots_blocked'])}")
        result_lines.append(f"Fetch issues: {len(issues_summary['fetch_issues'])}")
        result_lines.append("-" * 80)
        
        # Detailed issues
        if issues_summary["not_indexed"]:
            result_lines.append("\nNot Indexed URLs:")
            for issue in issues_summary["not_indexed"]:
                result_lines.append(f"- {issue}")
        
        if issues_summary["canonical_issues"]:
            result_lines.append("\nCanonical Issues:")
            for issue in issues_summary["canonical_issues"]:
                result_lines.append(f"- {issue}")
        
        if issues_summary["robots_blocked"]:
            result_lines.append("\nRobots.txt Blocked URLs:")
            for url in issues_summary["robots_blocked"]:
                result_lines.append(f"- {url}")
        
        if issues_summary["fetch_issues"]:
            result_lines.append("\nFetch Issues:")
            for issue in issues_summary["fetch_issues"]:
                result_lines.append(f"- {issue}")
        
        return "\n".join(result_lines)
    
    except Exception as e:
        return f"Error checking indexing issues: {str(e)}"

@mcp.tool()
async def get_performance_overview(site_url: str, days: int = 28) -> str:
    """
    Get a performance overview for a specific property.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        days: Number of days to look back (default: 28)
    """
    try:
        service = get_gsc_service()
        
        # Calculate date range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        # Get total metrics
        total_request = {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d"),
            "dimensions": [],  # No dimensions for totals
            "rowLimit": 1
        }
        
        total_response = service.searchanalytics().query(siteUrl=site_url, body=total_request).execute()
        
        # Get by date for trend
        date_request = {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d"),
            "dimensions": ["date"],
            "rowLimit": days
        }
        
        date_response = service.searchanalytics().query(siteUrl=site_url, body=date_request).execute()
        
        # Format results
        result_lines = [f"Performance Overview for {site_url} (last {days} days):"]
        result_lines.append("-" * 80)
        
        # Add total metrics
        if total_response.get("rows"):
            row = total_response["rows"][0]
            result_lines.append(f"Total Clicks: {row.get('clicks', 0):,}")
            result_lines.append(f"Total Impressions: {row.get('impressions', 0):,}")
            result_lines.append(f"Average CTR: {row.get('ctr', 0) * 100:.2f}%")
            result_lines.append(f"Average Position: {row.get('position', 0):.1f}")
        else:
            result_lines.append("No data available for the selected period.")
            return "\n".join(result_lines)
        
        # Add trend data
        if date_response.get("rows"):
            result_lines.append("\nDaily Trend:")
            result_lines.append("Date | Clicks | Impressions | CTR | Position")
            result_lines.append("-" * 80)
            
            # Sort by date
            sorted_rows = sorted(date_response["rows"], key=lambda x: x["keys"][0])
            
            for row in sorted_rows:
                date_str = row["keys"][0]
                # Format date from YYYY-MM-DD to MM/DD
                try:
                    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                    date_formatted = date_obj.strftime("%m/%d")
                except:
                    date_formatted = date_str
                
                clicks = row.get("clicks", 0)
                impressions = row.get("impressions", 0)
                ctr = row.get("ctr", 0) * 100
                position = row.get("position", 0)
                
                result_lines.append(f"{date_formatted} | {clicks:.0f} | {impressions:.0f} | {ctr:.2f}% | {position:.1f}")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error retrieving performance overview: {str(e)}"

@mcp.tool()
async def get_advanced_search_analytics(
    site_url: str, 
    start_date: str = None, 
    end_date: str = None, 
    dimensions: str = "query", 
    search_type: str = "WEB",
    row_limit: int = 1000,
    start_row: int = 0,
    sort_by: str = "clicks",
    sort_direction: str = "descending",
    filter_dimension: str = None,
    filter_operator: str = "contains", 
    filter_expression: str = None
) -> str:
    """
    Get advanced search analytics data with sorting, filtering, and pagination.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        start_date: Start date in YYYY-MM-DD format (defaults to 28 days ago)
        end_date: End date in YYYY-MM-DD format (defaults to today)
        dimensions: Dimensions to group by, comma-separated (e.g., "query,page,device")
        search_type: Type of search results (WEB, IMAGE, VIDEO, NEWS, DISCOVER)
        row_limit: Maximum number of rows to return (max 25000)
        start_row: Starting row for pagination
        sort_by: Metric to sort by (clicks, impressions, ctr, position)
        sort_direction: Sort direction (ascending or descending)
        filter_dimension: Dimension to filter on (query, page, country, device)
        filter_operator: Filter operator (contains, equals, notContains, notEquals)
        filter_expression: Filter expression value
    """
    try:
        service = get_gsc_service()
        
        # Calculate date range if not provided
        if not end_date:
            end_date = datetime.now().date().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now().date() - timedelta(days=28)).strftime("%Y-%m-%d")
        
        # Parse dimensions
        dimension_list = [d.strip() for d in dimensions.split(",")]
        
        # Build request
        request = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": dimension_list,
            "rowLimit": min(row_limit, 25000),  # Cap at API maximum
            "startRow": start_row,
            "searchType": search_type.upper()
        }
        
        # Add sorting
        if sort_by:
            metric_map = {
                "clicks": "CLICK_COUNT",
                "impressions": "IMPRESSION_COUNT",
                "ctr": "CTR",
                "position": "POSITION"
            }
            
            if sort_by in metric_map:
                request["orderBy"] = [{
                    "metric": metric_map[sort_by],
                    "direction": sort_direction.lower()
                }]
        
        # Add filtering if provided
        if filter_dimension and filter_expression:
            filter_group = {
                "filters": [{
                    "dimension": filter_dimension,
                    "operator": filter_operator,
                    "expression": filter_expression
                }]
            }
            request["dimensionFilterGroups"] = [filter_group]
        
        # Execute request
        response = service.searchanalytics().query(siteUrl=site_url, body=request).execute()
        
        if not response.get("rows"):
            return (f"No search analytics data found for {site_url} with the specified parameters.\n\n"
                   f"Parameters used:\n"
                   f"- Date range: {start_date} to {end_date}\n"
                   f"- Dimensions: {dimensions}\n"
                   f"- Search type: {search_type}\n"
                   f"- Filter: {filter_dimension} {filter_operator} '{filter_expression}'" if filter_dimension else "- No filter applied")
        
        # Format results
        result_lines = [f"Search analytics for {site_url}:"]
        result_lines.append(f"Date range: {start_date} to {end_date}")
        result_lines.append(f"Search type: {search_type}")
        if filter_dimension:
            result_lines.append(f"Filter: {filter_dimension} {filter_operator} '{filter_expression}'")
        result_lines.append(f"Showing rows {start_row+1} to {start_row+len(response.get('rows', []))} (sorted by {sort_by} {sort_direction})")
        result_lines.append("\n" + "-" * 80 + "\n")
        
        # Create header based on dimensions
        header = []
        for dim in dimension_list:
            header.append(dim.capitalize())
        header.extend(["Clicks", "Impressions", "CTR", "Position"])
        result_lines.append(" | ".join(header))
        result_lines.append("-" * 80)
        
        # Add data rows
        for row in response.get("rows", []):
            data = []
            # Add dimension values
            for dim_value in row.get("keys", []):
                data.append(dim_value[:30])  # Truncate long values
            
            # Add metrics
            data.append(str(row.get("clicks", 0)))
            data.append(str(row.get("impressions", 0)))
            data.append(f"{row.get('ctr', 0) * 100:.2f}%")
            data.append(f"{row.get('position', 0):.1f}")
            
            result_lines.append(" | ".join(data))
        
        # Add pagination info if there might be more results
        if len(response.get("rows", [])) == row_limit:
            next_start = start_row + row_limit
            result_lines.append("\nThere may be more results available. To see the next page, use:")
            result_lines.append(f"start_row: {next_start}, row_limit: {row_limit}")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error retrieving advanced search analytics: {str(e)}"

@mcp.tool()
async def compare_search_periods(
    site_url: str,
    period1_start: str,
    period1_end: str,
    period2_start: str,
    period2_end: str,
    dimensions: str = "query",
    limit: int = 10
) -> str:
    """
    Compare search analytics data between two time periods.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        period1_start: Start date for period 1 (YYYY-MM-DD)
        period1_end: End date for period 1 (YYYY-MM-DD)
        period2_start: Start date for period 2 (YYYY-MM-DD)
        period2_end: End date for period 2 (YYYY-MM-DD)
        dimensions: Dimensions to group by (default: query)
        limit: Number of top results to compare (default: 10)
    """
    try:
        service = get_gsc_service()
        
        # Parse dimensions
        dimension_list = [d.strip() for d in dimensions.split(",")]
        
        # Build requests for both periods
        period1_request = {
            "startDate": period1_start,
            "endDate": period1_end,
            "dimensions": dimension_list,
            "rowLimit": 1000  # Get more to ensure we can match items between periods
        }
        
        period2_request = {
            "startDate": period2_start,
            "endDate": period2_end,
            "dimensions": dimension_list,
            "rowLimit": 1000
        }
        
        # Execute requests
        period1_response = service.searchanalytics().query(siteUrl=site_url, body=period1_request).execute()
        period2_response = service.searchanalytics().query(siteUrl=site_url, body=period2_request).execute()
        
        period1_rows = period1_response.get("rows", [])
        period2_rows = period2_response.get("rows", [])
        
        if not period1_rows and not period2_rows:
            return f"No data found for either period for {site_url}."
        
        # Create dictionaries for easy lookup
        period1_data = {tuple(row.get("keys", [])): row for row in period1_rows}
        period2_data = {tuple(row.get("keys", [])): row for row in period2_rows}
        
        # Find common keys and calculate differences
        all_keys = set(period1_data.keys()) | set(period2_data.keys())
        comparison_data = []
        
        for key in all_keys:
            p1_row = period1_data.get(key, {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0})
            p2_row = period2_data.get(key, {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0})
            
            # Calculate differences
            click_diff = p2_row.get("clicks", 0) - p1_row.get("clicks", 0)
            click_pct = (click_diff / p1_row.get("clicks", 1)) * 100 if p1_row.get("clicks", 0) > 0 else float('inf')
            
            imp_diff = p2_row.get("impressions", 0) - p1_row.get("impressions", 0)
            imp_pct = (imp_diff / p1_row.get("impressions", 1)) * 100 if p1_row.get("impressions", 0) > 0 else float('inf')
            
            ctr_diff = p2_row.get("ctr", 0) - p1_row.get("ctr", 0)
            pos_diff = p1_row.get("position", 0) - p2_row.get("position", 0)  # Note: lower position is better
            
            comparison_data.append({
                "key": key,
                "p1_clicks": p1_row.get("clicks", 0),
                "p2_clicks": p2_row.get("clicks", 0),
                "click_diff": click_diff,
                "click_pct": click_pct,
                "p1_impressions": p1_row.get("impressions", 0),
                "p2_impressions": p2_row.get("impressions", 0),
                "imp_diff": imp_diff,
                "imp_pct": imp_pct,
                "p1_ctr": p1_row.get("ctr", 0),
                "p2_ctr": p2_row.get("ctr", 0),
                "ctr_diff": ctr_diff,
                "p1_position": p1_row.get("position", 0),
                "p2_position": p2_row.get("position", 0),
                "pos_diff": pos_diff
            })
        
        # Sort by absolute click difference (can change to other metrics)
        comparison_data.sort(key=lambda x: abs(x["click_diff"]), reverse=True)
        
        # Format results
        result_lines = [f"Search analytics comparison for {site_url}:"]
        result_lines.append(f"Period 1: {period1_start} to {period1_end}")
        result_lines.append(f"Period 2: {period2_start} to {period2_end}")
        result_lines.append(f"Dimension(s): {dimensions}")
        result_lines.append(f"Top {min(limit, len(comparison_data))} results by change in clicks:")
        result_lines.append("\n" + "-" * 100 + "\n")
        
        # Create header
        dim_header = " | ".join([d.capitalize() for d in dimension_list])
        result_lines.append(f"{dim_header} | P1 Clicks | P2 Clicks | Change | % | P1 Pos | P2 Pos | Pos Δ")
        result_lines.append("-" * 100)
        
        # Add data rows (limited to requested number)
        for item in comparison_data[:limit]:
            key_str = " | ".join([str(k)[:20] for k in item["key"]])
            
            # Format the click change with color indicators
            click_change = item["click_diff"]
            click_pct = item["click_pct"] if item["click_pct"] != float('inf') else "N/A"
            click_pct_str = f"{click_pct:.1f}%" if click_pct != "N/A" else "N/A"
            
            # Format position change (positive is good - moving up in rankings)
            pos_change = item["pos_diff"]
            
            result_lines.append(
                f"{key_str} | {item['p1_clicks']} | {item['p2_clicks']} | "
                f"{click_change:+d} | {click_pct_str} | "
                f"{item['p1_position']:.1f} | {item['p2_position']:.1f} | {pos_change:+.1f}"
            )
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error comparing search periods: {str(e)}"

@mcp.tool()
async def get_search_by_page_query(
    site_url: str,
    page_url: str,
    days: int = 28
) -> str:
    """
    Get search analytics data for a specific page, broken down by query.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        page_url: The specific page URL to analyze
        days: Number of days to look back (default: 28)
    """
    try:
        service = get_gsc_service()
        
        # Calculate date range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        
        # Build request with page filter
        request = {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d"),
            "dimensions": ["query"],
            "dimensionFilterGroups": [{
                "filters": [{
                    "dimension": "page",
                    "operator": "equals",
                    "expression": page_url
                }]
            }],
            "rowLimit": 20,  # Top 20 queries for this page
            "orderBy": [{"metric": "CLICK_COUNT", "direction": "descending"}]
        }
        
        # Execute request
        response = service.searchanalytics().query(siteUrl=site_url, body=request).execute()
        
        if not response.get("rows"):
            return f"No search data found for page {page_url} in the last {days} days."
        
        # Format results
        result_lines = [f"Search queries for page {page_url} (last {days} days):"]
        result_lines.append("\n" + "-" * 80 + "\n")
        
        # Create header
        result_lines.append("Query | Clicks | Impressions | CTR | Position")
        result_lines.append("-" * 80)
        
        # Add data rows
        for row in response.get("rows", []):
            query = row.get("keys", ["Unknown"])[0]
            clicks = row.get("clicks", 0)
            impressions = row.get("impressions", 0)
            ctr = row.get("ctr", 0) * 100
            position = row.get("position", 0)
            
            result_lines.append(f"{query[:40]} | {clicks} | {impressions} | {ctr:.2f}% | {position:.1f}")
        
        # Add total metrics
        total_clicks = sum(row.get("clicks", 0) for row in response.get("rows", []))
        total_impressions = sum(row.get("impressions", 0) for row in response.get("rows", []))
        avg_ctr = (total_clicks / total_impressions * 100) if total_impressions > 0 else 0
        
        result_lines.append("-" * 80)
        result_lines.append(f"TOTAL | {total_clicks} | {total_impressions} | {avg_ctr:.2f}% | -")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error retrieving page query data: {str(e)}"

@mcp.tool()
async def list_sitemaps_enhanced(site_url: str, sitemap_index: str = None) -> str:
    """
    List all sitemaps for a specific Search Console property with detailed information.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        sitemap_index: Optional sitemap index URL to list child sitemaps
    """
    try:
        service = get_gsc_service()
        
        # Get sitemaps list
        if sitemap_index:
            sitemaps = service.sitemaps().list(siteUrl=site_url, sitemapIndex=sitemap_index).execute()
            source = f"child sitemaps from index: {sitemap_index}"
        else:
            sitemaps = service.sitemaps().list(siteUrl=site_url).execute()
            source = "all submitted sitemaps"
        
        if not sitemaps.get("sitemap"):
            return f"No sitemaps found for {site_url}" + (f" in index {sitemap_index}" if sitemap_index else ".")
        
        # Format the results
        result_lines = [f"Sitemaps for {site_url} ({source}):"]
        result_lines.append("-" * 100)
        
        # Header
        result_lines.append("Path | Last Submitted | Last Downloaded | Type | URLs | Errors | Warnings")
        result_lines.append("-" * 100)
        
        # Add each sitemap
        for sitemap in sitemaps.get("sitemap", []):
            path = sitemap.get("path", "Unknown")
            
            # Format dates
            last_submitted = sitemap.get("lastSubmitted", "Never")
            if last_submitted != "Never":
                try:
                    dt = datetime.fromisoformat(last_submitted.replace('Z', '+00:00'))
                    last_submitted = dt.strftime("%Y-%m-%d %H:%M")
                except:
                    pass
            
            last_downloaded = sitemap.get("lastDownloaded", "Never")
            if last_downloaded != "Never":
                try:
                    dt = datetime.fromisoformat(last_downloaded.replace('Z', '+00:00'))
                    last_downloaded = dt.strftime("%Y-%m-%d %H:%M")
                except:
                    pass
            
            # Determine type
            sitemap_type = "Index" if sitemap.get("isSitemapsIndex", False) else "Sitemap"
            
            # Get counts
            errors = sitemap.get("errors", 0)
            warnings = sitemap.get("warnings", 0)
            
            # Get URL counts
            url_count = "N/A"
            if "contents" in sitemap:
                for content in sitemap["contents"]:
                    if content.get("type") == "web":
                        url_count = content.get("submitted", "0")
                        break
            
            result_lines.append(f"{path} | {last_submitted} | {last_downloaded} | {sitemap_type} | {url_count} | {errors} | {warnings}")
        
        # Add processing status if available
        pending_count = sum(1 for sitemap in sitemaps.get("sitemap", []) if sitemap.get("isPending", False))
        if pending_count > 0:
            result_lines.append(f"\nNote: {pending_count} sitemaps are still pending processing by Google.")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error retrieving sitemaps: {str(e)}"

@mcp.tool()
async def get_sitemap_details(site_url: str, sitemap_url: str) -> str:
    """
    Get detailed information about a specific sitemap.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        sitemap_url: The full URL of the sitemap to inspect
    """
    try:
        service = get_gsc_service()
        
        # Get sitemap details
        details = service.sitemaps().get(siteUrl=site_url, feedpath=sitemap_url).execute()
        
        if not details:
            return f"No details found for sitemap {sitemap_url}."
        
        # Format the results
        result_lines = [f"Sitemap Details for {sitemap_url}:"]
        result_lines.append("-" * 80)
        
        # Basic info
        is_index = details.get("isSitemapsIndex", False)
        result_lines.append(f"Type: {'Sitemap Index' if is_index else 'Sitemap'}")
        
        # Status
        is_pending = details.get("isPending", False)
        result_lines.append(f"Status: {'Pending processing' if is_pending else 'Processed'}")
        
        # Dates
        if "lastSubmitted" in details:
            try:
                dt = datetime.fromisoformat(details["lastSubmitted"].replace('Z', '+00:00'))
                result_lines.append(f"Last Submitted: {dt.strftime('%Y-%m-%d %H:%M')}")
            except:
                result_lines.append(f"Last Submitted: {details['lastSubmitted']}")
        
        if "lastDownloaded" in details:
            try:
                dt = datetime.fromisoformat(details["lastDownloaded"].replace('Z', '+00:00'))
                result_lines.append(f"Last Downloaded: {dt.strftime('%Y-%m-%d %H:%M')}")
            except:
                result_lines.append(f"Last Downloaded: {details['lastDownloaded']}")
        
        # Errors and warnings
        result_lines.append(f"Errors: {details.get('errors', 0)}")
        result_lines.append(f"Warnings: {details.get('warnings', 0)}")
        
        # Content breakdown
        if "contents" in details and details["contents"]:
            result_lines.append("\nContent Breakdown:")
            for content in details["contents"]:
                content_type = content.get("type", "Unknown").upper()
                submitted = content.get("submitted", 0)
                indexed = content.get("indexed", "N/A")
                
                result_lines.append(f"- {content_type}: {submitted} submitted, {indexed} indexed")
        
        # If it's an index, suggest how to list child sitemaps
        if is_index:
            result_lines.append("\nThis is a sitemap index. To list child sitemaps, use:")
            result_lines.append(f"list_sitemaps_enhanced with sitemap_index={sitemap_url}")
        
        return "\n".join(result_lines)
    except Exception as e:
        return f"Error retrieving sitemap details: {str(e)}"

@mcp.tool()
async def submit_sitemap(site_url: str, sitemap_url: str) -> str:
    """
    Submit a new sitemap or resubmit an existing one to Google.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        sitemap_url: The full URL of the sitemap to submit
    """
    try:
        service = get_gsc_service()
        
        # Submit the sitemap
        service.sitemaps().submit(siteUrl=site_url, feedpath=sitemap_url).execute()
        
        # Verify submission by getting details
        try:
            details = service.sitemaps().get(siteUrl=site_url, feedpath=sitemap_url).execute()
            
            # Format response
            result_lines = [f"Successfully submitted sitemap: {sitemap_url}"]
            
            # Add submission time if available
            if "lastSubmitted" in details:
                try:
                    dt = datetime.fromisoformat(details["lastSubmitted"].replace('Z', '+00:00'))
                    result_lines.append(f"Submission time: {dt.strftime('%Y-%m-%d %H:%M')}")
                except:
                    result_lines.append(f"Submission time: {details['lastSubmitted']}")
            
            # Add processing status
            is_pending = details.get("isPending", True)
            result_lines.append(f"Status: {'Pending processing' if is_pending else 'Processing started'}")
            
            # Add note about processing time
            result_lines.append("\nNote: Google may take some time to process the sitemap. Check back later for full details.")
            
            return "\n".join(result_lines)
        except:
            # If we can't get details, just return basic success message
            return f"Successfully submitted sitemap: {sitemap_url}\n\nGoogle will queue it for processing."
    
    except Exception as e:
        return f"Error submitting sitemap: {str(e)}"

@mcp.tool()
async def delete_sitemap(site_url: str, sitemap_url: str) -> str:
    """
    Delete (unsubmit) a sitemap from Google Search Console.
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        sitemap_url: The full URL of the sitemap to delete
    """
    try:
        service = get_gsc_service()
        
        # First check if the sitemap exists
        try:
            service.sitemaps().get(siteUrl=site_url, feedpath=sitemap_url).execute()
        except Exception as e:
            if "404" in str(e):
                return f"Sitemap not found: {sitemap_url}. It may have already been deleted or was never submitted."
            else:
                raise e
        
        # Delete the sitemap
        service.sitemaps().delete(siteUrl=site_url, feedpath=sitemap_url).execute()
        
        return f"Successfully deleted sitemap: {sitemap_url}\n\nNote: This only removes the sitemap from Search Console. Any URLs already indexed will remain in Google's index."
    
    except Exception as e:
        return f"Error deleting sitemap: {str(e)}"

@mcp.tool()
async def manage_sitemaps(site_url: str, action: str, sitemap_url: str = None, sitemap_index: str = None) -> str:
    """
    All-in-one tool to manage sitemaps (list, get details, submit, delete).
    
    Args:
        site_url: The URL of the site in Search Console (must be exact match)
        action: The action to perform (list, details, submit, delete)
        sitemap_url: The full URL of the sitemap (required for details, submit, delete)
        sitemap_index: Optional sitemap index URL for listing child sitemaps (only used with 'list' action)
    """
    try:
        # Validate inputs
        action = action.lower().strip()
        valid_actions = ["list", "details", "submit", "delete"]
        
        if action not in valid_actions:
            return f"Invalid action: {action}. Please use one of: {', '.join(valid_actions)}"
        
        if action in ["details", "submit", "delete"] and not sitemap_url:
            return f"The {action} action requires a sitemap_url parameter."
        
        # Perform the requested action
        if action == "list":
            return await list_sitemaps_enhanced(site_url, sitemap_index)
        elif action == "details":
            return await get_sitemap_details(site_url, sitemap_url)
        elif action == "submit":
            return await submit_sitemap(site_url, sitemap_url)
        elif action == "delete":
            return await delete_sitemap(site_url, sitemap_url)
    
    except Exception as e:
        return f"Error managing sitemaps: {str(e)}"

@mcp.tool()
async def get_creator_info() -> str:
    """
    Provides information about Amin Foroutan, the creator of the MCP-GSC tool.
    """
    creator_info = """
# About the Creator: Amin Foroutan

Amin Foroutan is an SEO consultant with over a decade of experience, specializing in technical SEO, Python-driven tools, and data analysis for SEO performance.

## Connect with Amin:

- **LinkedIn**: [Amin Foroutan](https://www.linkedin.com/in/ma-foroutan/)
- **Personal Website**: [aminforoutan.com](https://aminforoutan.com/)
- **YouTube**: [Amin Forout](https://www.youtube.com/channel/UCW7tPXg-rWdH4YzLrcAdBIw)
- **X (Twitter)**: [@aminfseo](https://x.com/aminfseo)

## Notable Projects:

Amin has created several popular SEO tools including:
- Advanced GSC Visualizer (6.4K+ users)
- SEO Render Insight Tool (3.5K+ users)
- Google AI Overview Impact Analysis (1.2K+ users)
- Google AI Overview Citation Analysis (900+ users)
- SEMRush Enhancer (570+ users)
- SEO Page Inspector (115+ users)

## Expertise:

Amin combines technical SEO knowledge with programming skills to create innovative solutions for SEO challenges.
"""
    return creator_info

if __name__ == "__main__":
    # Start the MCP server on stdio transport
    mcp.run(transport="stdio")
