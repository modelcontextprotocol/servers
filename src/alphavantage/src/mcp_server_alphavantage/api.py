import os

import httpx
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("ALPHAVANTAGE_API_KEY")
if not API_KEY:
    raise ValueError("ALPHAVANTAGE_API_KEY environment variable required")

API_BASE_URL = "https://www.alphavantage.co/query"


#####
# Core Stock APIs
#####
async def fetch_intraday(
    symbol: str,
    interval: str = "60min",
    datatype: str = "json",
    adjusted: bool = True,
    extended_hours: bool = True,
    outputsize: str = "compact",
    month: str = None,
) -> dict[str, str] | str:
    """
    Fetch intraday stock data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data (default: "5min").
    :argument: datatype (str): The response data type (default: "json").
    :argument: adjusted (bool): The adjusted data flag (default: True).
    :argument: extended_hours (bool): The extended hours flag (default: True).
    :argument: outputsize (str): The output size for the data (default: "compact").
    :argument: month (str): The month of the data (default: None).

    :returns: The intraday stock data.
    """

    https_params = {
        "function": "TIME_SERIES_INTRADAY",
        "symbol": symbol,
        "interval": interval,
        "datatype": datatype,
        "adjusted": adjusted,
        "outputsize": outputsize,
        "extended_hours": extended_hours,
        "month": month,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_time_series_daily(
    symbol: str, datatype: str = "json", outputsize: str = "compact"
) -> dict[str, str] | str:
    """
    Fetch daily stock data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The daily stock data.
    """

    https_params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": symbol,
        "datatype": datatype,
        "outputsize": outputsize,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_time_series_daily_adjusted(
    symbol: str, datatype: str = "json", outputsize: str = "compact"
) -> dict[str, str] | str:
    """
    Fetch daily adjusted stock data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The daily adjusted stock data.
    """

    https_params = {
        "function": "TIME_SERIES_DAILY_ADJUSTED",
        "symbol": symbol,
        "datatype": datatype,
        "outputsize": outputsize,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_time_series_weekly(
    symbol: str, datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch weekly stock data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The weekly stock data.
    """

    https_params = {
        "function": "TIME_SERIES_WEEKLY",
        "symbol": symbol,
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_time_series_weekly_adjusted(
    symbol: str, datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch weekly adjusted stock data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The weekly adjusted stock data.
    """

    https_params = {
        "function": "TIME_SERIES_WEEKLY_ADJUSTED",
        "symbol": symbol,
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_time_series_monthly(
    symbol: str, datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch monthly stock data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The monthly stock data.
    """

    https_params = {
        "function": "TIME_SERIES_MONTHLY",
        "symbol": symbol,
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_time_series_monthly_adjusted(
    symbol: str, datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch monthly adjusted stock data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The monthly adjusted stock data.
    """

    https_params = {
        "function": "TIME_SERIES_MONTHLY_ADJUSTED",
        "symbol": symbol,
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_quote(symbol: str, datatype: str = "json") -> dict[str, str] | str:
    """
    Fetch a stock quote from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The stock quote data.
    """

    https_params = {
        "function": "GLOBAL_QUOTE",
        "symbol": symbol,
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_realtime_bulk_quotes(
    symbols: list[str], datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch real-time bulk stock quotes from the Alpha Vantage API.

    :argument: symbols (list[str]): The stock symbols to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The real-time bulk stock quotes.
    """

    https_params = {
        "function": "REALTIME_BULK_QUOTES",
        "symbols": ",".join(symbols[:100]),
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def search_endpoint(
    keywords: str, datatype: str = "json"
) -> dict[str, str] | str:
    """
    Search for endpoints from the Alpha Vantage API.

    :argument: keywords (str): The search keywords.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The search results.
    """

    https_params = {
        "function": "SYMBOL_SEARCH",
        "keywords": keywords,
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_market_status() -> dict[str, str] | str:
    """
    Fetch the market status from the Alpha Vantage API.

    :returns: The market status.
    """

    https_params = {"function": "MARKET_STATUS", "apikey": API_KEY}
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


#####
# Options data APIs
#####


async def fetch_realtime_options(
    symbol: str, datatype: str = "json", contract: str = None
) -> dict[str, str] | str:
    """
    Fetch real-time options data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").
    :argument: contract (str): The contract ID (default: None)

    :returns: The real-time options' data.
    """

    https_params = {
        "function": "REALTIME_OPTIONS",
        "symbol": symbol,
        "datatype": datatype,
        "contract": contract,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_historical_options(
    symbol: str, datatype: str = "json", date: str = None
) -> dict[str, str] | str:
    """
    Fetch historical options data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").
    :argument: date (str): The date of the historical options (default: None)
    """

    https_params = {
        "function": "HISTORICAL_OPTIONS",
        "symbol": symbol,
        "datatype": datatype,
        "date": date,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


#####
# Alpha Intelligence APIs
#####


async def fetch_news_sentiment(
    tickers: list[str],
    datatype: str = "json",
    topics: list[str] = None,
    time_from: str = None,
    time_to: str = None,
    sort: str = "LATEST",
    limit: int = 50,
) -> dict[str, str] | str:
    """
    Fetch news sentiment data from the Alpha Vantage API.

    :argument: tickers (list[str]): The stock tickers to fetch.
    :argument: datatype (str): The response data type (default: "json").
    :argument: topics (list[str]): The news topics (default: None).
    :argument: time_from (str): The start time (default: None).
    :argument: time_to (str): The end time (default: None).
    :argument: sort (str): The sort order (default: "LATEST").
    :argument: limit (int): The number of news articles to fetch (default: 50).

    :returns: The news sentiment data.
    """

    https_params = {
        "function": "NEWS_SENTIMENT",
        "tickers": ",".join(tickers),
        "datatype": datatype,
        "topics": ",".join(topics) if topics else None,
        "time_from": time_from,
        "time_to": time_to,
        "sort": sort,
        "limit": limit,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_top_gainer_losers() -> dict[str, str]:
    """
    Fetch the top gainers or losers from the Alpha Vantage API.

    :returns: The top gainers or losers data.
    """

    https_params = {
        "function": "TOP_GAINERS_LOSERS",
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_insider_transactions(symbol: str) -> dict[str, str]:
    """
    Fetch insider transactions from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: insider transactions' data.
    """

    https_params = {
        "function": "INSIDER_TRANSACTIONS",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_analytics_fixed_window(
    symbols: list[str],
    interval: str,
    series_range: str = "full",
    ohlc: str = "close",
    calculations: list[str] = None,
) -> dict[str, str]:
    """
    Fetch analytics data from the Alpha Vantage API.

    :argument: symbol (list[str]): The stock symbols to fetch.
    :argument: range (str): The range of the data (default: "full").
    :argument: interval (str): The time interval for the data.
    :argument: ohlc (str): The OHLC data type (default: "close").
    :argument: calculations (list[str]): The analytics calculations (default: None).

    :returns: The analytics data.
    """

    https_params = {
        "function": "ANALYTICS_FIXED_WINDOW",
        "symbol": ",".join(symbols),
        "range": series_range,
        "interval": interval,
        "ohlc": ohlc,
        "calculations": ",".join(calculations) if calculations else None,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_analytics_sliding_window(
    symbols: list[str],
    series_range: str = "full",
    ohlc: str = "close",
    interval: str = None,
    window_size: int = 10,
    calculations: list[str] = None,
) -> dict[str, str]:
    """
    Fetch analytics data from the Alpha Vantage API.

    :argument: symbol (list[str]): The stock symbols to fetch.

    :returns: The analytics data.
    """

    https_params = {
        "function": "ANALYTICS_SLIDING_WINDOW",
        "symbols": ",".join(symbols),
        "range": series_range,
        "ohlc": ohlc,
        "interval": interval,
        "window_size": window_size,
        "calculations": ",".join(calculations) if calculations else None,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


#####
# Fundamental data APIs
#####


async def fetch_company_overview(symbol: str) -> dict[str, str]:
    """
    Fetch company overview data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: The company overview data.
    """

    https_params = {
        "function": "OVERVIEW",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_etf_profile(symbol: str) -> dict[str, str]:
    """
    Fetch ETC profile from Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: The company overview data.
    """

    https_params = {
        "function": "ETF_PROFILE",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def company_dividends(symbol: str) -> dict[str, str]:
    """
    Fetch company dividends data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: The company dividends data.
    """

    https_params = {
        "function": "DIVIDENDS",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_company_splits(symbol: str) -> dict[str, str]:
    """
    Fetch company splits data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: The company splits data.
    """

    https_params = {
        "function": "SPLITS",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_income_statement(symbol: str) -> dict[str, str]:
    """
    Fetch company income statement data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: The company income statement data.
    """

    https_params = {
        "function": "INCOME_STATEMENT",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_balance_sheet(symbol: str) -> dict[str, str]:
    """
    Fetch company balance sheet data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: The company balance sheet data.
    """

    https_params = {
        "function": "BALANCE_SHEET",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_cash_flow(symbol: str) -> dict[str, str]:
    """
    Fetch company cash flow data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: The company cash flow data.
    """

    https_params = {
        "function": "CASH_FLOW",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_earnings(symbol: str) -> dict[str, str]:
    """
    Fetch company earnings data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.

    :returns: The company earnings data.
    """

    https_params = {
        "function": "EARNINGS",
        "symbol": symbol,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_listing_status(
    symbol: str, date: str = None, state: str = "active"
) -> dict[str, str]:
    """
    Fetch company listing status data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: date (str): The date of the listing status (default: None).
    :argument: state (str): The listing status state (default: "active").

    :returns: The company listing status data.
    """

    https_params = {
        "function": "LISTING_STATUS",
        "symbol": symbol,
        "date": date,
        "state": state,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_earnings_calendar(
    symbol: str, horizon: str = "3month"
) -> dict[str, str]:
    """
    Fetch company earning calendar data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: horizon (str): The earning calendar horizon (default: "3month").

    :returns: The company earning calendar data.
    """

    https_params = {
        "function": "EARNINGS_CALENDAR",
        "symbol": symbol,
        "horizon": horizon,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_ipo_calendar() -> str:
    """
    Fetch IPO calendar data from the Alpha Vantage API.

    :returns: The IPO calendar data.
    """

    https_params = {
        "function": "IPO_CALENDAR",
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text


#####
# Forex data APIs
#####


async def fetch_exchange_rate(
    from_currency: str, to_currency: str
) -> dict[str, str] | str:
    """
    Fetch exchange rate data from the Alpha Vantage API.

    :argument: from_currency (str): The source currency.
    :argument: to_currency (str): The destination currency.

    :returns: The exchange rate data.
    """

    https_params = {
        "function": "CURRENCY_EXCHANGE_RATE",
        "from_currency": from_currency,
        "to_currency": to_currency,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.json()


async def fetch_fx_intraday(
    from_symbol: str,
    to_symbol: str,
    interval: str = None,
    outputsize: str = "compact",
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch intraday forex data from the Alpha Vantage API.

    :argument: from_symbol (str): The source currency.
    :argument: to_symbol (str): The destination currency.
    :argument: interval (str): The time interval for the data (default: None).
    :argument: outputsize (str): The output size for the data (default: "compact").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday forex data.
    """

    https_params = {
        "function": "FX_INTRADAY",
        "from_symbol": from_symbol,
        "to_symbol": to_symbol,
        "interval": interval,
        "datatype": datatype,
        "outputsize": outputsize,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_fx_daily(
    from_symbol: str,
    to_symbol: str,
    datatype: str = "json",
    outputsize: str = "compact",
) -> dict[str, str] | str:
    """
    Fetch daily forex data from the Alpha Vantage API.

    :argument: from_symbol (str): The source currency.
    :argument: to_symbol (str): The destination currency.
    :argument: datatype (str): The response data type (default: "json").
    :argument: outputsize (str): The output size for the data (default: "compact").

    :returns: The daily forex data.
    """

    https_params = {
        "function": "FX_DAILY",
        "from_symbol": from_symbol,
        "to_symbol": to_symbol,
        "datatype": datatype,
        "outputsize": outputsize,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_fx_weekly(
    from_symbol: str, to_symbol: str, datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch weekly forex data from the Alpha Vantage API.

    :argument: from_symbol (str): The source currency.
    :argument: to_symbol (str): The destination currency.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The weekly forex data.
    """

    https_params = {
        "function": "FX_WEEKLY",
        "from_symbol": from_symbol,
        "to_symbol": to_symbol,
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_fx_monthly(
    from_symbol: str, to_symbol: str, datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch monthly forex data from the Alpha Vantage API.

    :argument: from_symbol (str): The source currency.
    :argument: to_symbol (str): The destination currency.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The monthly forex data.
    """

    https_params = {
        "function": "FX_MONTHLY",
        "from_symbol": from_symbol,
        "to_symbol": to_symbol,
        "datatype": datatype,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


#####
# Crypto data APIs
#####


async def fetch_digital_currency_intraday(
    symbol: str,
    market: str,
    interval: str = None,
    datatype: str = "json",
    outputsize: str = "compact",
) -> dict[str, str] | str:
    """
    Fetch intraday digital currency data from the Alpha Vantage API.

    :argument: symbol (str): The digital currency symbol to fetch.
    :argument: market (str): The market symbol to fetch.
    :argument: interval (str): The time interval for the data (default: "5min").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday digital currency data.
    """

    https_params = {
        "function": "CRYPTO_INTRADAY",
        "symbol": symbol,
        "market": market,
        "interval": interval,
        "datatype": datatype,
        "outputsize": outputsize,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_digital_currency_daily(symbol: str, market: str) -> str:
    """
    Fetch daily digital currency data from the Alpha Vantage API.

    :argument: symbol (str): The digital currency symbol to fetch.
    :argument: market (str): The market symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The daily digital currency data.
    """

    https_params = {
        "function": "DIGITAL_CURRENCY_DAILY",
        "symbol": symbol,
        "market": market,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text


async def fetch_digital_currency_weekly(symbol: str, market: str) -> str:
    """
    Fetch weekly digital currency data from the Alpha Vantage API.

    :argument: symbol (str): The digital currency symbol to fetch.
    :argument: market (str): The market symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The weekly digital currency data.
    """

    https_params = {
        "function": "DIGITAL_CURRENCY_WEEKLY",
        "symbol": symbol,
        "market": market,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text


async def fetch_digital_currency_monthly(symbol: str, market: str) -> str:
    """
    Fetch monthly digital currency data from the Alpha Vantage API.

    :argument: symbol (str): The digital currency symbol to fetch.
    :argument: market (str): The market symbol to fetch.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The monthly digital currency data.
    """

    https_params = {
        "function": "DIGITAL_CURRENCY_MONTHLY",
        "symbol": symbol,
        "market": market,
        "apikey": API_KEY,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text


#####
# Commodities data APIs
#####


async def fetch_wti_crude(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch crude oil (WTI) data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday crude oil (WTI) data.
    """

    https_params = {
        "function": "WTI",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_brent_crude(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch Brent crude oil data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday Brent crude oil data.
    """

    https_params = {
        "function": "BRENT",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_natural_gas(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch Henry Hub natural gas data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday natural gas data.
    """

    https_params = {
        "function": "NATURAL_GAS",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_copper(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch global copper data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday copper data.
    """

    https_params = {
        "function": "COPPER",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_aluminum(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch global aluminum data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday aluminum data.
    """

    https_params = {
        "function": "ALUMINUM",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_wheat(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch global wheat data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday wheat data.
    """

    https_params = {
        "function": "WHEAT",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_corn(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch global corn data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday corn data.
    """

    https_params = {
        "function": "CORN",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_cotton(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch global cotton data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday cotton data.
    """

    https_params = {
        "function": "COTTON",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_sugar(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch global sugar data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday sugar data.
    """

    https_params = {
        "function": "SUGAR",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_coffee(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch global coffee data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The intraday coffee data.
    """

    https_params = {
        "function": "COFFEE",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_all_commodities(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch global commodities data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: Global commodities data.
    """

    https_params = {
        "function": "ALL_COMMODITIES",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


#####
# Economic data APIs
#####


async def fetch_real_gdp(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch real GDP data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The real GDP data.
    """

    https_params = {
        "function": "REAL_GDP",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_real_gdp_per_capita(datatype: str = "json") -> dict[str, str] | str:
    """
    Fetch real GDP per capita data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The real GDP per capita data.
    """

    https_params = {
        "function": "REAL_GDP_PER_CAPITA",
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_treasury_yield(
    interval: str = "monthly", maturity: str = "10year", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch treasure yield data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: maturity (str): The maturity period for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The treasure yield data.
    """

    https_params = {
        "function": "TREASURY_YIELD",
        "interval": interval,
        "maturity": maturity,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_federal_funds_rate(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch federal funds rate data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The federal funds rate data.
    """

    https_params = {
        "function": "FEDERAL_FUNDS_RATE",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_cpi(
    interval: str = "monthly", datatype: str = "json"
) -> dict[str, str] | str:
    """
    Fetch consumer price index (CPI) data from the Alpha Vantage API.

    :argument: interval (str): The time interval for the data (default: "monthly").
    :argument: datatype (str): The response data type (default: "json").

    :returns: The consumer price index (CPI) data.
    """

    https_params = {
        "function": "CPI",
        "interval": interval,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_inflation(datatype: str = "json") -> dict[str, str] | str:
    """
    Fetch inflation data from the Alpha Vantage API.

    :argument: datatype (str): The response data type (default: "json").

    :returns: The inflation data.
    """

    https_params = {
        "function": "INFLATION",
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_retail_sales(datatype: str = "json") -> dict[str, str] | str:
    """
    Fetch retail sales data from the Alpha Vantage API.

    :argument: datatype (str): The response data type (default: "json").

    :returns: The retail sales data.
    """

    https_params = {
        "function": "RETAIL_SALES",
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_durables(datatype: str = "json") -> dict[str, str] | str:
    """
    Fetch durable goods data from the Alpha Vantage API.

    :argument: datatype (str): The response data type (default: "json").

    :returns: The durable goods data.
    """

    https_params = {
        "function": "DURABLES",
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_unemployment(datatype: str = "json") -> dict[str, str] | str:
    """
    Fetch unemployment data from the Alpha Vantage API.

    :argument: datatype (str): The response data type (default: "json").

    :returns: The unemployment data.
    """

    https_params = {
        "function": "UNEMPLOYMENT",
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_nonfarm_payrolls(datatype: str = "json") -> dict[str, str] | str:
    """
    Fetch nonfarm payrolls data from the Alpha Vantage API.

    :argument: datatype (str): The response data type (default: "json").

    :returns: The nonfarm payrolls' data.
    """

    https_params = {
        "function": "NONFARM_PAYROLL",
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


#####
# Technical indicators APIs
#####


async def fetch_sma(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch simple moving average (SMA) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The simple moving average (SMA) data.
    """

    https_params = {
        "function": "SMA",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ema(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch exponential moving average (EMA) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The exponential moving average (EMA) data.
    """

    https_params = {
        "function": "EMA",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_wma(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch weighted moving average (WMA) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The weighted moving average (WMA) data.
    """

    https_params = {
        "function": "WMA",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_dema(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch double exponential moving average (DEMA) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The double exponential moving average (DEMA) data.
    """

    https_params = {
        "function": "DEMA",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_tema(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch triple exponential moving average (TEMA) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The triple exponential moving average (TEMA) data.
    """

    https_params = {
        "function": "TEMA",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_trima(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch triangular moving average (TRIMA) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The triangular moving average (TRIMA) data.
    """

    https_params = {
        "function": "TRIMA",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_kama(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Kaufman adaptive moving average (KAMA) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The Kaufman adaptive moving average (KAMA) data.
    """

    https_params = {
        "function": "KAMA",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_mama(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = None,
    fastlimit: float = 0.01,
    slowlimit: float = 0.01,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch MESA adaptive moving average (MAMA) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: fastlimit (float): The fast limit for the data.
    :argument: slowlimit (float): The slow limit for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The MESA adaptive moving average (MAMA) data.
    """

    https_params = {
        "function": "MAMA",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "fastlimit": fastlimit,
        "slowlimit": slowlimit,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_vwap(
    symbol: str,
    interval: str = None,
    month: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch volume weighted average price (VWAP) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The volume weighted average price (VWAP) data.
    """

    https_params = {
        "function": "VWAP",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_t3(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch triple exponential moving average (T3) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The triple exponential moving average (T3) data.
    """

    https_params = {
        "function": "T3",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_macd(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = None,
    fastperiod: int = 12,
    slowperiod: int = 26,
    signalperiod: int = 9,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch moving average convergence divergence (MACD) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: fastperiod (int): The fast period for the data.
    :argument: slowperiod (int): The slow period for the data.
    :argument: signalperiod (int): The signal period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The moving average convergence divergence (MACD) data.
    """

    https_params = {
        "function": "MACD",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "fastperiod": fastperiod,
        "slowperiod": slowperiod,
        "signalperiod": signalperiod,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_macdext(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = None,
    fastperiod: int = 12,
    slowperiod: int = 26,
    signalperiod: int = 9,
    fastmatype: int = 0,
    slowmatype: int = 0,
    signalmatype: int = 0,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch moving average convergence divergence with controllable moving average type (MACDEXT) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: fastperiod (int): The fast period for the data.
    :argument: slowperiod (int): The slow period for the data.
    :argument: signalperiod (int): The signal period for the data.
    :argument: fastmatype (int): The fast moving average type for the data.
    :argument: slowmatype (int): The slow moving average type for the data.
    :argument: signalmatype (int): The signal moving average type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The moving average convergence divergence with controllable moving average type (MACDEXT) data.
    """

    https_params = {
        "function": "MACDEXT",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "fastperiod": fastperiod,
        "slowperiod": slowperiod,
        "signalperiod": signalperiod,
        "fastmatype": fastmatype,
        "slowmatype": slowmatype,
        "signalmatype": signalmatype,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_stoch(
    symbol: str,
    interval: str = None,
    month: str = None,
    fastkperiod: int = 5,
    slowkperiod: int = 3,
    slowdperiod: int = 3,
    slowkmatype: int = 0,
    slowdmatype: int = 0,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch stochastic oscillator (STOCH) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: fastkperiod (int): The fast K period for the data.
    :argument: slowkperiod (int): The slow K period for the data.
    :argument: slowdperiod (int): The slow D period for the data.
    :argument: slowkmatype (int): The slow K moving average type for the data.
    :argument: slowdmatype (int): The slow D moving average type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The stochastic oscillator (STOCH) data.
    """

    https_params = {
        "function": "STOCH",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "fastkperiod": fastkperiod,
        "slowkperiod": slowkperiod,
        "slowdperiod": slowdperiod,
        "slowkmatype": slowkmatype,
        "slowdmatype": slowdmatype,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_stochf(
    symbol: str,
    interval: str = None,
    month: str = None,
    fastkperiod: int = 5,
    fastdperiod: int = 3,
    fastdmatype: int = 0,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch stochastic oscillator fast (STOCHF) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: fastkperiod (int): The fast K period for the data.
    :argument: fastdperiod (int): The fast D period for the data.
    :argument: fastdmatype (int): The fast D moving average type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The stochastic oscillator fast (STOCHF) data.
    """

    https_params = {
        "function": "STOCHF",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "fastkperiod": fastkperiod,
        "fastdperiod": fastdperiod,
        "fastdmatype": fastdmatype,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_rsi(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch relative strength index (RSI) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The relative strength index (RSI) data.
    """

    https_params = {
        "function": "RSI",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_stochrsi(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    series_type: str = None,
    fastkperiod: int = 5,
    fastdperiod: int = 3,
    fastdmatype: int = 0,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch stochastic relative strength index (STOCHRSI) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: fastkperiod (int): The fast K period for the data.
    :argument: fastdperiod (int): The fast D period for the data.
    :argument: fastdmatype (int): The fast D moving average type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: The stochastic relative strength index (STOCHRSI) data.
    """

    https_params = {
        "function": "STOCHRSI",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "fastkperiod": fastkperiod,
        "fastdperiod": fastdperiod,
        "fastdmatype": fastdmatype,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_willr(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Williams' %R (WILLR) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Williams' %R (WILLR) data.
    """

    https_params = {
        "function": "WILLR",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_adx(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch average directional movement index (ADX) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Average directional movement index (ADX) data.
    """

    https_params = {
        "function": "ADX",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_adxr(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch average directional movement index rating (ADXR) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Average directional movement index rating (ADXR) data.
    """

    https_params = {
        "function": "ADXR",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_apo(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = None,
    fastperiod: int = 12,
    slowperiod: int = 26,
    matype: int = 0,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch absolute price oscillator (APO) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: fastperiod (int): The fast period for the data.
    :argument: slowperiod (int): The slow period for the data.
    :argument: matype (int): The moving average type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Absolute price oscillator (APO) data.
    """

    https_params = {
        "function": "APO",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "fastperiod": fastperiod,
        "slowperiod": slowperiod,
        "matype": matype,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ppo(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = None,
    fastperiod: int = 12,
    slowperiod: int = 26,
    matype: int = 0,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch percentage price oscillator (PPO) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: fastperiod (int): The fast period for the data.
    :argument: slowperiod (int): The slow period for the data.
    :argument: matype (int): The moving average type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Percentage price oscillator (PPO) data.
    """

    https_params = {
        "function": "PPO",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "fastperiod": fastperiod,
        "slowperiod": slowperiod,
        "matype": matype,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_mom(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 10,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch momentum (MOM) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Momentum (MOM) data.
    """

    https_params = {
        "function": "MOM",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_bop(
    symbol: str,
    interval: str = None,
    month: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch balance of power (BOP) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Balance of power (BOP) data.
    """

    https_params = {
        "function": "BOP",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_cci(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 20,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch commodity channel index (CCI) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Commodity channel index (CCI) data.
    """

    https_params = {
        "function": "CCI",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_cmo(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Chande momentum oscillator (CMO) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Chande momentum oscillator (CMO) data.
    """

    https_params = {
        "function": "CMO",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_roc(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 10,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch rate of change (ROC) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Rate of change (ROC) data.
    """

    https_params = {
        "function": "ROC",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_rocr(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 10,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch rate of change ratio (ROCR) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Rate of change ratio (ROCR) data.
    """

    https_params = {
        "function": "ROCR",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_aroon(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch aroon (AROON) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Aroon (AROON) data.
    """

    https_params = {
        "function": "AROON",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_aroonosc(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch aroon oscillator (AROONOSC) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Aroon oscillator (AROONOSC) data.
    """

    https_params = {
        "function": "AROONOSC",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_mfi(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch money flow index (MFI) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Money flow index (MFI) data.
    """

    https_params = {
        "function": "MFI",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_trix(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 30,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch triple exponential average (TRIX) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Triple exponential average (TRIX) data.
    """

    https_params = {
        "function": "TRIX",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ultosc(
    symbol: str,
    interval: str = None,
    month: str = None,
    timeperiod1: int = 7,
    timeperiod2: int = 14,
    timeperiod3: int = 28,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch ultimate oscillator (ULTOSC) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: timeperiod1 (int): The time period for the first calculation.
    :argument: timeperiod2 (int): The time period for the second calculation.
    :argument: timeperiod3 (int): The time period for the third calculation.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Ultimate oscillator (ULTOSC) data.
    """

    https_params = {
        "function": "ULTOSC",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "timeperiod1": timeperiod1,
        "timeperiod2": timeperiod2,
        "timeperiod3": timeperiod3,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_dx(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch directional movement index (DX) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Directional movement index (DX) data.
    """

    https_params = {
        "function": "DX",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_minus_di(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch minus directional indicator (MINUS_DI) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Minus directional indicator (MINUS_DI) data.
    """

    https_params = {
        "function": "MINUS_DI",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_plus_di(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch plus directional indicator (PLUS_DI) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Plus directional indicator (PLUS_DI) data.
    """

    https_params = {
        "function": "PLUS_DI",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_minus_dm(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch minus directional movement (MINUS_DM) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Minus directional movement (MINUS_DM) data.
    """

    https_params = {
        "function": "MINUS_DM",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_plus_dm(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch plus directional movement (PLUS_DM) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Plus directional movement (PLUS_DM) data.
    """

    https_params = {
        "function": "PLUS_DM",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_bbands(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 5,
    series_type: str = "close",
    nbdevup: int = 2,
    nbdevdn: int = 2,
    matype: int = 0,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch bollinger bands (BBANDS) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: nbdevup (int): The standard deviation multiplier for the upper band.
    :argument: nbdevdn (int): The standard deviation multiplier for the lower band.
    :argument: matype (int): The moving average type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Bollinger bands (BBANDS) data.
    """

    https_params = {
        "function": "BBANDS",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "nbdevup": nbdevup,
        "nbdevdn": nbdevdn,
        "matype": matype,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_midpoint(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    series_type: str = "close",
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch midpoint (MIDPOINT) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Midpoint (MIDPOINT) data.
    """

    https_params = {
        "function": "MIDPOINT",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_midprice(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch midprice (MIDPRICE) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Midprice (MIDPRICE) data.
    """

    https_params = {
        "function": "MIDPRICE",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_sar(
    symbol: str,
    interval: str = None,
    month: str = None,
    acceleration: float = 0.02,
    maximum: float = 0.2,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch parabolic SAR (SAR) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: acceleration (float): The acceleration factor for the data.
    :argument: maximum (float): The maximum factor for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Parabolic SAR (SAR) data.
    """

    https_params = {
        "function": "SAR",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "acceleration": acceleration,
        "maximum": maximum,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_trange(
    symbol: str,
    interval: str = None,
    month: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch true range (TRANGE) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: True range (TRANGE) data.
    """

    https_params = {
        "function": "TRANGE",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_atr(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch average true range (ATR) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Average true range (ATR) data.
    """

    https_params = {
        "function": "ATR",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_natr(
    symbol: str,
    interval: str = None,
    month: str = None,
    time_period: int = 14,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch normalized average true range (NATR) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: time_period (int): The time period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Normalized average true range (NATR) data.
    """

    https_params = {
        "function": "NATR",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "time_period": time_period,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ad(
    symbol: str,
    interval: str = None,
    month: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch accumulation/distribution (AD) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Accumulation/distribution (AD) data.
    """

    https_params = {
        "function": "AD",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_adosc(
    symbol: str,
    interval: str = None,
    month: str = None,
    fastperiod: int = 3,
    slowperiod: int = 10,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch accumulation/distribution oscillator (ADOSC) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: fastperiod (int): The fast period for the data.
    :argument: slowperiod (int): The slow period for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Accumulation/distribution oscillator (ADOSC) data.
    """

    https_params = {
        "function": "ADOSC",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "fastperiod": fastperiod,
        "slowperiod": slowperiod,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_obv(
    symbol: str,
    interval: str = None,
    month: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch on balance volume (OBV) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: On balance volume (OBV) data.
    """

    https_params = {
        "function": "OBV",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ht_trendline(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = "close",
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Hilbert transform - instantaneous trendline (HT_TRENDLINE) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Hilbert transform - instantaneous trendline (HT_TRENDLINE) data.
    """

    https_params = {
        "function": "HT_TRENDLINE",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ht_sine(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = "close",
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Hilbert transform - sine wave (HT_SINE) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Hilbert transform - sine wave (HT_SINE) data.
    """

    https_params = {
        "function": "HT_SINE",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ht_trendmode(
    symbol: str,
    interval: str = None,
    month: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Hilbert transform - trend vs cycle mode (HT_TRENDMODE) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Hilbert transform - trend vs cycle mode (HT_TRENDMODE) data.
    """

    https_params = {
        "function": "HT_TRENDMODE",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ht_dcperiod(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Hil bert transform - dominant cycle period (HT_DCPERIOD) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Hilbert transform - dominant cycle period (HT_DCPERIOD) data.
    """

    https_params = {
        "function": "HT_DCPERIOD",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ht_dcphase(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = None,
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Hilbert transform - dominant cycle phase (HT_DCPHASE) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Hilbert transform - dominant cycle phase (HT_DCPHASE) data.
    """

    https_params = {
        "function": "HT_DCPHASE",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()


async def fetch_ht_phasor(
    symbol: str,
    interval: str = None,
    month: str = None,
    series_type: str = "close",
    datatype: str = "json",
) -> dict[str, str] | str:
    """
    Fetch Hilbert transform - phasor components (HT_PHASOR) data from the Alpha Vantage API.

    :argument: symbol (str): The stock symbol to fetch.
    :argument: interval (str): The time interval for the data.
    :argument: month (str): The month for the data.
    :argument: series_type (str): The series type for the data.
    :argument: datatype (str): The response data type (default: "json").

    :returns: Hilbert transform - phasor components (HT_PHASOR) data.
    """

    https_params = {
        "function": "HT_PHASOR",
        "symbol": symbol,
        "interval": interval,
        "month": month,
        "series_type": series_type,
        "datatype": datatype,
        "apikey": API_KEY,
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(API_BASE_URL, params=https_params)
        response.raise_for_status()
        return response.text if datatype == "csv" else response.json()
