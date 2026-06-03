// Reproduce the Avito page crash on the server using the installed Puppeteer.
// Logs in via the owner site_key, navigates to /owner/avito, captures console
// errors and uncaught page errors.
const puppeteer = require("/opt/avito-autopost/node_modules/puppeteer");

const BASE = "http://localhost:3000";
const SITE_KEY =
  "a8d3e2f1c5b497602d3e8f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8";

(async () => {
  // 1) Login via API to grab the session cookie.
  const res = await fetch(`${BASE}/api/owner/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteKey: SITE_KEY }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  console.log("LOGIN status:", res.status);
  console.log("LOGIN body:", (await res.text()).slice(0, 300));
  const m = /session=([^;]+)/.exec(setCookie);
  if (!m) {
    console.log("NO SESSION COOKIE, set-cookie was:", setCookie);
    process.exit(2);
  }
  const sessionToken = m[1];

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("CONSOLE.ERROR: " + msg.text());
  });
  page.on("pageerror", (err) => {
    errors.push("PAGEERROR: " + (err && err.stack ? err.stack : String(err)));
  });
  page.on("requestfailed", (req) => {
    errors.push(
      "REQ.FAILED: " + req.url() + " :: " + (req.failure() && req.failure().errorText)
    );
  });

  await page.setCookie({
    name: "session",
    value: sessionToken,
    domain: "localhost",
    path: "/",
  });

  console.log("Navigating to /owner/avito ...");
  try {
    await page.goto(`${BASE}/owner/avito`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
  } catch (e) {
    console.log("GOTO error:", e.message);
  }

  // give client hooks time to fire
  await new Promise((r) => setTimeout(r, 4000));

  const url = page.url();
  console.log("FINAL URL:", url);

  const bodyText = await page.evaluate(() =>
    document.body ? document.body.innerText.slice(0, 600) : "(no body)"
  );
  console.log("BODY TEXT (first 600):\n", bodyText);

  console.log("\n===== ERRORS (" + errors.length + ") =====");
  for (const e of errors) console.log(e + "\n---");

  await page.screenshot({ path: "/tmp/avito-crash.png", fullPage: true });
  console.log("screenshot -> /tmp/avito-crash.png");

  await browser.close();
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
