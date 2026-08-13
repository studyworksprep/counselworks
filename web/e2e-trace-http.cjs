/**
 * TEMP diagnostic preload (remove with the instrumentation): logs the server-
 * side lifecycle of every server-action POST so the app log shows whether the
 * response for a wedged action ever finishes.
 *
 *   finish  = Node flushed the entire response body to the socket
 *   close   = the connection closed (after finish: normal; without finish:
 *             the response never completed — server-side stall confirmed)
 *
 * Loaded via NODE_OPTIONS="--require ./e2e-trace-http.cjs" in the CI e2e job.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CJS preload */
const http = require("http");

const origEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event === "request") {
    const [req, res] = args;
    const action = req.headers["next-action"];
    if (req.method === "POST" && action) {
      const id = `${action.slice(0, 8)} ${req.url}`;
      const t0 = Date.now();
      console.log(`[http] action POST start ${id}`);
      res.on("finish", () =>
        console.log(`[http] action POST finish +${Date.now() - t0}ms ${id}`),
      );
      res.on("close", () =>
        console.log(
          `[http] action POST close +${Date.now() - t0}ms finished=${res.writableFinished} ${id}`,
        ),
      );
    }
  }
  return origEmit.call(this, event, ...args);
};
