for f in [
    "/opt/avito-autopost/src/app/api/avito/ai-agent/status/route.ts",
    "/opt/avito-autopost/src/app/api/avito/products/route.ts",
]:
    with open(f) as h:
        code = h.read()
    code = code.replace('\\"@/lib/avito/resolve-session\\"', '"@/lib/avito/resolve-session"')
    code = code.replace('from \\"', 'from "').replace('\\";', '";')
    with open(f, "w") as h:
        h.write(code)
    print(f"patched {f}")
