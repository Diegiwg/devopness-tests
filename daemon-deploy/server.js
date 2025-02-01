const http = require("http");

const HOST = "0.0.0.0";
const PORT = 9000;

const OUTPUT = "Será que o conteudo vai mudar depois de rodar application:deploy e daemon:deploy?\n";

http
  .createServer(function (req, res) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(OUTPUT);
  })
  .listen(PORT, HOST);

console.log(`Server running at http://${HOST}:${PORT}/`);
