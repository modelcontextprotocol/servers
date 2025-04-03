
import urllib
from mcp.server.fastmcp import FastMCP
import requests
from bs4 import BeautifulSoup

mcp = FastMCP('arXiv-server')

URL ='https://arxiv.org'
@mcp.tool()
def search(query):
	"""
	Search Arxiv for the given query
	"""
	query = urllib.parse.quote_plus(query)
	res = requests.get(f"""{URL}/search/?query={query}&searchtype=all&abstracts=show&order=-announced_date_first&size=50""")
	soup = BeautifulSoup(res.text, 'html.parser')
	items = soup.select('.arxiv-result')
	data = []
	for item in items:
		title = item.select('.title')[0].text
		title = title.replace('\n', ' ')
		title = title.strip()
		title = ' '.join(title.split())
		abstract = item.select('.abstract')[0].text
		abstract = abstract.replace('\n', ' ')
		abstract = ' '.join(abstract.split())
		url = item.select('.list-title > span > a')[0].get('href')
		data.append(
			{
				'title': title,
				'abstract': abstract,
				'url': url
			}
		)
	return data
@mcp.tool()
def get(url):
	"""
	Get the content of the given URL from arxiv.
	"""
	url_prefix = 'https://r.jina.ai/'
	res = requests.get(url_prefix + url)
	return res.text
if __name__ == "__main__":
	# Initialize and run the server
	mcp.run(transport='stdio')