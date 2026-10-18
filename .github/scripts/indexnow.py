"""Signale toutes les pages du sitemap aux moteurs compatibles IndexNow
(Bing - utilisé par ChatGPT et Copilot -, Yandex, Seznam, Naver...).
Lancé automatiquement par .github/workflows/indexnow.yml à chaque mise à jour du site."""
import json
import re
import urllib.request

HOST = "eclatdutemps.com"
KEY = "1bc011bf82933df1c4b272518ef1411f"

with open("sitemap.xml", encoding="utf-8") as f:
    urls = re.findall(r"<loc>(.*?)</loc>", f.read())
urls.append(f"https://{HOST}/")

payload = json.dumps({
    "host": HOST,
    "key": KEY,
    "keyLocation": f"https://{HOST}/{KEY}.txt",
    "urlList": urls,
}).encode("utf-8")

req = urllib.request.Request(
    "https://api.indexnow.org/indexnow",
    data=payload,
    headers={"Content-Type": "application/json; charset=utf-8"},
)
with urllib.request.urlopen(req, timeout=30) as resp:
    print(f"IndexNow : {len(urls)} URL envoyées - réponse HTTP {resp.status}")
