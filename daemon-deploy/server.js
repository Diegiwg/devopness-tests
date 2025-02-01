const http = require("http");

const HOST = "0.0.0.0";
const PORT = 9000;

// Get OUTPUT from environment variable
const OUTPUT = process.env.OUTPUT || "Could not get OUTPUT";

http
  .createServer(function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(OUTPUT);
  })
  .listen(PORT, HOST);

console.log(`Server running at http://${HOST}:${PORT}/`);
