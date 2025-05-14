export const getChainInfo = {
    name: "get_chain_info",
    description: "Get information about blockchains via GET requests to /v1/chain or /v1/chain/list. " +
        "Can retrieve details about a specific chain or list all supported chains.",
    inputSchema: {
        type: "object",
        properties: {
            id: { type: "string", description: "Optional chain identifier (e.g. eth, bsc, xdai)" },
            page: { type: "number", description: "Page number, starting from 1", default: 1 },
            page_size: { type: "number", description: "Number of records per page", default: 5 }
        },
        required: []
    }
}

export const getProtocolInfo = {
    name: "get_protocol_info",
    description: "Get information about DeFi protocols via GET requests to various protocol endpoints. " +
        "Can retrieve details about a specific protocol, list protocols on a chain, or fetch top holders.",
    inputSchema: {
        type: "object",
        properties: {
            id: { type: "string", description: "Protocol identifier (e.g. curve, uniswap)" },
            chain_id: { type: "string", description: "Chain identifier (e.g. eth, bsc)" },
            get_top_holders: { type: "boolean", description: "Set to True to fetch the top holders of a protocol", default: false },
            start: { type: "number", description: "Integer offset for pagination" },
            limit: { type: "number", description: "Number of results to return", default: 10 },
            page: { type: "number", description: "Page number, starting from 1", default: 1 },
            page_size: { type: "number", description: "Number of records per page", default: 5 }
        },
        required: []
    }
}

export const getTokenInfo = {
    name: "get_token_info",
    description: "Get information about tokens via GET requests to various token endpoints. " +
        "Can retrieve token details, top holders, or historical prices.",
    inputSchema: {
        type: "object",
        properties: {
            chain_id: { type: "string", description: "Chain identifier (e.g. eth, bsc, xdai)" },
            id: { type: "string", description: "Token identifier - either a contract address or a native token id" },
            action: { type: "string", description: "Type of information to retrieve", default: "details" },
            date_at: { type: "string", description: "UTC timezone date in YYYY-MM-DD format" },
            start: { type: "number", description: "Integer offset for pagination", default: 0 },
            limit: { type: "number", description: "Number of holders to return", default: 100 },
            page: { type: "number", description: "Page number, starting from 1", default: 1 },
            page_size: { type: "number", description: "Number of records per page", default: 5 }
        },
        required: ["chain_id", "id"]
    }
}

export const getPoolInfo = {
    name: "get_pool_info",
    description: "Get detailed information about a specific liquidity pool via a GET request to /v1/pool. " +
        "Returns detailed statistics about the pool including its deposits, user counts, and associated protocol.",
    inputSchema: {
        type: "object",
        properties: {
            id: { type: "string", description: "Pool identifier" },
            chain_id: { type: "string", description: "Chain identifier (e.g. eth, bsc, xdai)" }
        },
        required: ["id", "chain_id"]
    }
}

export const getUserAssets = {
    name: "get_user_assets",
    description: "Get information about a user's assets across different blockchains. " +
        "Can retrieve basic balance, token lists, NFTs, and more with optional chain filtering.",
    inputSchema: {
        type: "object",
        properties: {
            id: { type: "string", description: "User wallet address" },
            asset_type: { type: "string", description: "Type of asset information to retrieve", default: "balance" },
            chain_id: { type: "string", description: "Chain identifier for single-chain queries" },
            token_id: { type: "string", description: "Token identifier for specific token balance query" },
            chain_ids: { type: "string", description: "Optional comma-separated list of chain IDs" },
            page: { type: "number", description: "Page number, starting from 1", default: 1 },
            page_size: { type: "number", description: "Number of records per page", default: 5 }
        },
        required: ["id"]
    }
}

export const getUserActivities = {
    name: "get_user_activities",
    description: "Get information about a user's protocol positions, transaction history, and balance charts. " +
        "Supports filtering by chain and protocol.",
    inputSchema: {
        type: "object",
        properties: {
            id: { type: "string", description: "User wallet address" },
            activity_type: { type: "string", description: "Type of activity information to retrieve" },
            chain_id: { type: "string", description: "Chain identifier for single-chain queries" },
            protocol_id: { type: "string", description: "Protocol identifier for specific protocol query" },
            chain_ids: { type: "string", description: "Optional comma-separated list of chain IDs" },
            page_count: { type: "number", description: "Optional number of pages to return for history queries" },
            start_time: { type: "number", description: "Optional Unix timestamp to start from for history queries" },
            is_simple: { type: "boolean", description: "Whether to use simple or complex protocol list", default: true },
            page: { type: "number", description: "Page number, starting from 1", default: 1 },
            page_size: { type: "number", description: "Number of records per page", default: 5 }
        },
        required: ["id", "activity_type"]
    }
}

export const getUserAuthorizations = {
    name: "get_user_authorizations",
    description: "Get information about a user's token and NFT authorizations on a specific blockchain.",
    inputSchema: {
        type: "object",
        properties: {
            id: { type: "string", description: "User wallet address" },
            chain_id: { type: "string", description: "Chain identifier (e.g. eth, bsc, xdai)" },
            auth_type: { type: "string", description: "Type of authorization to retrieve", default: "token" },
            page: { type: "number", description: "Page number, starting from 1", default: 1 },
            page_size: { type: "number", description: "Number of records per page", default: 5 }
        },
        required: ["id", "chain_id"]
    }
}

export const getCollectionNftList = {
    name: "get_collection_nft_list",
    description: "Get a list of NFTs in a specific collection using a GET request to /v1/collection/nft_list. " +
        "Returns an array of NFT objects with details like name, description, content, and attributes.",
    inputSchema: {
        type: "object",
        properties: {
            id: { type: "string", description: "NFT contract address" },
            chain_id: { type: "string", description: "Chain identifier (e.g. eth, bsc, xdai)" },
            start: { type: "number", description: "Integer offset for pagination", default: 0 },
            limit: { type: "number", description: "Number of NFTs to return", default: 20 },
            page: { type: "number", description: "Page number, starting from 1", default: 1 },
            page_size: { type: "number", description: "Number of records per page", default: 5 }
        },
        required: ["id", "chain_id"]
    }
}

export const walletTools = {
    name: "wallet_tools",
    description: "Access wallet-related functionality: get gas prices, analyze transactions, or simulate transactions.",
    inputSchema: {
        type: "object",
        properties: {
            action: { type: "string", description: "Type of wallet action to perform" },
            chain_id: { type: "string", description: "Chain identifier (e.g. eth, bsc, xdai)" },
            tx: { type: "object", description: "Transaction object" },
            pending_tx_list: { type: "array", description: "Optional list of transactions to execute before the main transaction" },
            page: { type: "number", description: "Page number, starting from 1", default: 1 },
            page_size: { type: "number", description: "Number of records per page", default: 5 }
        },
        required: ["action"]
    }
}

export default [
    getChainInfo,
    getProtocolInfo,
    getTokenInfo,
    getPoolInfo,
    getUserAssets,
    getUserActivities,
    getUserAuthorizations,
    getCollectionNftList,
    walletTools
]

