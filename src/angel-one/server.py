#!/usr/bin/env python3
"""
Angel One MCP Server

This server exposes Angel One trading and market data APIs as MCP tools.
It handles authentication automatically and provides comprehensive trading functionality.
"""

import os
import asyncio
import logging
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

import pyotp
from SmartApi.smartConnect import SmartConnect
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastMCP server
mcp = FastMCP("angel-one-trading")

# Global SmartConnect instance
smart_api: Optional[SmartConnect] = None
is_authenticated = False
current_refresh_token: Optional[str] = None

# Configuration from environment
API_KEY = os.getenv("ANGEL_ONE_API_KEY")
CLIENT_CODE = os.getenv("ANGEL_ONE_CLIENT_CODE") 
PASSWORD = os.getenv("ANGEL_ONE_PASSWORD")
TOTP_SECRET = os.getenv("ANGEL_ONE_TOTP_SECRET")

# Safety configurations
MAX_ORDER_QUANTITY = int(os.getenv("MAX_ORDER_QUANTITY", "10000"))
DRY_RUN_MODE = os.getenv("DRY_RUN_MODE", "false").lower() == "true"

def validate_environment():
    """Validate required environment variables"""
    required_vars = ["ANGEL_ONE_API_KEY", "ANGEL_ONE_CLIENT_CODE", "ANGEL_ONE_PASSWORD", "ANGEL_ONE_TOTP_SECRET"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        raise ValueError(f"Missing required environment variables: {missing_vars}")

async def ensure_authenticated():
    """Ensure the API client is authenticated"""
    global smart_api, is_authenticated, current_refresh_token
    
    if smart_api is None:
        validate_environment()
        smart_api = SmartConnect(api_key=API_KEY)
    
    if not is_authenticated:
        try:
            # Generate TOTP
            totp = pyotp.TOTP(TOTP_SECRET).now()
            
            # Generate session
            data = smart_api.generateSession(CLIENT_CODE, PASSWORD, totp)
            
            if data['status']:
                auth_token = data['data']['jwtToken']
                refresh_token = data['data']['refreshToken']
                smart_api.getfeedToken()
                
                # Remove 'Bearer ' prefix if present - Angel One API expects raw JWT
                if auth_token.startswith('Bearer '):
                    auth_token = auth_token[7:]
                    
                smart_api.setAccessToken(auth_token)
                smart_api.setRefreshToken(refresh_token)
                
                # Store refresh token globally for profile access
                current_refresh_token = refresh_token
                
                is_authenticated = True
                logger.info("Successfully authenticated with Angel One API")
                return True
            else:
                error_msg = f"Authentication failed: {data.get('message', 'Unknown error')}"
                logger.error(error_msg)
                raise Exception(error_msg)
                
        except Exception as e:
            error_msg = f"Authentication error: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
    
    return True

def handle_api_error(func_name: str, error: Exception) -> Dict[str, Any]:
    """Handle and format API errors with context"""
    error_context = {
        "function": func_name,
        "error_type": type(error).__name__,
        "error_message": str(error),
        "suggestion": "Check parameters and try again. Verify market hours for trading operations."
    }
    
    logger.error(f"API Error in {func_name}: {error}")
    return {"error": error_context}

# =============================================================================
# AUTHENTICATION & PROFILE TOOLS
# =============================================================================

@mcp.tool()
async def get_profile() -> Dict[str, Any]:
    """Get user profile information including account details, segment access, and trading permissions.
    
    Use this when user asks about:
    - Account information
    - Trading permissions
    - User profile details
    - Account status
    """
    try:
        await ensure_authenticated()
        profile = smart_api.getProfile(current_refresh_token)
        return profile
    except Exception as e:
        return handle_api_error("get_profile", e)

# =============================================================================
# PORTFOLIO TOOLS  
# =============================================================================

@mcp.tool()
async def get_holdings() -> Dict[str, Any]:
    """Get user's stock holdings and investment portfolio with current market values.
    
    Use this when user asks about:
    - "What stocks do I own?"
    - "Show my portfolio"
    - "My current holdings"
    - "Investment summary"
    - Current market value of investments
    """
    try:
        await ensure_authenticated()
        holdings = smart_api.holding()
        return holdings
    except Exception as e:
        return handle_api_error("get_holdings", e)

@mcp.tool()
async def get_all_holdings() -> Dict[str, Any]:
    """Get comprehensive holdings including family accounts and consolidated portfolio view.
    
    Use this when user asks about:
    - Complete family portfolio
    - All accounts holdings
    - Consolidated investment view
    - Family members' investments
    """
    try:
        await ensure_authenticated()
        all_holdings = smart_api.allholding()
        return all_holdings
    except Exception as e:
        return handle_api_error("get_all_holdings", e)

@mcp.tool()
async def get_positions() -> Dict[str, Any]:
    """Get user's current open trading positions (intraday and overnight positions).
    
    Use this when user asks about:
    - "What are my open positions?"
    - "Show my trading positions"
    - "Current P&L"
    - Intraday positions
    - Overnight positions
    - Position-wise profit/loss
    """
    try:
        await ensure_authenticated()
        positions = smart_api.position()
        return positions
    except Exception as e:
        return handle_api_error("get_positions", e)

@mcp.tool()
async def get_rms_limit() -> Dict[str, Any]:
    """Get Risk Management System limits including available margin, used margin, and buying power.
    
    Use this when user asks about:
    - "How much margin do I have?"
    - "Available funds for trading"
    - "My buying power"
    - "Used margin"
    - Risk limits
    - Available cash for trading
    """
    try:
        await ensure_authenticated()
        rms_limit = smart_api.rmsLimit()
        return rms_limit
    except Exception as e:
        return handle_api_error("get_rms_limit", e)

# =============================================================================
# TRADING TOOLS
# =============================================================================

@mcp.tool()
async def place_order(
    variety: str,
    tradingsymbol: str, 
    symboltoken: str,
    transactiontype: str,
    exchange: str,
    ordertype: str,
    producttype: str,
    duration: str,
    price: str,
    quantity: str,
    squareoff: str = "0",
    stoploss: str = "0"
) -> Dict[str, Any]:
    """Place a buy or sell trading order in the market.
    
    Use this when user wants to:
    - Buy or sell stocks/instruments
    - Place market orders
    - Place limit orders
    - Set stop loss orders
    - Execute trades
    
    IMPORTANT: Always confirm order details with user before placing real orders.
    
    Args:
        variety: Order variety (NORMAL, STOPLOSS, AMO, ROBO)
        tradingsymbol: Trading symbol (e.g., SBIN-EQ for State Bank equity)
        symboltoken: Unique symbol token for the instrument
        transactiontype: BUY or SELL
        exchange: Exchange (NSE, BSE, NFO, MCX)
        ordertype: Order type (MARKET, LIMIT, STOPLOSS_LIMIT, STOPLOSS_MARKET)
        producttype: Product type (DELIVERY, CARRYFORWARD, MARGIN, INTRADAY, BO)
        duration: Order duration (DAY, IOC)
        price: Order price (use "0" for market orders)
        quantity: Number of shares/contracts to trade
        squareoff: Square off price for bracket orders (optional)
        stoploss: Stop loss price for risk management (optional)
    """
    try:
        await ensure_authenticated()
        
        # Safety check
        if int(quantity) > MAX_ORDER_QUANTITY:
            return {"error": f"Order quantity {quantity} exceeds maximum allowed {MAX_ORDER_QUANTITY}"}
        
        order_params = {
            "variety": variety,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "transactiontype": transactiontype,
            "exchange": exchange,
            "ordertype": ordertype,
            "producttype": producttype,
            "duration": duration,
            "price": price,
            "quantity": quantity,
            "squareoff": squareoff,
            "stoploss": stoploss
        }
        
        if DRY_RUN_MODE:
            return {"status": "dry_run", "message": "Order would be placed", "params": order_params}
        
        response = smart_api.placeOrder(order_params)
        if isinstance(response, str):
            return {"status": "success", "order_id": response}
        return response
        
    except Exception as e:
        return handle_api_error("place_order", e)

@mcp.tool()
async def modify_order(
    orderid: str,
    variety: str,
    tradingsymbol: str,
    symboltoken: str, 
    transactiontype: str,
    exchange: str,
    ordertype: str,
    producttype: str,
    duration: str,
    price: str,
    quantity: str
) -> Dict[str, Any]:
    """Modify an existing order
    
    Args:
        orderid: Order ID to modify
        variety: Order variety
        tradingsymbol: Trading symbol
        symboltoken: Symbol token
        transactiontype: BUY or SELL
        exchange: Exchange
        ordertype: Order type
        producttype: Product type
        duration: Order duration
        price: New price
        quantity: New quantity
    """
    try:
        await ensure_authenticated()
        
        modify_params = {
            "orderid": orderid,
            "variety": variety,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "transactiontype": transactiontype,
            "exchange": exchange,
            "ordertype": ordertype,
            "producttype": producttype,
            "duration": duration,
            "price": price,
            "quantity": quantity
        }
        
        if DRY_RUN_MODE:
            return {"status": "dry_run", "message": "Order would be modified", "params": modify_params}
        
        response = smart_api.modifyOrder(modify_params)
        return response
        
    except Exception as e:
        return handle_api_error("modify_order", e)

@mcp.tool()
async def cancel_order(order_id: str, variety: str) -> Dict[str, Any]:
    """Cancel an existing order
    
    Args:
        order_id: Order ID to cancel
        variety: Order variety (NORMAL, STOPLOSS, AMO, ROBO)
    """
    try:
        await ensure_authenticated()
        
        if DRY_RUN_MODE:
            return {"status": "dry_run", "message": f"Order {order_id} would be cancelled"}
        
        response = smart_api.cancelOrder(order_id=order_id, variety=variety)
        return response
        
    except Exception as e:
        return handle_api_error("cancel_order", e)

@mcp.tool()
async def get_order_book() -> Dict[str, Any]:
    """Get complete order book showing all placed orders with their current status.
    
    Use this when user asks about:
    - "Show my orders"
    - "Order history"
    - "What orders have I placed?"
    - "Order status"
    - Pending orders
    - Executed orders
    - Cancelled orders
    """
    try:
        await ensure_authenticated()
        order_book = smart_api.orderBook()
        return order_book
    except Exception as e:
        return handle_api_error("get_order_book", e)

@mcp.tool()
async def get_trade_book() -> Dict[str, Any]:
    """Get trade book showing all executed trades with transaction details and P&L.
    
    Use this when user asks about:
    - "Show my trades"
    - "Executed trades"
    - "Trading history"
    - "What trades were executed?"
    - Trade-wise profit/loss
    - Transaction history
    """
    try:
        await ensure_authenticated()
        trade_book = smart_api.tradeBook()
        return trade_book
    except Exception as e:
        return handle_api_error("get_trade_book", e)

# =============================================================================
# MARKET DATA TOOLS
# =============================================================================

@mcp.tool()
async def get_ltp_data(exchange: str, tradingsymbol: str, symboltoken: str) -> Dict[str, Any]:
    """Get real-time Last Traded Price (LTP) and basic market data for a specific stock/instrument.
    
    Use this when user asks about:
    - "What's the current price of [stock]?"
    - "Show me live price"
    - "Current market price"
    - Real-time quotes
    - Last traded price
    
    Args:
        exchange: Exchange (NSE, BSE, NFO, MCX)
        tradingsymbol: Trading symbol (e.g., RELIANCE-EQ, NIFTY-INDEX)
        symboltoken: Unique symbol token for the instrument
    """
    try:
        await ensure_authenticated()
        ltp_data = smart_api.ltpData(exchange, tradingsymbol, symboltoken)
        return ltp_data
    except Exception as e:
        return handle_api_error("get_ltp_data", e)

@mcp.tool()
async def get_candle_data(
    exchange: str,
    symboltoken: str,
    interval: str,
    fromdate: str,
    todate: str
) -> Dict[str, Any]:
    """Get historical candlestick (OHLC) data for technical analysis and charting.
    
    Use this when user asks about:
    - "Show me chart data for [stock]"
    - "Historical price data"
    - "OHLC data"
    - Technical analysis
    - Price trends
    - Historical performance
    - Candlestick patterns
    
    Args:
        exchange: Exchange (NSE, BSE, NFO, MCX)
        symboltoken: Symbol token (get from search_scrip first)
        interval: Time interval (ONE_MINUTE, FIVE_MINUTE, FIFTEEN_MINUTE, THIRTY_MINUTE, SIXTY_MINUTE, ONE_DAY)
        fromdate: Start date in YYYY-MM-DD HH:MM format (e.g., "2024-01-01 09:15")
        todate: End date in YYYY-MM-DD HH:MM format (e.g., "2024-01-31 15:30")
    """
    try:
        await ensure_authenticated()
        
        historic_params = {
            "exchange": exchange,
            "symboltoken": symboltoken,
            "interval": interval,
            "fromdate": fromdate,
            "todate": todate
        }
        
        candle_data = smart_api.getCandleData(historic_params)
        return candle_data
        
    except Exception as e:
        return handle_api_error("get_candle_data", e)

@mcp.tool()
async def search_scrip(exchange: str, searchscrip: str) -> Dict[str, Any]:
    """Search for stocks, indices, or instruments to get their trading details and symbol tokens.
    
    Use this when user asks about:
    - "Find symbol for [company name]"
    - "Search for [stock name]"
    - "Get trading symbol for [company]"
    - "What's the symbol token for [stock]?"
    - Finding instrument details
    
    This is essential before placing orders or getting market data - use this to find correct
    tradingsymbol and symboltoken required for other operations.
    
    Args:
        exchange: Exchange to search in (NSE, BSE, NFO, MCX)
        searchscrip: Company name or partial symbol (e.g., "RELIANCE", "TATA", "NIFTY")
    """
    try:
        await ensure_authenticated()
        response = smart_api.searchScrip(exchange=exchange, searchscrip=searchscrip)
        return response
    except Exception as e:
        return handle_api_error("search_scrip", e)

# =============================================================================
# GTT (Good Till Triggered) TOOLS
# =============================================================================

@mcp.tool()
async def create_gtt_rule(
    tradingsymbol: str,
    symboltoken: str,
    exchange: str,
    producttype: str,
    transactiontype: str,
    price: float,
    qty: int,
    disclosedqty: int,
    triggerprice: float,
    timeperiod: int
) -> Dict[str, Any]:
    """Create a GTT (Good Till Triggered) rule for automated trading when price conditions are met.
    
    Use this when user wants to:
    - "Set a trigger order"
    - "Buy/sell when price reaches X"
    - "Create conditional order"
    - "Set price alerts with auto-trading"
    - Advanced order management
    - Automated trading rules
    
    GTT rules execute automatically when trigger conditions are met, useful for:
    - Stop loss orders
    - Target price orders
    - Breakout trading
    - Support/resistance level trading
    
    Args:
        tradingsymbol: Trading symbol (e.g., SBIN-EQ)
        symboltoken: Symbol token
        exchange: Exchange (NSE, BSE, NFO, MCX)
        producttype: Product type (DELIVERY, INTRADAY, etc.)
        transactiontype: BUY or SELL
        price: Order execution price
        qty: Quantity to trade
        disclosedqty: Disclosed quantity
        triggerprice: Price level that triggers the order
        timeperiod: Rule validity in days
    """
    try:
        await ensure_authenticated()
        
        gtt_params = {
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "exchange": exchange,
            "producttype": producttype,
            "transactiontype": transactiontype,
            "price": price,
            "qty": qty,
            "disclosedqty": disclosedqty,
            "triggerprice": triggerprice,
            "timeperiod": timeperiod
        }
        
        if DRY_RUN_MODE:
            return {"status": "dry_run", "message": "GTT rule would be created", "params": gtt_params}
        
        rule_id = smart_api.gttCreateRule(gtt_params)
        if isinstance(rule_id, str):
            return {"status": "success", "rule_id": rule_id}
        return rule_id
        
    except Exception as e:
        return handle_api_error("create_gtt_rule", e)

@mcp.tool()
async def get_gtt_list(status: List[str], page: int = 1, count: int = 10) -> Dict[str, Any]:
    """Get list of GTT rules
    
    Args:
        status: List of status filters (e.g., ["FORALL"])
        page: Page number
        count: Number of records per page
    """
    try:
        await ensure_authenticated()
        gtt_list = smart_api.gttLists(status=status, page=page, count=count)
        return gtt_list
    except Exception as e:
        return handle_api_error("get_gtt_list", e)

# =============================================================================
# MARKET ANALYSIS TOOLS
# =============================================================================

@mcp.tool()
async def get_option_greek(name: str, expirydate: str) -> Dict[str, Any]:
    """Get option Greeks for an underlying
    
    Args:
        name: Underlying name (e.g., NIFTY)
        expirydate: Expiry date (e.g., 25JAN2024)
    """
    try:
        await ensure_authenticated()
        
        greek_params = {
            "name": name,
            "expirydate": expirydate
        }
        
        greeks = smart_api.optionGreek(greek_params)
        return greeks
        
    except Exception as e:
        return handle_api_error("get_option_greek", e)

@mcp.tool()
async def get_gainers_losers(datatype: str, expirytype: str = "NEAR") -> Dict[str, Any]:
    """Get top gainers, losers, or high OI (Open Interest) stocks for market analysis.
    
    Use this when user asks about:
    - "Show me top gainers today"
    - "What are the biggest losers?"
    - "Top performing stocks"
    - "Market movers"
    - "High volume stocks"
    - "Stocks with high open interest"
    - Market analysis and screening
    
    Args:
        datatype: Type of data (PercGainers, PercLosers, PercOIGainers)
        expirytype: For derivatives - expiry type (NEAR, NEXT, FAR)
    """
    try:
        await ensure_authenticated()
        
        gl_params = {
            "datatype": datatype,
            "expirytype": expirytype
        }
        
        gainers_losers = smart_api.gainersLosers(gl_params)
        return gainers_losers
        
    except Exception as e:
        return handle_api_error("get_gainers_losers", e)

@mcp.tool()
async def get_put_call_ratio() -> Dict[str, Any]:
    """Get Put-Call Ratio (PCR) - a key market sentiment indicator.
    
    Use this when user asks about:
    - "What's the market sentiment?"
    - "Put call ratio"
    - "PCR data"
    - "Market mood indicator"
    - "Bullish or bearish sentiment"
    - Options market analysis
    
    PCR interpretation:
    - PCR > 1: Bearish sentiment (more puts than calls)
    - PCR < 1: Bullish sentiment (more calls than puts)
    - PCR around 1: Neutral sentiment
    """
    try:
        await ensure_authenticated()
        pcr = smart_api.putCallRatio()
        return pcr
    except Exception as e:
        return handle_api_error("get_put_call_ratio", e)

# =============================================================================
# UTILITY TOOLS
# =============================================================================

@mcp.tool()
async def convert_position(
    exchange: str,
    oldproducttype: str,
    newproducttype: str,
    tradingsymbol: str,
    transactiontype: str,
    quantity: int,
    type: str
) -> Dict[str, Any]:
    """Convert position from one product type to another
    
    Args:
        exchange: Exchange
        oldproducttype: Current product type
        newproducttype: Target product type
        tradingsymbol: Trading symbol
        transactiontype: BUY or SELL
        quantity: Quantity to convert
        type: Conversion type (DAY)
    """
    try:
        await ensure_authenticated()
        
        position_params = {
            "exchange": exchange,
            "oldproducttype": oldproducttype,
            "newproducttype": newproducttype,
            "tradingsymbol": tradingsymbol,
            "transactiontype": transactiontype,
            "quantity": quantity,
            "type": type
        }
        
        if DRY_RUN_MODE:
            return {"status": "dry_run", "message": "Position would be converted", "params": position_params}
        
        response = smart_api.convertPosition(position_params)
        return response
        
    except Exception as e:
        return handle_api_error("convert_position", e)

@mcp.tool()
async def estimate_charges(orders: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Estimate brokerage and charges for trades
    
    Args:
        orders: List of order dictionaries with keys: product_type, transaction_type, quantity, price, exchange, symbol_name, token
    """
    try:
        await ensure_authenticated()
        
        charge_params = {"orders": orders}
        charges = smart_api.estimateCharges(charge_params)
        return charges
        
    except Exception as e:
        return handle_api_error("estimate_charges", e)

# =============================================================================
# SERVER STARTUP
# =============================================================================
def main():
    """Main entry point for the MCP server"""
    try:
        validate_environment()
        logger.info("Angel One MCP Server starting...")
        logger.info(f"DRY RUN MODE: {DRY_RUN_MODE}")
        logger.info(f"MAX ORDER QUANTITY: {MAX_ORDER_QUANTITY}")
        
        # Run the FastMCP server
        mcp.run(transport='stdio')
        
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        exit(1)

if __name__ == "__main__":
    main()