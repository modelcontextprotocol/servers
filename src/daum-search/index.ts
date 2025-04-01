#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const WEB_SEARCH_TOOL: Tool = {
  name: "daum_web_search",
  description:
    "다음 검색 서비스에서 질의어로 웹 문서를 검색합니다. " +
    "검색어와 함께 결과 형식 파라미터를 선택적으로 추가할 수 있습니다. " +
    "정확도순 또는 최신순으로 정렬이 가능하며, 페이지당 최대 50개의 결과를 제공합니다.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색을 원하는 질의어"
      },
      sort: {
        type: "string",
        description: "결과 문서 정렬 방식 (accuracy: 정확도순, recency: 최신순)",
        default: "accuracy"
      },
      page: {
        type: "number",
        description: "결과 페이지 번호 (1-50)",
        default: 1
      },
      size: {
        type: "number",
        description: "한 페이지에 보여질 문서 수 (1-50)",
        default: 10
      }
    },
    required: ["query"]
  }
};

const VCLIP_SEARCH_TOOL: Tool = {
  name: "daum_vclip_search",
  description:
    "카카오 TV, 유투브 등 서비스에서 질의어로 동영상을 검색합니다. " +
    "검색어와 함께 결과 형식 파라미터를 선택적으로 추가할 수 있습니다. " +
    "정확도순 또는 최신순으로 정렬이 가능하며, 페이지당 최대 30개의 결과를 제공합니다.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색을 원하는 질의어"
      },
      sort: {
        type: "string",
        description: "결과 문서 정렬 방식 (accuracy: 정확도순, recency: 최신순)",
        default: "accuracy"
      },
      page: {
        type: "number",
        description: "결과 페이지 번호 (1-15)",
        default: 1
      },
      size: {
        type: "number",
        description: "한 페이지에 보여질 문서 수 (1-30)",
        default: 15
      }
    },
    required: ["query"]
  }
};

const IMAGE_SEARCH_TOOL: Tool = {
  name: "daum_image_search",
  description:
    "다음 검색 서비스에서 질의어로 이미지를 검색합니다. " +
    "검색어와 함께 결과 형식 파라미터를 선택적으로 추가할 수 있습니다. " +
    "정확도순 또는 최신순으로 정렬이 가능하며, 페이지당 최대 80개의 결과를 제공합니다.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색을 원하는 질의어"
      },
      sort: {
        type: "string",
        description: "결과 문서 정렬 방식 (accuracy: 정확도순, recency: 최신순)",
        default: "accuracy"
      },
      page: {
        type: "number",
        description: "결과 페이지 번호 (1-50)",
        default: 1
      },
      size: {
        type: "number",
        description: "한 페이지에 보여질 문서 수 (1-80)",
        default: 80
      }
    },
    required: ["query"]
  }
};

const BLOG_SEARCH_TOOL: Tool = {
  name: "daum_blog_search",
  description:
    "다음 블로그 서비스에서 질의어로 게시물을 검색합니다. " +
    "검색어와 함께 결과 형식 파라미터를 선택적으로 추가할 수 있습니다. " +
    "정확도순 또는 최신순으로 정렬이 가능하며, 페이지당 최대 50개의 결과를 제공합니다.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색을 원하는 질의어"
      },
      sort: {
        type: "string",
        description: "결과 문서 정렬 방식 (accuracy: 정확도순, recency: 최신순)",
        default: "accuracy"
      },
      page: {
        type: "number",
        description: "결과 페이지 번호 (1-50)",
        default: 1
      },
      size: {
        type: "number",
        description: "한 페이지에 보여질 문서 수 (1-50)",
        default: 10
      }
    },
    required: ["query"]
  }
};

const BOOK_SEARCH_TOOL: Tool = {
  name: "daum_book_search",
  description:
    "다음 책 서비스에서 질의어로 도서 정보를 검색합니다. " +
    "검색어와 함께 결과 형식 파라미터를 선택적으로 추가할 수 있습니다. " +
    "정확도순 또는 발간일순으로 정렬이 가능하며, 페이지당 최대 50개의 결과를 제공합니다.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색을 원하는 질의어"
      },
      sort: {
        type: "string",
        description: "결과 문서 정렬 방식 (accuracy: 정확도순, latest: 발간일순)",
        default: "accuracy"
      },
      target: {
        type: "string",
        description: "검색 필드 제한 (title: 제목, isbn: ISBN, publisher: 출판사, person: 인명)",
        default: "title"
      },
      page: {
        type: "number",
        description: "결과 페이지 번호 (1-50)",
        default: 1
      },
      size: {
        type: "number",
        description: "한 페이지에 보여질 문서 수 (1-50)",
        default: 10
      }
    },
    required: ["query"]
  }
};

const CAFE_SEARCH_TOOL: Tool = {
  name: "daum_cafe_search",
  description:
    "다음 카페 서비스에서 질의어로 게시물을 검색합니다. " +
    "검색어와 함께 결과 형식 파라미터를 선택적으로 추가할 수 있습니다. " +
    "정확도순 또는 최신순으로 정렬이 가능하며, 페이지당 최대 50개의 결과를 제공합니다.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "검색을 원하는 질의어"
      },
      sort: {
        type: "string",
        description: "결과 문서 정렬 방식 (accuracy: 정확도순, recency: 최신순)",
        default: "accuracy"
      },
      page: {
        type: "number",
        description: "결과 페이지 번호 (1-50)",
        default: 1
      },
      size: {
        type: "number",
        description: "한 페이지에 보여질 문서 수 (1-50)",
        default: 10
      }
    },
    required: ["query"]
  }
};

