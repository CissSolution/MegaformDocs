import http from "node:http";

const listenPort = Number(process.argv[2] || 5210);
const targetHost = process.argv[3] || "dnn10322_megaqa.ai";

http
  .createServer((request, response) => {
    const headers = { ...request.headers, host: targetHost };
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 80,
        method: request.method,
        path: request.url,
        headers,
      },
      (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers };
        const location = responseHeaders.location;
        if (typeof location === "string") {
          responseHeaders.location = location.replace(
            new RegExp(`^https?://${targetHost.replaceAll(".", "\\.")}`, "i"),
            `http://127.0.0.1:${listenPort}`,
          );
        }
        response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", (error) => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain" });
      response.end(`DNN proxy error: ${error.message}`);
    });
    request.pipe(upstream);
  })
  .listen(listenPort, "127.0.0.1", () => {
    console.log(`DNN host proxy: http://127.0.0.1:${listenPort} -> ${targetHost}`);
  });
