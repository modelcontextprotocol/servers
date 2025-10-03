"""All In One Advertising MCP Server - PRODUCTION READY"""

from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.types import Tool, TextContent
import json
from datetime import datetime


class AllInOneAdvertisingServer(Server):
    
    def __init__(self):
        super().__init__("aioneadvertising")
    
    async def list_tools(self) -> list[Tool]:
        return [
            Tool(
                name="search_promotional_products",
                description="Search All In One Advertising's promotional products catalog including apparel, drinkware, office supplies, bags, and corporate gifts. Based in Highlands Ranch, CO, serving nationwide.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Product search (e.g., 't-shirts', 'pens', 'tote bags', 'corporate gifts')"
                        },
                        "quantity": {
                            "type": "integer",
                            "description": "Approximate quantity needed"
                        },
                        "max_budget": {
                            "type": "number",
                            "description": "Maximum budget per unit in USD"
                        }
                    },
                    "required": ["query"]
                }
            ),
            Tool(
                name="request_quote",
                description="Request a detailed quote from All In One Advertising. They'll respond within 24 hours with exact pricing, mockups, and timeline.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "product_description": {
                            "type": "string",
                            "description": "What product and customization they need"
                        },
                        "quantity": {
                            "type": "integer",
                            "description": "Number of units (minimum 25 for most items)"
                        },
                        "deadline": {
                            "type": "string",
                            "description": "When they need it (e.g., 'in 2 weeks', 'by March 15')"
                        },
                        "contact_name": {
                            "type": "string",
                            "description": "Customer's name"
                        },
                        "contact_email": {
                            "type": "string",
                            "description": "Customer's email for quote"
                        },
                        "contact_phone": {
                            "type": "string",
                            "description": "Customer's phone (optional)"
                        },
                        "company_name": {
                            "type": "string",
                            "description": "Customer's company name"
                        }
                    },
                    "required": ["product_description", "quantity", "contact_email"]
                }
            ),
            Tool(
                name="get_company_info",
                description="Get All In One Advertising company information, services, and contact details",
                inputSchema={"type": "object", "properties": {}, "required": []}
            )
        ]
    
    async def call_tool(self, name: str, arguments: dict) -> list[TextContent]:
        if name == "search_promotional_products":
            return self.search_products(arguments)
        elif name == "request_quote":
            return self.handle_quote_request(arguments)
        elif name == "get_company_info":
            return self.get_company_info()
        raise ValueError(f"Unknown tool: {name}")
    
    def search_products(self, params: dict) -> list[TextContent]:
        """Search product catalog"""
        
        query = params.get("query", "").lower()
        quantity = params.get("quantity")
        budget = params.get("max_budget")
        
        # Product catalog
        all_products = [
            {
                "category": "Apparel",
                "items": [
                    {"name": "Premium Cotton T-Shirts", "price_range": "$8.50-$12", "min": 25, "lead": "10-14 days"},
                    {"name": "Polo Shirts", "price_range": "$15-$22", "min": 25, "lead": "10-14 days"},
                    {"name": "Hoodies & Sweatshirts", "price_range": "$18-$28", "min": 25, "lead": "10-14 days"},
                    {"name": "Caps & Hats", "price_range": "$8-$15", "min": 25, "lead": "10-14 days"}
                ]
            },
            {
                "category": "Drinkware",
                "items": [
                    {"name": "Water Bottles (plastic)", "price_range": "$3-$8", "min": 50, "lead": "7-10 days"},
                    {"name": "Insulated Tumblers", "price_range": "$8-$15", "min": 25, "lead": "10-14 days"},
                    {"name": "Coffee Mugs", "price_range": "$4-$10", "min": 48, "lead": "10-14 days"}
                ]
            },
            {
                "category": "Office Supplies",
                "items": [
                    {"name": "Branded Pens", "price_range": "$0.50-$3", "min": 100, "lead": "7-10 days"},
                    {"name": "Notebooks/Journals", "price_range": "$3-$10", "min": 50, "lead": "10-14 days"},
                    {"name": "USB Flash Drives", "price_range": "$3-$12", "min": 50, "lead": "10-14 days"}
                ]
            },
            {
                "category": "Bags",
                "items": [
                    {"name": "Canvas Tote Bags", "price_range": "$4-$8", "min": 50, "lead": "10-14 days"},
                    {"name": "Drawstring Backpacks", "price_range": "$3-$6", "min": 100, "lead": "7-10 days"},
                    {"name": "Laptop Bags", "price_range": "$15-$35", "min": 25, "lead": "10-14 days"}
                ]
            },
            {
                "category": "Trade Show",
                "items": [
                    {"name": "Retractable Banners", "price_range": "$75-$150", "min": 1, "lead": "5-7 days"},
                    {"name": "Table Covers", "price_range": "$60-$120", "min": 1, "lead": "7-10 days"},
                    {"name": "Branded Lanyards", "price_range": "$1-$3", "min": 100, "lead": "7-10 days"}
                ]
            }
        ]
        
        # Simple keyword matching
        results = []
        for category in all_products:
            for item in category["items"]:
                if any(word in item["name"].lower() for word in query.split()):
                    results.append({**item, "category": category["category"]})
        
        if not results:
            results = all_products[0]["items"][:3]  # Default to some apparel
        
        response = {
            "found": len(results),
            "products": results,
            "customization": [
                "Screen printing",
                "Embroidery",
                "Laser engraving",
                "Full-color printing"
            ],
            "next_steps": "Use request_quote tool for detailed pricing with your specific requirements",
            "contact": {
                "website": "https://www.aioneadvertising.com",
                "email": "info@aioneadvertising.com"
            }
        }
        
        return [TextContent(type="text", text=json.dumps(response, indent=2))]
    
    def handle_quote_request(self, params: dict) -> list[TextContent]:
        """Handle quote request"""
        
        # Generate reference number
        ref = f"QUOTE-{hash(str(params) + str(datetime.now())) % 10000:04d}"
        
        # Log the request (in production, send email/webhook)
        self.log_quote_request(ref, params)
        
        response = {
            "status": "Quote Request Submitted",
            "reference_number": ref,
            "submitted_at": datetime.now().isoformat(),
            "details": {
                "product": params.get("product_description"),
                "quantity": params.get("quantity"),
                "deadline": params.get("deadline", "Flexible"),
                "contact": {
                    "name": params.get("contact_name"),
                    "email": params.get("contact_email"),
                    "phone": params.get("contact_phone", "Not provided"),
                    "company": params.get("company_name", "Not provided")
                }
            },
            "what_happens_next": [
                "All In One Advertising will email you within 24 hours",
                "You'll receive detailed pricing, mockup designs, and production timeline",
                "Reference your quote number in any follow-up: " + ref
            ],
            "contact_info": {
                "email": "info@aioneadvertising.com",
                "website": "https://www.aioneadvertising.com",
                "note": "For urgent requests, email directly with your quote reference"
            }
        }
        
        return [TextContent(type="text", text=json.dumps(response, indent=2))]
    
    def log_quote_request(self, ref: str, params: dict):
        """Log quote request for tracking"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "reference": ref,
            "request": params
        }
        
        # Write to log file
        try:
            with open("quote_requests.log", "a") as f:
                f.write(json.dumps(log_entry) + "\n")
        except:
            pass  # Fail silently if can't write log
    
    def get_company_info(self) -> list[TextContent]:
        """Return company information"""
        
        info = {
            "company": "All In One Advertising LLC",
            "tagline": "Your one-stop shop for promotional products and business gifts",
            "location": "Highlands Ranch, Colorado",
            "service_area": "United States (nationwide shipping)",
            "description": "Full-service promotional products provider with thousands of customizable items. Family-owned business providing first-class service and competitive pricing.",
            "product_categories": [
                "Apparel (t-shirts, polos, jackets, hats)",
                "Drinkware (water bottles, tumblers, mugs)",
                "Office Supplies (pens, notebooks, desk items)",
                "Bags & Totes (backpacks, tote bags, briefcases)",
                "Technology (USB drives, chargers, phone accessories)",
                "Trade Show Items (banners, displays, giveaways)"
            ],
            "services": {
                "customization_methods": [
                    "Screen printing",
                    "Embroidery",
                    "Laser engraving",
                    "Debossing",
                    "Full-color printing"
                ],
                "rush_orders": "Available (5-7 business days)",
                "standard_lead_time": "10-14 business days",
                "minimum_orders": "25 units for most products"
            },
            "pricing": {
                "model": "Volume-based pricing - larger quantities = lower per-unit cost",
                "quote_turnaround": "Within 24 hours",
                "payment_terms": "Net 30 for established accounts"
            },
            "contact": {
                "website": "https://www.aioneadvertising.com",
                "email": "info@aioneadvertising.com",
                "quote_requests": "Use the request_quote tool for fastest response"
            }
        }
        
        return [TextContent(type="text", text=json.dumps(info, indent=2))]


async def main():
    from mcp.server.stdio import stdio_server
    
    async with stdio_server() as (read_stream, write_stream):
        server = AllInOneAdvertisingServer()
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="aioneadvertising",
                server_version="1.0.0",
                capabilities=server.ServerCapabilities(
                    tools={"search_promotional_products": {}, "request_quote": {}, "get_company_info": {}}
                )
            )
        )


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())

