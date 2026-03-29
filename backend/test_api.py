import urllib.request
import json
try:
    req = urllib.request.Request("http://localhost:8000/api/groups/2/files")
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            print("Status:", response.status)
            print(response.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.reason)
        print(e.read().decode())
except Exception as e:
    print("Exception:", e)
