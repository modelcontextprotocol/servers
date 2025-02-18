from .index import app, uvicorn

def main():
    uvicorn.run(app, host="0.0.0.0", port=6201)

if __name__ == "__main__":
    main()
