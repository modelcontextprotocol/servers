import { getChainInfo, getCollectionNftList, getPoolInfo, getProtocolInfo, getTokenInfo, getUserActivities, getUserAssets, getUserAuthorizations, walletTools } from "./toolInfo.ts";

// DeBanK API configuration
const ACCESS_KEY = Deno.env.get("ACCESS_KEY");
const BASE_URL = "https://pro-openapi.debank.com";

// Pagination function types
interface PaginationInfo {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
}

interface PaginatedResult<T> {
    data: T[];
    pagination: PaginationInfo;
}

// Pagination function
function paginateResults<T>(results: T[] | null | undefined, page = 1, page_size = 5): PaginatedResult<T> | null | undefined {
    if (results === null || results === undefined || !Array.isArray(results)) {
        return results as any;
    }

    const start_idx = (page - 1) * page_size;
    const end_idx = start_idx + page_size;
    const total_items = results.length;
    const total_pages = Math.ceil(total_items / page_size);

    const paginated_results = results.slice(start_idx, end_idx);

    const pagination_info: PaginationInfo = {
        page,
        page_size,
        total_items,
        total_pages
    };

    return {
        data: paginated_results,
        pagination: pagination_info
    };
}

// Network request function
async function makeNwsRequest(url: string): Promise<any> {
    const headers = {
        "Accept": "application/json",
        "AccessKey": ACCESS_KEY || ""
    };

    try {
        const response = await fetch(url, {
            method: "GET",
            headers
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Request error:", error);
        return null;
    }
}

// POST request function
async function makePostRequest(url: string, data: any): Promise<any> {
    const headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "AccessKey": ACCESS_KEY || ""
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("POST request error:", error);
        return null;
    }
}


export const getChainInfoHandler = async ({ id, page = 1, page_size = 5 }: { id?: string, page?: number, page_size?: number }) => {
    if (id) {
        return await makeNwsRequest(`${BASE_URL}/v1/chain?id=${id}`);
    } else {
        const results = await makeNwsRequest(`${BASE_URL}/v1/chain/list`);
        return paginateResults(results, page, page_size);
    }
}

export const getProtocolInfoHandler = async ({ id, chain_id, get_top_holders = false, start, limit = 10, page = 1, page_size = 5 }: { id?: string, chain_id?: string, get_top_holders?: boolean, start?: number, limit?: number, page?: number, page_size?: number }) => {
    if (id && get_top_holders) {
        // Get top holders of a protocol
        let url = `${BASE_URL}/v1/protocol/top_holders?id=${id}`;
        if (start !== undefined) {
            url += `&start=${start}`;
        }
        if (limit !== undefined) {
            url += `&limit=${limit}`;
        }
        const results = await makeNwsRequest(url);
        return paginateResults(results, page, page_size);
    } else if (id) {
        // Get specific protocol info
        return await makeNwsRequest(`${BASE_URL}/v1/protocol?id=${id}`);
    } else if (chain_id) {
        // Get protocols on a chain
        const protocols = await makeNwsRequest(`${BASE_URL}/v1/protocol/list?chain_id=${chain_id}`);
        if (protocols) {
            // Sort protocols by TVL in descending order
            const sorted_protocols = [...protocols].sort((a, b) =>
                (b.tvl || 0) - (a.tvl || 0)
            );
            return paginateResults(sorted_protocols, page, page_size);
        }
        return null;
    } else {
        return { error: "Either id or chain_id must be provided" };
    }
}

export const getTokenInfoHandler = async ({ chain_id, id, action = "details", date_at, start = 0, limit = 100, page = 1, page_size = 5 }: { chain_id: string, id: string, action?: string, date_at?: string, start?: number, limit?: number, page?: number, page_size?: number }) => {
    if (action === "details") {
        return await makeNwsRequest(`${BASE_URL}/v1/token?chain_id=${chain_id}&id=${id}`);
    } else if (action === "holders") {
        const url = `${BASE_URL}/v1/token/top_holders?chain_id=${chain_id}&id=${id}&start=${start}&limit=${limit}`;
        const results = await makeNwsRequest(url);
        return paginateResults(results, page, page_size);
    } else if (action === "history") {
        if (!date_at) {
            return { error: "date_at parameter is required for historical price" };
        }
        return await makeNwsRequest(`${BASE_URL}/v1/token/history_price?chain_id=${chain_id}&id=${id}&date_at=${date_at}`);
    } else {
        return { error: "Invalid action parameter. Use 'details', 'holders', or 'history'." };
    }
}

export const getPoolInfoHandler = async ({ id, chain_id }: { id: string, chain_id: string }) => {
    return await makeNwsRequest(`${BASE_URL}/v1/pool?id=${id}&chain_id=${chain_id}`);
}

export const getUserAssetsHandler = async ({ id, asset_type = "balance", chain_id, token_id, chain_ids, page = 1, page_size = 5 }: { id: string, asset_type?: string, chain_id?: string, token_id?: string, chain_ids?: string, page?: number, page_size?: number }) => {
    if (asset_type === "balance") {
        if (chain_id) {
            return await makeNwsRequest(`${BASE_URL}/v1/user/chain_balance?id=${id}&chain_id=${chain_id}`);
        } else {
            let url = `${BASE_URL}/v1/user/total_balance?id=${id}`;
            if (chain_ids) {
                url += `&chain_ids=${chain_ids}`;
            }
            return await makeNwsRequest(url);
        }
    } else if (asset_type === "chains") {
        const results = await makeNwsRequest(`${BASE_URL}/v1/user/used_chain_list?id=${id}`);
        return paginateResults(results, page, page_size);
    } else if (asset_type === "tokens") {
        let results;
        if (chain_id) {
            results = await makeNwsRequest(`${BASE_URL}/v1/user/token_list?id=${id}&chain_id=${chain_id}`);
        } else {
            let url = `${BASE_URL}/v1/user/all_token_list?id=${id}`;
            if (chain_ids) {
                url += `&chain_ids=${chain_ids}`;
            }
            results = await makeNwsRequest(url);
        }
        return paginateResults(results, page, page_size);
    } else if (asset_type === "token") {
        if (!chain_id || !token_id) {
            return { error: "chain_id and token_id are required for token balance query" };
        }
        return await makeNwsRequest(`${BASE_URL}/v1/user/token_balance?id=${id}&chain_id=${chain_id}&token_id=${token_id}`);
    } else if (asset_type === "nfts") {
        let results;
        if (chain_id) {
            results = await makeNwsRequest(`${BASE_URL}/v1/user/nft_list?id=${id}&chain_id=${chain_id}`);
        } else {
            let url = `${BASE_URL}/v1/user/all_nft_list?id=${id}`;
            if (chain_ids) {
                url += `&chain_ids=${chain_ids}`;
            }
            results = await makeNwsRequest(url);
        }
        return paginateResults(results, page, page_size);
    } else {
        return { error: "Invalid asset_type parameter" };
    }
}

export const getUserActivitiesHandler = async ({ id, activity_type, chain_id, protocol_id, chain_ids, page_count, start_time, is_simple = true, page = 1, page_size = 5 }: { id: string, activity_type: string, chain_id?: string, protocol_id?: string, chain_ids?: string, page_count?: number, start_time?: number, is_simple?: boolean, page?: number, page_size?: number }) => {
    if (activity_type === "protocols") {
        if (protocol_id) {
            // Get specific protocol info
            return await makeNwsRequest(`${BASE_URL}/v1/user/protocol?id=${id}&protocol_id=${protocol_id}`);
        } else if (chain_id) {
            // Get protocol list for a specific chain
            let results;
            if (is_simple) {
                results = await makeNwsRequest(`${BASE_URL}/v1/user/simple_protocol_list?id=${id}&chain_id=${chain_id}`);
            } else {
                results = await makeNwsRequest(`${BASE_URL}/v1/user/complex_protocol_list?id=${id}&chain_id=${chain_id}`);
            }
            return paginateResults(results, page, page_size);
        } else {
            // Get protocol list for all chains
            const url_base = `${BASE_URL}/v1/user/all_${is_simple ? "simple" : "complex"}_protocol_list`;
            let url = `${url_base}?id=${id}`;
            if (chain_ids) {
                url += `&chain_ids=${chain_ids}`;
            }
            const results = await makeNwsRequest(url);
            return paginateResults(results, page, page_size);
        }
    } else if (activity_type === "history") {
        let url;
        if (chain_id) {
            // Get history for a specific chain
            url = `${BASE_URL}/v1/user/history_list?id=${id}&chain_id=${chain_id}`;
        } else {
            // Get history for all chains
            url = `${BASE_URL}/v1/user/history?id=${id}`;
            if (chain_ids) {
                url += `&chain_ids=${chain_ids}`;
            }
        }

        if (page_count !== undefined) {
            url += `&page_count=${page_count}`;
        }
        if (start_time !== undefined) {
            url += `&start_time=${start_time}`;
        }

        const results = await makeNwsRequest(url);
        return paginateResults(results, page, page_size);
    } else if (activity_type === "chart") {
        let results;
        if (chain_id) {
            // Get chart for a specific chain
            results = await makeNwsRequest(`${BASE_URL}/v1/user/chain_net_curve?id=${id}&chain_id=${chain_id}`);
        } else {
            // Get chart for all chains
            let url = `${BASE_URL}/v1/user/total_net_curve?id=${id}`;
            if (chain_ids) {
                url += `&chain_ids=${chain_ids}`;
            }
            results = await makeNwsRequest(url);
        }
        return paginateResults(results, page, page_size);
    } else {
        return { error: "Invalid activity_type parameter" };
    }
}

export const getUserAuthorizationsHandler = async ({ id, chain_id, auth_type = "token", page = 1, page_size = 5 }: { id: string, chain_id: string, auth_type?: string, page?: number, page_size?: number }) => {
    if (auth_type === "token") {
        const results = await makeNwsRequest(`${BASE_URL}/v1/user/token_auth_list?id=${id}&chain_id=${chain_id}`);
        return paginateResults(results, page, page_size);
    } else if (auth_type === "nft") {
        const results = await makeNwsRequest(`${BASE_URL}/v1/user/nft_auth_list?id=${id}&chain_id=${chain_id}`);
        return paginateResults(results, page, page_size);
    } else {
        return { error: "Invalid auth_type parameter. Use 'token' or 'nft'." };
    }
}

export const getCollectionNftListHandler = async ({ id, chain_id, start = 0, limit = 20, page = 1, page_size = 5 }: { id: string, chain_id: string, start?: number, limit?: number, page?: number, page_size?: number }) => {
    const url = `${BASE_URL}/v1/collection/nft_list?id=${id}&chain_id=${chain_id}&start=${start}&limit=${limit}`;
    const results = await makeNwsRequest(url);
    return paginateResults(results, page, page_size);
}

export const walletToolsHandler = async ({ action, chain_id, tx, pending_tx_list, page = 1, page_size = 5 }: { action: string, chain_id?: string, tx?: any, pending_tx_list?: any[], page?: number, page_size?: number }) => {
    if (action === "gas") {
        if (!chain_id) {
            return { error: "chain_id parameter is required for gas price query" };
        }
        const results = await makeNwsRequest(`${BASE_URL}/v1/wallet/gas_market?chain_id=${chain_id}`);
        return paginateResults(results, page, page_size);
    } else if (action === "explain_tx") {
        if (!tx) {
            return { error: "tx parameter is required for transaction explanation" };
        }
        const data = { tx };
        return await makePostRequest(`${BASE_URL}/v1/wallet/explain_tx`, data);
    } else if (action === "simulate_tx") {
        if (!tx) {
            return { error: "tx parameter is required for transaction simulation" };
        }
        const data: any = { tx };
        if (pending_tx_list) {
            data.pending_tx_list = pending_tx_list;
        }
        return await makePostRequest(`${BASE_URL}/v1/wallet/pre_exec_tx`, data);
    } else {
        return { error: "Invalid action parameter. Use 'gas', 'explain_tx', or 'simulate_tx'." };
    }
}



export const toolToHandler = {
    [getChainInfo.name]: getChainInfoHandler,
    [getProtocolInfo.name]: getProtocolInfoHandler,
    [getTokenInfo.name]: getTokenInfoHandler,
    [getPoolInfo.name]: getPoolInfoHandler,
    [getUserAssets.name]: getUserAssetsHandler,
    [getUserActivities.name]: getUserActivitiesHandler,
    [getUserAuthorizations.name]: getUserAuthorizationsHandler,
    [getCollectionNftList.name]: getCollectionNftListHandler,
    [walletTools.name]: walletToolsHandler
}