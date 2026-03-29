import urllib.request
try:
    req = urllib.request.Request("http://localhost:8000/api/groups/2/files", method="OPTIONS")
    req.add_header("Origin", "http://192.168.56.1:3000")
    req.add_header("Access-Control-Request-Method", "GET")
    with urllib.request.urlopen(req, timeout=5) as response:
        print("Status:", response.status)
        print("Headers:", response.headers)
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Headers:", e.headers)
except Exception as e:
    print("Exception:", e)
