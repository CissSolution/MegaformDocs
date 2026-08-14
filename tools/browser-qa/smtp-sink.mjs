// ============================================================================
//  Minimal SMTP sink — proves an email was really SENT, not merely attempted.
//
//  MegaForm's DNN sender builds `new SmtpClient(host, port)` with an explicit
//  host, so web.config's SpecifiedPickupDirectory never applies. To show a real
//  delivery on a demo site you need something listening. This is that something:
//  it speaks just enough SMTP to accept a message and writes it to disk.
//
//  Not a mail server. No relaying, no auth, binds to loopback only.
//
//  Env: SINK_PORT (default 2525), SINK_OUT (default ./_maildrop)
//  Run: node tools/browser-qa/smtp-sink.mjs
// ============================================================================
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.SINK_PORT || 2525);
const OUT = process.env.SINK_OUT || path.resolve("_maildrop");
fs.mkdirSync(OUT, { recursive: true });

let seq = 0;

const server = net.createServer((sock) => {
  let buf = "";
  let inData = false;
  let message = "";
  const send = (line) => sock.write(line + "\r\n");

  send("220 megaform-smtp-sink ready");

  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");

    if (inData) {
      const end = buf.indexOf("\r\n.\r\n");
      if (end === -1) return;
      message += buf.slice(0, end);
      buf = buf.slice(end + 5);
      inData = false;

      const file = path.join(OUT, `mail-${Date.now()}-${++seq}.eml`);
      fs.writeFileSync(file, message, "utf8");
      const subject = (message.match(/^Subject:\s*(.*)$/im) || [, "(none)"])[1];
      const to = (message.match(/^To:\s*(.*)$/im) || [, "(none)"])[1];
      console.log(`RECEIVED  to=${to.trim()}  subject=${subject.trim()}  -> ${path.basename(file)}`);
      message = "";
      send("250 2.0.0 Ok: queued");
      return;
    }

    let idx;
    while ((idx = buf.indexOf("\r\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const verb = line.split(/\s+/)[0].toUpperCase();

      if (verb === "EHLO" || verb === "HELO") { send("250-megaform-smtp-sink"); send("250 8BITMIME"); }
      else if (verb === "MAIL" || verb === "RCPT" || verb === "RSET" || verb === "NOOP") send("250 2.1.0 Ok");
      else if (verb === "DATA") { send("354 End data with <CR><LF>.<CR><LF>"); inData = true; return; }
      else if (verb === "QUIT") { send("221 2.0.0 Bye"); sock.end(); return; }
      else send("250 2.0.0 Ok");
    }
  });

  sock.on("error", () => {});
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`smtp sink listening on 127.0.0.1:${PORT}, writing to ${OUT}`);
});
