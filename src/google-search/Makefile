build-docker:
	docker build --rm -t mcp-server-googlesearch:dev .

run-docker:
	source .env && \
		docker run -it --rm \
			-e GOOGLE_API_KEY=$${GOOGLE_API_KEY} \
			-e GOOGLE_CSE_ID=$${GOOGLE_CSE_ID} \
			-p 8000:8000 \
			mcp-server-googlesearch:dev --transport sse --host 0.0.0.0 --port 8000
