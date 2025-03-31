# Daum Search MCP Server

Daum 검색 API를 통합한 MCP 서버 구현체로, 웹, 동영상, 이미지, 블로그, 책, 카페 검색 기능을 제공합니다.

## 설치 방법

### NPM을 통한 설치

```bash
npm install -g @modelcontextprotocol/server-daum-search
```

### Docker를 통한 설치

```bash
docker pull mcp/daum-search:latest
```

## 사용 방법

### 1. Kakao Developers 설정

1. [Kakao Developers](https://developers.kakao.com) 계정 생성
2. 애플리케이션 등록
3. REST API 키 발급

### 2. 실행 방법

#### NPM으로 설치한 경우:

```bash
# 환경 변수 설정
export KAKAO_API_KEY="your_kakao_api_key"

# 서버 실행
mcp-server-daum-search
```

#### Docker로 설치한 경우:

```bash
docker run -e KAKAO_API_KEY="your_kakao_api_key" mcp/daum-search
```

### 3. Claude Desktop에서 사용하기

`claude_desktop_config.json`에 다음 내용을 추가하세요:

#### NPM 사용 시:

```json
{
  "mcpServers": {
    "daum-search": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-daum-search"
      ],
      "env": {
        "KAKAO_API_KEY": "YOUR_KAKAO_REST_API_KEY_HERE"
      }
    }
  }
}
```

#### Docker 사용 시:

```json
{
  "mcpServers": {
    "daum-search": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "KAKAO_API_KEY",
        "mcp/daum-search"
      ],
      "env": {
        "KAKAO_API_KEY": "YOUR_KAKAO_REST_API_KEY_HERE"
      }
    }
  }
}
```

## 제공되는 검색 기능

- **웹 검색**: 웹 문서 검색
- **동영상 검색**: 카카오TV, 유튜브 등의 동영상 검색
- **이미지 검색**: 이미지 검색
- **블로그 검색**: 다음 블로그 게시물 검색
- **책 검색**: 도서 정보 검색
- **카페 검색**: 다음 카페 게시물 검색

각 검색 기능의 자세한 파라미터와 사용법은 아래 도구 설명을 참조하세요.

## 도구

- **daum_web_search**
  - 웹 문서 검색 실행
  - 입력:
    - `query` (string): 검색어
    - `sort` (string, 선택): 정렬 방식 (accuracy/recency)
    - `page` (number, 선택): 페이지 번호 (1-50)
    - `size` (number, 선택): 페이지당 결과 수 (1-50)

- **daum_vclip_search**
  - 동영상 검색 실행
  - 입력:
    - `query` (string): 검색어
    - `sort` (string, 선택): 정렬 방식 (accuracy/recency)
    - `page` (number, 선택): 페이지 번호 (1-15)
    - `size` (number, 선택): 페이지당 결과 수 (1-30)

- **daum_image_search**
  - 이미지 검색 실행
  - 입력:
    - `query` (string): 검색어
    - `sort` (string, 선택): 정렬 방식 (accuracy/recency)
    - `page` (number, 선택): 페이지 번호 (1-50)
    - `size` (number, 선택): 페이지당 결과 수 (1-80)

- **daum_blog_search**
  - 블로그 검색 실행
  - 입력:
    - `query` (string): 검색어
    - `sort` (string, 선택): 정렬 방식 (accuracy/recency)
    - `page` (number, 선택): 페이지 번호 (1-50)
    - `size` (number, 선택): 페이지당 결과 수 (1-50)

- **daum_book_search**
  - 책 검색 실행
  - 입력:
    - `query` (string): 검색어
    - `sort` (string, 선택): 정렬 방식 (accuracy/latest)
    - `target` (string, 선택): 검색 필드 (title/isbn/publisher/person)
    - `page` (number, 선택): 페이지 번호 (1-50)
    - `size` (number, 선택): 페이지당 결과 수 (1-50)

- **daum_cafe_search**
  - 카페 검색 실행
  - 입력:
    - `query` (string): 검색어
    - `sort` (string, 선택): 정렬 방식 (accuracy/recency)
    - `page` (number, 선택): 페이지 번호 (1-50)
    - `size` (number, 선택): 페이지당 결과 수 (1-50)

## 개발자를 위한 정보

### 로컬에서 개발하기

```bash
# 저장소 클론
git clone https://github.com/your-repo/mcp-servers.git
cd mcp-servers

# 의존성 설치
npm install

# 개발 모드로 실행
npm run watch

# 테스트 실행
npm test

# 린트 검사
npm run lint
```

### 빌드하기

```bash
npm run build
```

## 라이선스

이 MCP 서버는 MIT 라이선스로 제공됩니다. 자세한 내용은 LICENSE 파일을 참조하세요.