// Server implementation
const server = new Server(
  {
    name: "example-servers/daum-search",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Check for API key
const KAKAO_API_KEY = process.env.KAKAO_API_KEY!;
if (!KAKAO_API_KEY) {
  console.error("Error: KAKAO_API_KEY environment variable is required");
  process.exit(1);
}

// 인터페이스 정의
interface DaumResponse {
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
  documents: any[];
}

// 타입 가드 함수들
function isDaumSearchArgs(args: unknown): args is { 
  query: string; 
  sort?: string; 
  page?: number; 
  size?: number;
  target?: string;
} {
  return (
    typeof args === "object" &&
    args !== null &&
    "query" in args &&
    typeof (args as { query: string }).query === "string"
  );
}

// 검색 함수들
async function performSearch(endpoint: string, params: Record<string, unknown>) {
  const apiKey = process.env.KAKAO_API_KEY;
  if (!apiKey) {
    throw new Error("KAKAO_API_KEY environment variable is not set");
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value.toString());
    }
  }

  const response = await fetch(
    `https://dapi.kakao.com/v2/search/${endpoint}?${searchParams.toString()}`,
    {
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.statusText}`);
  }

  return await response.json() as DaumResponse;
}

async function performWebSearch(query: string, sort?: string, page?: number, size?: number) {
  const data = await performSearch('web', { query, sort, page, size });
  return data.documents.map((doc: any) => 
    `제목: ${doc.title}\n내용: ${doc.contents}\nURL: ${doc.url}\n작성시간: ${doc.datetime}`
  ).join('\n\n');
}

async function performVclipSearch(query: string, sort?: string, page?: number, size?: number) {
  const data = await performSearch('vclip', { query, sort, page, size });
  return data.documents.map((doc: any) => 
    `제목: ${doc.title}\n재생시간: ${doc.play_time}초\n썸네일: ${doc.thumbnail}\nURL: ${doc.url}\n작성자: ${doc.author}\n작성시간: ${doc.datetime}`
  ).join('\n\n');
}

async function performImageSearch(query: string, sort?: string, page?: number, size?: number) {
  const data = await performSearch('image', { query, sort, page, size });
  return data.documents.map((doc: any) => 
    `컬렉션: ${doc.collection}\n썸네일: ${doc.thumbnail_url}\n이미지: ${doc.image_url}\n출처: ${doc.display_sitename}\nURL: ${doc.doc_url}\n작성시간: ${doc.datetime}`
  ).join('\n\n');
}

async function performBlogSearch(query: string, sort?: string, page?: number, size?: number) {
  const data = await performSearch('blog', { query, sort, page, size });
  return data.documents.map((doc: any) => 
    `제목: ${doc.title}\n내용: ${doc.contents}\n블로그명: ${doc.blogname}\nURL: ${doc.url}\n썸네일: ${doc.thumbnail}\n작성시간: ${doc.datetime}`
  ).join('\n\n');
}

async function performBookSearch(query: string, sort?: string, target?: string, page?: number, size?: number) {
  const url = new URL('https://dapi.kakao.com/v3/search/book');
  const params = { query, sort, target, page, size };
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: {
      'Authorization': `KakaoAK ${KAKAO_API_KEY}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Kakao API error: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const data = await response.json() as DaumResponse;
  return data.documents.map((doc: any) => 
    `제목: ${doc.title}\n내용: ${doc.contents}\n저자: ${doc.authors.join(', ')}\n출판사: ${doc.publisher}\nISBN: ${doc.isbn}\n가격: ${doc.price}원\n판매가: ${doc.sale_price}원\n상태: ${doc.status}\n썸네일: ${doc.thumbnail}\nURL: ${doc.url}`
  ).join('\n\n');
}

async function performCafeSearch(query: string, sort?: string, page?: number, size?: number) {
  const data = await performSearch('cafe', { query, sort, page, size });
  return data.documents.map((doc: any) => 
    `제목: ${doc.title}\n내용: ${doc.contents}\n카페명: ${doc.cafename}\nURL: ${doc.url}\n썸네일: ${doc.thumbnail}\n작성시간: ${doc.datetime}`
  ).join('\n\n');
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    WEB_SEARCH_TOOL,
    VCLIP_SEARCH_TOOL,
    IMAGE_SEARCH_TOOL,
    BLOG_SEARCH_TOOL,
    BOOK_SEARCH_TOOL,
    CAFE_SEARCH_TOOL
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args || !isDaumSearchArgs(args)) {
      throw new Error("Invalid arguments");
    }

    const { query, sort, page, size, target } = args;

    switch (name) {
      case "daum_web_search": {
        const results = await performWebSearch(query, sort, page, size);
        return { content: [{ type: "text", text: results }], isError: false };
      }
      case "daum_vclip_search": {
        const results = await performVclipSearch(query, sort, page, size);
        return { content: [{ type: "text", text: results }], isError: false };
      }
      case "daum_image_search": {
        const results = await performImageSearch(query, sort, page, size);
        return { content: [{ type: "text", text: results }], isError: false };
      }
      case "daum_blog_search": {
        const results = await performBlogSearch(query, sort, page, size);
        return { content: [{ type: "text", text: results }], isError: false };
      }
      case "daum_book_search": {
        const results = await performBookSearch(query, sort, target, page, size);
        return { content: [{ type: "text", text: results }], isError: false };
      }
      case "daum_cafe_search": {
        const results = await performCafeSearch(query, sort, page, size);
        return { content: [{ type: "text", text: results }], isError: false };
      }
      default:
        return {
          content: [{ type: "text", text: `알 수 없는 도구: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `오류: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Daum Search MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
